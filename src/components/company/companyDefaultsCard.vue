<script setup>
import { currentCompany } from '@/utils/currentCompany.js'

const company = useLiveQueryWithDeps(
  [() => currentCompany.value?.id],
  async (db, [id]) => {
    if (!id) return null
    return db.Company.findByPk(id)
  },
  { models: ['Company'] },
)

const isSaving = ref(false)
const saveError = ref(null)
const isFirstChange = ref(true)

const debouncedSave = useDebounceFn(async () => {
  if (!company.value) return
  isSaving.value = true
  saveError.value = null
  try {
    await company.value.save()
  } catch (err) {
    saveError.value = err.message || 'Failed to save'
  } finally {
    isSaving.value = false
  }
}, 500)

watch(
  () => company.value?.settings,
  () => {
    if (isFirstChange.value) {
      isFirstChange.value = false
      return
    }
    debouncedSave()
  },
  { deep: true },
)

// ── Overdue reminders ───────────────────────────────────────────────────────
// UI over settings.overdueReminders, which the nightly ladder
// (send_task_overdue_notification) reads fresh on every run — a change here
// takes effect the next night with nothing to reschedule. Defaults mirror the
// worker's resolveOverdueConfig exactly, so what an admin sees when the key
// has never been written is what actually happens.
const overdue = computed(() => company.value?.settings?.overdueReminders ?? {})

function patchOverdue(patch) {
  if (!company.value?.settings) return
  company.value.settings.overdueReminders = { ...overdue.value, ...patch }
}

const overdueEnabled = computed({
  get: () => overdue.value.enabled !== false,
  set: (v) => patchOverdue({ enabled: v }),
})

const escalationDay = computed({
  get: () => overdue.value.escalationDay ?? 12,
  set: (v) => patchOverdue({ escalationDay: Number.isInteger(v) && v > 0 ? v : 12 }),
})

// Drafted while typing, committed on blur: parsing per keystroke would sort
// and de-duplicate the list under the admin's cursor ("3, 1" reordering to
// "1, 3" mid-type). The commit applies the same normalisation the worker does,
// so the field always redisplays what will actually fire.
const reminderDaysDraft = ref(null)
const reminderDaysDisplay = computed(
  () => reminderDaysDraft.value ?? (overdue.value.reminderDays ?? [3, 6, 9]).join(', '),
)
function commitReminderDays() {
  const parsed = [
    ...new Set(
      String(reminderDaysDraft.value ?? reminderDaysDisplay.value)
        .split(/[\s,;]+/)
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].sort((a, b) => a - b)
  patchOverdue({ reminderDays: parsed.length ? parsed : [3, 6, 9] })
  reminderDaysDraft.value = null
}

const approvalRuleOptions = [
  { label: 'ALL — every approver must approve', value: 'ALL' },
  { label: 'ANY — one approver is sufficient', value: 'ANY' },
]
</script>

<template>
  <div
    v-if="company && company.settings"
    class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar"
  >
    <BaseSectionHeader
      title="Default Settings"
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #actions>
        <CompanyCardSaveStatus :saving="isSaving" :error="saveError" />
      </template>
    </BaseSectionHeader>

    <div class="tw:p-6 tw:flex tw:flex-col tw:gap-8">
      <!-- Approval Workflow Defaults -->
      <div class="tw:flex tw:flex-col tw:gap-5">
        <BaseText variant="overline">Approval Workflow Defaults</BaseText>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-6">
          <BaseTextInput
            v-model.number="company.settings.defaultSla"
            label="Default SLA (days)"
            type="number"
            hint="Applied to new workflow steps"
          />
          <BaseField
            v-slot="{ id: fieldId }"
            label="Default Approval Rule"
            hint="ALL or ANY tasks required"
          >
            <select
              :id="fieldId"
              v-model="company.settings.defaultWorkflowApprovalRule"
              class="tw:w-full tw:px-3 tw:py-2 tw:text-sm tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:text-on-main tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary"
            >
              <option v-for="opt in approvalRuleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </BaseField>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-4">
          <div class="tw:flex tw:items-center tw:justify-between">
            <div>
              <div class="tw:text-sm tw:font-medium tw:text-on-sidebar">
                Require Signature by Default
              </div>
              <div class="tw:text-xs tw:text-secondary">Workflow steps require an e-signature</div>
            </div>
            <BaseSwitch v-model="company.settings.defaultWorkflowRequireSignature" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <div>
              <div class="tw:text-sm tw:font-medium tw:text-on-sidebar">
                Require Comment by Default
              </div>
              <div class="tw:text-xs tw:text-secondary">Workflow steps require a comment</div>
            </div>
            <BaseSwitch v-model="company.settings.defaultWorkflowRequireComment" />
          </div>
        </div>
      </div>

      <hr class="tw:border-divider" />

      <!-- Document Template Defaults -->
      <div class="tw:flex tw:flex-col tw:gap-5">
        <BaseText variant="overline">Document Template Defaults</BaseText>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-6">
          <BaseTextInput
            v-model.number="company.settings.defaultDocumentTemplatePeriodicReviewMonths"
            label="Periodic Review (months)"
            type="number"
            hint="How often documents are reviewed"
          />
          <BaseTextInput
            v-model.number="company.settings.defaultDocumentTemplateReviewLimitDays"
            label="Review Limit (days)"
            type="number"
            hint="Days allowed for review"
          />
          <BaseTextInput
            v-model.number="company.settings.defaultDocumentTemplateApprovalLimitDays"
            label="Approval Limit (days)"
            type="number"
            hint="Days allowed for approval"
          />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-4">
          <div class="tw:flex tw:items-center tw:justify-between">
            <div>
              <div class="tw:text-sm tw:font-medium tw:text-on-sidebar">
                Training Required by Default
              </div>
              <div class="tw:text-xs tw:text-secondary">
                New document templates include training
              </div>
            </div>
            <BaseSwitch v-model="company.settings.defaultDocumentTemplateTrainingAvailable" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <div>
              <div class="tw:text-sm tw:font-medium tw:text-on-sidebar">
                Retrain on New Version by Default
              </div>
              <div class="tw:text-xs tw:text-secondary">
                Users must complete training after version updates
              </div>
            </div>
            <BaseSwitch v-model="company.settings.defaultDocumentTemplateRetrainingOnVersion" />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between">
            <div>
              <div class="tw:text-sm tw:font-medium tw:text-on-sidebar">
                Auto Effective on Approval by Default
              </div>
              <div class="tw:text-xs tw:text-secondary">
                Documents become effective immediately upon approval
              </div>
            </div>
            <BaseSwitch v-model="company.settings.defaultDocumentTemplateAutoEffectiveOnApproval" />
          </div>
        </div>
      </div>

      <hr class="tw:border-divider" />

      <!-- Asset Request Defaults -->
      <div class="tw:flex tw:flex-col tw:gap-5">
        <BaseText variant="overline">Asset Request Defaults</BaseText>
        <BaseTextInput
          v-model.number="company.settings.defaultAssetRequestDueDays"
          label="Default Due In (days)"
          type="number"
          hint="Days from today set as due date on new asset requests"
          class="tw:max-w-xs"
        />
      </div>

      <hr class="tw:border-divider" />

      <!-- Quality Event Defaults -->
      <div class="tw:flex tw:flex-col tw:gap-5">
        <BaseText variant="overline">Quality Event Defaults</BaseText>
        <BaseTextInput
          v-model.number="company.settings.defaultQualityEventReviewSlaDays"
          label="Review Due SLA (days)"
          type="number"
          hint="Default review due date = event created date + this many days"
          class="tw:max-w-xs"
        />
      </div>

      <hr class="tw:border-divider" />

      <!-- Overdue Reminders — the nightly task ladder. Read fresh each run,
           so changes take effect the next night with nothing to reschedule. -->
      <div class="tw:flex tw:flex-col tw:gap-5">
        <BaseText variant="overline">Overdue Task Reminders</BaseText>

        <div class="tw:flex tw:items-center tw:justify-between">
          <div>
            <div class="tw:text-sm tw:font-medium tw:text-on-sidebar">Chase overdue tasks</div>
            <div class="tw:text-xs tw:text-secondary">
              Reminders to the assignee on the days below, then ONE escalation to their
              department supervisor, then silence — the escalation stays the last word.
            </div>
          </div>
          <BaseSwitch v-model="overdueEnabled" />
        </div>

        <div v-if="overdueEnabled" class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-6">
          <BaseTextInput
            :modelValue="reminderDaysDisplay"
            label="Reminder days past due"
            hint="Comma-separated, e.g. 3, 6, 9 — each sends one reminder to the assignee"
            @update:modelValue="(v) => (reminderDaysDraft = v)"
            @blur="commitReminderDays"
            @keyup.enter="commitReminderDays"
          />
          <BaseTextInput
            v-model.number="escalationDay"
            label="Escalation day"
            type="number"
            hint="Days past due when the supervisor is told — once, and nothing after"
          />
        </div>
      </div>
    </div>
  </div>
</template>
