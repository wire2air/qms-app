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
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Default Settings</h2>
      <CompanyCardSaveStatus :saving="isSaving" :error="saveError" />
    </div>

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
                Training Available by Default
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
    </div>
  </div>
</template>
