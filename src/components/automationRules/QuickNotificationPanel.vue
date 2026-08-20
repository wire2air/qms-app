<script setup>
/**
 * The simple front door onto the automation engine.
 *
 * The engine works — a Capa / STATUS_CHANGED / NOTIFY_OWNER rule was verified
 * firing and delivering within seconds — and yet ZERO rules exist in any
 * tenant. The reason is ceremony: to say "tell QA when a CAPA closes" you had
 * to pick an object, a trigger, build an AND/OR condition tree and configure an
 * action. That is a developer's tool, and it is why nobody found notifications.
 *
 * So: pick a record type, tick the statuses that matter, choose who to tell.
 * It writes an ordinary automation_rules row — same table, same evaluator, same
 * audit trail — so the advanced builder can still open and refine it. One
 * engine, two front doors.
 *
 * ── Why this creates rather than edits ──────────────────────────────────────
 * A settings-style page that owns its rules needs to answer "who owns this row
 * once someone edits it in the advanced builder?", which means a source column
 * and round-trip logic. A door is for entering, not for representing state: the
 * rules table below already shows what exists and lets you edit or delete it.
 * That keeps this panel honest about what it is — a shortcut, not a second
 * source of truth.
 *
 * ── One rule, statuses collapsed ────────────────────────────────────────────
 * Ticking three statuses writes ONE rule whose condition is
 * `status_id IS ANY OF [...]`, not three rules. Three rules would triple the
 * list for one intention and have to be edited in three places. Split them in
 * the builder later if they need different recipients.
 */
import { IconBell } from '@tabler/icons-vue'
import { AUTOMATION_OBJECTS, OBJECT_BY_VALUE } from '@/utils/automationObjects'

const emit = defineEmits(['created'])
const toast = useToast()

const objectType = ref(AUTOMATION_OBJECTS[0]?.value ?? null)
const pickedStatuses = ref([])
const groupIds = ref([])
const userIds = ref([])
const siteIds = ref([])
const departmentIds = ref([])
const saving = ref(false)

const selected = computed(() => OBJECT_BY_VALUE[objectType.value] ?? null)

/**
 * The trigger checkboxes, derived from the record type's REAL statuses.
 *
 * Never hardcoded: "Open / Close / Reject" is not universal — a CAPA has no
 * Reject, an NC has three statuses, a Change Request has nine — and the
 * vocabularies move (Quality Event's ESCALATED was removed 2026-08-18). Every
 * object names a status lookup table, so this list follows the data.
 */
const statusOptions = useLiveQueryWithDeps(
  [() => selected.value?.statusModel],
  async (db, [modelName]) => {
    if (!modelName || !db[modelName]) return []
    const rows = await db[modelName].where().exec()
    return rows
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((r) => ({ value: r.id, label: r.name || r.id }))
  },
  { initial: [] },
)

/**
 * Scope is only offered where the record actually carries the column.
 *
 * QC lots have neither site nor department; complaints have a site but no
 * department. Offering a filter that silently matches nothing is worse than
 * offering none — the rule looks configured and never fires.
 */
const fieldKeys = computed(() => new Set((selected.value?.fields ?? []).map((f) => f.key)))
const supportsSite = computed(() => fieldKeys.value.has('site_id'))
const supportsDepartment = computed(() => fieldKeys.value.has('department_id'))

const hasRecipients = computed(() => groupIds.value.length > 0 || userIds.value.length > 0)
const canSave = computed(
  () => !!objectType.value && pickedStatuses.value.length > 0 && hasRecipients.value && !saving.value,
)

/** Reset the per-object choices when the record type changes. */
watch(objectType, () => {
  pickedStatuses.value = []
  siteIds.value = []
  departmentIds.value = []
})

/** "Notify QA when a CAPA is Closed, Cancelled" — shown before saving. */
const summary = computed(() => {
  if (!selected.value || !pickedStatuses.value.length) return ''
  const labels = pickedStatuses.value
    .map((id) => statusOptions.value.find((o) => o.value === id)?.label || id)
    .join(', ')
  return `When a ${selected.value.label} record changes to: ${labels}`
})

const createRule = useLiveMutation(async (db, payload) => {
  const rule = db.AutomationRule.create(payload)
  await rule.save()
  return rule
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    // Recipients go under `config` — evaluate_automation_rules reads
    // `action.config.groupIds`, so ids at the top level would produce a rule
    // that fires correctly and notifies nobody. Matches the advanced builder.
    const actions = []
    if (groupIds.value.length) {
      actions.push({ type: 'NOTIFY_GROUP', config: { groupIds: [...groupIds.value] } })
    }
    if (userIds.value.length) {
      actions.push({ type: 'NOTIFY_USER', config: { userIds: [...userIds.value] } })
    }

    await createRule({
      name: `Notify on ${selected.value.label} status change`,
      objectType: objectType.value,
      trigger: 'STATUS_CHANGED',
      // One condition, not an empty tree: STATUS_CHANGED alone fires on EVERY
      // transition, which would notify on the ones nobody asked about.
      conditionTree: {
        logic: 'AND',
        conditions: [{ field: 'status_id', operator: 'in', value: [...pickedStatuses.value] }],
      },
      actions,
      siteIds: supportsSite.value ? [...siteIds.value] : [],
      departmentIds: supportsDepartment.value ? [...departmentIds.value] : [],
      isActive: true,
    })

    toast.success('Notification rule created')
    pickedStatuses.value = []
    groupIds.value = []
    userIds.value = []
    siteIds.value = []
    departmentIds.value = []
    emit('created')
  } catch (e) {
    toast.error(e?.message || 'Could not create the rule')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageSection title="Quick notification" :icon="IconBell">
    <template #description>
      Tell people when a record reaches a status. Creates an ordinary rule — open it in the table
      below to add conditions.
    </template>

    <div class="tw:flex tw:flex-col tw:gap-4">
      <BaseField label="Record type">
        <BaseSelect
          v-model="objectType"
          :options="AUTOMATION_OBJECTS"
          optionLabel="label"
          optionValue="value"
          :required="true"
        />
      </BaseField>

      <BaseField label="Notify when the status becomes">
        <div v-if="statusOptions.length" class="tw:flex tw:flex-wrap tw:gap-3">
          <BaseCheckbox
            v-for="opt in statusOptions"
            :key="opt.value"
            :modelValue="pickedStatuses.includes(opt.value)"
            :label="opt.label"
            @update:modelValue="
              (on) =>
                (pickedStatuses = on
                  ? [...pickedStatuses, opt.value]
                  : pickedStatuses.filter((v) => v !== opt.value))
            "
          />
        </div>
        <BaseCaption v-else>No statuses found for this record type.</BaseCaption>
      </BaseField>

      <BaseField label="Notify">
        <NotificationCcField
          :groupIds="groupIds"
          :userIds="userIds"
          @update:groupIds="(v) => (groupIds = v)"
          @update:userIds="(v) => (userIds = v)"
        />
      </BaseField>

      <!-- Only where the record carries the column — see supportsSite above. -->
      <div v-if="supportsSite || supportsDepartment" class="tw:flex tw:flex-col tw:gap-3">
        <BaseField v-if="supportsSite" label="Only at these sites (optional)">
          <SiteSelectMenu v-model="siteIds" :multiple="true" nullLabel="All sites" />
        </BaseField>
        <BaseField v-if="supportsDepartment" label="Only in these departments (optional)">
          <DepartmentSelectMenu
            v-model="departmentIds"
            :multiple="true"
            nullLabel="All departments"
          />
        </BaseField>
      </div>

      <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
        <BaseCaption>{{ summary }}</BaseCaption>
        <BaseButton variant="primary" :disabled="!canSave" :isLoading="saving" @click="save">
          Create rule
        </BaseButton>
      </div>
    </div>
  </PageSection>
</template>
