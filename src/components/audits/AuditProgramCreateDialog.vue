<script setup>
/**
 * Create-new-audit-program dialog.
 *
 * Posts to POST /v1/services/auditPrograms. Three cross-field rules
 * (mirroring the BE zod refines + DB CHECK constraints) gate the
 * Create button:
 *   - SUPPLIER program → supplier required, supplier hidden otherwise
 *   - EVERY_X_DAYS    → daysInterval required + numeric > 0
 *   - CUSTOM_RECURRENCE → cronExpression required + non-blank
 *
 * On success emits `created` with the new program; the parent navigates
 * to /audits/programs/<id> when the user clicked "Create & open".
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
const FREQUENCIES = [
  { id: 'ONE_TIME', name: 'One-Time' },
  { id: 'MONTHLY', name: 'Monthly' },
  { id: 'QUARTERLY', name: 'Quarterly' },
  { id: 'SEMI_ANNUAL', name: 'Semi-Annual' },
  { id: 'ANNUAL', name: 'Annual' },
  { id: 'EVERY_X_DAYS', name: 'Every X Days' },
  { id: 'CUSTOM_RECURRENCE', name: 'Custom Cron' },
]

function defaultForm() {
  return {
    name: '',
    description: '',
    programTypeId: 'INTERNAL',
    auditStandardId: null,
    frequencyId: 'ANNUAL',
    daysInterval: null,
    cronExpression: '',
    nextDueDate: '',
    managerUserId: null,
    departmentId: null,
    siteId: null,
    supplierId: null,
  }
}

const form = ref(defaultForm())
const saving = ref(false)
const saveError = ref('')
const formRef = ref(null)
// Tracks whether the user clicked "Create & open" vs "Create".
const navigateAfterSave = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = defaultForm()
      saveError.value = ''
    }
  },
)

// Cross-field gates — block save when an invariant is broken so the FE
// surfaces a clear hint before the BE 400 ever fires.
const supplierRequired = computed(() => form.value.programTypeId === 'SUPPLIER')
const daysRequired = computed(() => form.value.frequencyId === 'EVERY_X_DAYS')
const cronRequired = computed(() => form.value.frequencyId === 'CUSTOM_RECURRENCE')

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
  saving.value = true
  saveError.value = ''
  try {
    const result = await post('/v1/services/auditPrograms', {
      name: form.value.name.trim(),
      description: form.value.description?.trim() || null,
      programTypeId: form.value.programTypeId,
      auditStandardId: form.value.auditStandardId || null,
      frequencyId: form.value.frequencyId,
      daysInterval: daysRequired.value ? Number(form.value.daysInterval) : null,
      cronExpression: cronRequired.value ? form.value.cronExpression.trim() : null,
      nextDueDate: form.value.nextDueDate || null,
      managerUserId: form.value.managerUserId || null,
      departmentId: form.value.departmentId || null,
      siteId: form.value.siteId || null,
      supplierId: supplierRequired.value ? form.value.supplierId : null,
    })
    const program = result?.program
    toast.success(`Program "${program?.name}" created`)
    emit('created', program)
    close()
    if (navigateAfterSave.value && program?.id) {
      router.push(getCompanyPath(`/audits/programs/${program.id}`))
    }
  } catch (e) {
    saveError.value = e.message || 'Failed to create program'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="New Audit Program"
    maxWidth="lg"
    @update:modelValue="close"
  >
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <BaseField label="Name" required :value="form.name" :rules="[required()]">
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="form.name"
              placeholder="e.g. Annual Internal Quality Audit"
            />
          </template>
        </BaseField>

        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Type" required :value="form.programTypeId" :rules="[required()]">
            <BaseInlineSelect
              v-model="form.programTypeId"
              :items="PROGRAM_TYPES"
              :required="true"
            />
          </BaseField>
          <BaseField label="Frequency" required :value="form.frequencyId" :rules="[required()]">
            <BaseInlineSelect v-model="form.frequencyId" :items="FREQUENCIES" :required="true" />
          </BaseField>
        </div>

        <!-- Frequency-conditional fields. Hidden when the gate is off so the
             form doesn't carry stale interval / cron data into the save. -->
        <BaseField
          v-if="daysRequired"
          label="Days Interval"
          required
          hint="The daily generator will mint a new audit every N days."
          :value="form.daysInterval"
          :rules="[requiredWhen(() => daysRequired, 'Days Interval is required.')]"
        >
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="form.daysInterval"
              type="number"
              placeholder="e.g. 90"
            />
          </template>
        </BaseField>
        <BaseField
          v-if="cronRequired"
          label="Cron Expression"
          required
          :value="form.cronExpression"
          :rules="[requiredWhen(() => cronRequired, 'Cron Expression is required.')]"
        >
          <template #default="field">
            <BaseTextInput v-bind="field" v-model="form.cronExpression" placeholder="0 0 1 */3 *" />
            <p class="tw:text-caption tw:text-secondary tw:mt-1">
              Standard 5-field cron. Example: <code>0 0 1 */3 *</code> = midnight on the 1st of every
              3rd month.
            </p>
          </template>
        </BaseField>

        <!-- Standard on its own row — names like '21 CFR Part 820 (US FDA QSR)'
             don't truncate or shove the Manager chip when given full width. -->
        <BaseField label="Standard">
          <AuditStandardSelectMenu v-model="form.auditStandardId" />
        </BaseField>

        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Manager">
            <UserSelectMenu v-model="form.managerUserId" />
          </BaseField>
          <BaseField label="Department">
            <DepartmentSelectMenu v-model="form.departmentId" :siteId="form.siteId" />
          </BaseField>
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Site">
            <SiteSelectMenu v-model="form.siteId" />
          </BaseField>
          <BaseField label="Next Due">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.nextDueDate" type="date" />
            </template>
          </BaseField>
        </div>

        <BaseField
          v-if="supplierRequired"
          label="Supplier"
          required
          hint="Required for Supplier-type programs. Audits minted from this program scope to this supplier."
          :value="form.supplierId"
          :rules="[
            requiredWhen(
              () => supplierRequired,
              'Supplier is required for Supplier-type programs.',
            ),
          ]"
        >
          <SupplierSelectMenu v-model="form.supplierId" :required="true" />
        </BaseField>

        <BaseField label="Description">
          <template #default="field">
            <BaseTextarea
              v-bind="field"
              v-model="form.description"
              :rows="3"
              placeholder="Optional scope / context for this program"
            />
          </template>
        </BaseField>
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
