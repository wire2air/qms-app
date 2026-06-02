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
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'

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
  }
}

const form = ref(defaultForm())
const saving = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) form.value = defaultForm()
  },
)

const supplierRequired = computed(() => form.value.programTypeId === 'SUPPLIER')

const canSave = computed(() => {
  if (!form.value.auditStandardId) return false
  if (!form.value.scheduledDate) return false
  if (supplierRequired.value && !form.value.supplierId) return false
  return true
})

function close() {
  emit('update:modelValue', false)
}

async function handleSave({ navigate }) {
  if (!canSave.value) {
    toast.warning('Fill the required fields first')
    return
  }
  saving.value = true
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
    })
    const auditInstance = result?.auditInstance
    toast.success(`Audit ${auditInstance?.auditNumber} created`)
    emit('created', auditInstance)
    close()
    if (navigate && auditInstance?.id) {
      router.push(getCompanyPath(`/audits/instances/${auditInstance.id}`))
    }
  } catch (e) {
    toast.error(e.message || 'Failed to create audit')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog :modelValue="modelValue" title="New Audit" maxWidth="lg" @update:modelValue="close">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <div
        class="tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:p-3 tw:text-xs tw:text-blue-800"
      >
        Ad-hoc audit — not tied to a recurring program. The daily
        generator creates program-driven audits automatically; use
        this for one-off or unscheduled audits.
      </div>

      <!-- Standard on its own row — names like '21 CFR Part 820 (US FDA QSR)'
           don't truncate or shove the Type chip when given full width. -->
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Standard <span class="tw:text-red-500">*</span>
        </p>
        <AuditStandardSelectMenu v-model="form.auditStandardId" :required="true" />
        <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
          Must have an EFFECTIVE version with at least one clause.
        </p>
      </div>

      <!-- Two short fields pair on one row. -->
      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Type <span class="tw:text-red-500">*</span>
          </p>
          <BaseInlineSelect v-model="form.programTypeId" :items="PROGRAM_TYPES" :required="true" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Scheduled Date <span class="tw:text-red-500">*</span>
          </p>
          <BaseTextInput v-model="form.scheduledDate" type="date" />
        </div>
      </div>

      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Lead Auditor</p>
          <UserSelectMenu v-model="form.leadAuditorUserId" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Team</p>
          <UserSelectMenu v-model="form.teamUserIds" :multiple="true" />
        </div>
      </div>

      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Department</p>
          <DepartmentSelectMenu v-model="form.departmentId" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Site</p>
          <SiteSelectMenu v-model="form.siteId" />
        </div>
      </div>

      <div v-if="supplierRequired">
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Supplier <span class="tw:text-red-500">*</span>
        </p>
        <SupplierSelectMenu v-model="form.supplierId" :required="true" />
      </div>

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Scope</p>
        <BaseTextarea v-model="form.scope" :rows="2" placeholder="What's in scope?" />
      </div>
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Objectives</p>
        <BaseTextarea
          v-model="form.objectives"
          :rows="2"
          placeholder="What does this audit need to produce?"
        />
      </div>
    </div>
    <template #footer>
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton
        variant="outline"
        :loading="saving"
        :disabled="saving || !canSave"
        @click="handleSave({ navigate: false })"
      >
        Create
      </BaseButton>
      <BaseButton
        variant="primary"
        :loading="saving"
        :disabled="saving || !canSave"
        @click="handleSave({ navigate: true })"
      >
        Create &amp; open
      </BaseButton>
    </template>
  </BaseDialog>
</template>
