<script setup>
/**
 * Ad-hoc audit creation dialog. The "one-off audit without a program"
 * path — admin schedules an audit against any EFFECTIVE standard
 * with a custom team. The daily generator is the other origin for
 * audits and bypasses this dialog.
 *
 * Required at create: standard (must have EFFECTIVE version with
 * clauses) + type + scheduled date. Lead auditor + extra team users
 * are optional and can be added later from the detail page.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { required, requiredWhen } from '@shared/components/form/validators.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'created'])

const router = useRouter()
const toast = useToast()

const PROGRAM_TYPES = [
  { id: 'INTERNAL', name: 'Internal' },
  { id: 'EXTERNAL', name: 'External / Certification' },
  { id: 'SUPPLIER', name: 'Supplier' },
]

function defaultForm() {
  return {
    auditStandardId: null,
    programTypeId: 'INTERNAL',
    scheduledDate: '',
    scope: '',
    objectives: '',
    leadAuditorUserId: null,
    departmentId: null,
    siteId: null,
    supplierId: null,
    teamUserIds: [],
    auditeeUserId: null,
  }
}

const form = ref(defaultForm())
const saving = ref(false)
const saveError = ref('')
const formRef = ref(null)
// Tracks whether the user clicked "Create & open" vs "Create".
const navigateAfterSave = ref(false)

// Admin-defined custom fields — held locally, persisted after the audit exists.
const customFieldsData = ref({})
const customFieldsRef = ref(null)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = defaultForm()
      customFieldsData.value = {}
      saveError.value = ''
    }
  },
)

const supplierRequired = computed(() => form.value.programTypeId === 'SUPPLIER')

// Switching audit type or supplier invalidates a previously-picked auditee
// (internal ↔ supplier user, or a different supplier's user) — clear it.
watch(
  () => [form.value.programTypeId, form.value.supplierId, form.value.departmentId],
  () => {
    form.value.auditeeUserId = null
  },
)

function close() {
  emit('update:modelValue', false)
}

function submitCreate() {
  navigateAfterSave.value = false
  formRef.value?.submit()
}

function submitCreateAndOpen() {
  navigateAfterSave.value = true
  formRef.value?.submit()
}

async function onValidSubmit() {
  // External custom-fields validation (not a BaseField — runs after form rules pass).
  if ((await customFieldsRef.value?.validate()) === false) {
    toast.warning('Fix the errors under Additional information before saving.')
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const result = await post('/v1/services/auditInstances', {
      auditStandardId: form.value.auditStandardId,
      programTypeId: form.value.programTypeId,
      scheduledDate: form.value.scheduledDate,
      scope: form.value.scope?.trim() || null,
      objectives: form.value.objectives?.trim() || null,
      leadAuditorUserId: form.value.leadAuditorUserId || null,
      departmentId: form.value.departmentId || null,
      siteId: form.value.siteId || null,
      supplierId: supplierRequired.value ? form.value.supplierId : null,
      teamUserIds: form.value.teamUserIds ?? [],
      auditeeUserId: form.value.auditeeUserId || null,
    })
    const auditInstance = result?.auditInstance
    // Persist custom fields against the new audit (best-effort).
    try {
      if (auditInstance?.id) await customFieldsRef.value?.persist(auditInstance.id)
    } catch (cfErr) {
      toast.warning(
        cfErr?.message ||
          'Audit created, but custom fields could not be saved — add them on the audit page',
      )
    }
    toast.success(`Audit ${auditInstance?.auditNumber} created`)
    emit('created', auditInstance)
    close()
    if (navigateAfterSave.value && auditInstance?.id) {
      router.push(getCompanyPath(`/audits/instances/${auditInstance.id}`))
    }
  } catch (e) {
    saveError.value = e.message || 'Failed to create audit'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog :modelValue="modelValue" title="New Audit" maxWidth="lg" @update:modelValue="close">
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <div
          class="tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:p-3 tw:text-xs tw:text-blue-800"
        >
          Ad-hoc audit — not tied to a recurring program. The daily generator creates program-driven
          audits automatically; use this for one-off or unscheduled audits.
        </div>

        <!-- Standard on its own row — names like '21 CFR Part 820 (US FDA QSR)'
             don't truncate or shove the Type chip when given full width. -->
        <BaseField
          label="Standard"
          required
          hint="Must have an EFFECTIVE version with at least one clause."
          :value="form.auditStandardId"
          :rules="[required()]"
        >
          <AuditStandardSelectMenu v-model="form.auditStandardId" :required="true" />
        </BaseField>

        <!-- Two short fields pair on one row. -->
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Type" required :value="form.programTypeId" :rules="[required()]">
            <BaseInlineSelect
              v-model="form.programTypeId"
              :items="PROGRAM_TYPES"
              :required="true"
            />
          </BaseField>
          <BaseField
            label="Scheduled Date"
            required
            :value="form.scheduledDate"
            :rules="[required()]"
          >
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.scheduledDate" type="date" />
            </template>
          </BaseField>
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Lead Auditor">
            <UserSelectMenu v-model="form.leadAuditorUserId" />
          </BaseField>
          <BaseField label="Team">
            <UserSelectMenu v-model="form.teamUserIds" :multiple="true" />
          </BaseField>
        </div>

        <!-- Supplier + Auditee. For a supplier audit the auditee is one of the
             SUPPLIER's users (supplier selected first); for internal audits it's
             an internal user. Both get notified + read-only audit access. -->
        <div v-if="supplierRequired" class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField
            label="Supplier"
            required
            :value="form.supplierId"
            :rules="[
              requiredWhen(() => supplierRequired, 'Supplier is required for Supplier audits.'),
            ]"
          >
            <SupplierSelectMenu v-model="form.supplierId" :required="true" />
          </BaseField>
          <BaseField>
            <template #label>
              Auditee
              <span class="tw:font-normal tw:normal-case tw:text-secondary"
                >(supplier contact)</span
              >
            </template>
            <UserSelectMenu
              v-model="form.auditeeUserId"
              kind="EXTERNAL_SUPPLIER"
              :supplierId="form.supplierId"
            />
          </BaseField>
        </div>
        <!-- Internal: Department + Auditee on one line; the auditee list is
             filtered to the chosen department. (Department is omitted for
             supplier audits — it has no meaning there.) -->
        <div v-else class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Department">
            <DepartmentSelectMenu v-model="form.departmentId" />
          </BaseField>
          <BaseField>
            <template #label>
              Auditee
              <span class="tw:font-normal tw:normal-case tw:text-secondary"
                >(notified; read-only)</span
              >
            </template>
            <UserSelectMenu v-model="form.auditeeUserId" :departmentId="form.departmentId" />
          </BaseField>
        </div>

        <BaseField label="Site">
          <SiteSelectMenu v-model="form.siteId" />
        </BaseField>

        <BaseField label="Scope">
          <template #default="field">
            <BaseTextarea
              v-bind="field"
              v-model="form.scope"
              :rows="2"
              placeholder="What's in scope?"
            />
          </template>
        </BaseField>
        <BaseField label="Objectives">
          <template #default="field">
            <BaseTextarea
              v-bind="field"
              v-model="form.objectives"
              :rows="2"
              placeholder="What does this audit need to produce?"
            />
          </template>
        </BaseField>

        <!-- Admin-defined custom fields. Self-hides when none configured. -->
        <CustomFieldsCreateSection
          ref="customFieldsRef"
          v-model="customFieldsData"
          entityType="AuditInstance"
        />
      </div>
    </BaseForm>

    <template #footer>
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="outline" :loading="saving" :disabled="saving" @click="submitCreate">
        Create
      </BaseButton>
      <BaseButton
        variant="primary"
        :loading="saving"
        :disabled="saving"
        @click="submitCreateAndOpen"
      >
        Create &amp; open
      </BaseButton>
      <BaseErrorText v-if="saveError">{{ saveError }}</BaseErrorText>
    </template>
  </BaseDialog>
</template>
