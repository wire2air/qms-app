<script setup>
/**
 * New Certification Audit — the AUDITEE's create path.
 *
 * The company is being audited: an outside registrar (BSI, TÜV, NSF…) sends
 * an auditor. So the people fields are OUR side of the table — Lead POC and
 * involved people — and the auditing body is captured as plain contact text
 * (the registrar's auditor has no account here and never needs one).
 *
 * A standard reference is OPTIONAL: the auditing body works from ITS copy of
 * the standard. Picking one from our library is a nice label for lists and
 * the calendar, nothing more — there is no requirements walkthrough in the
 * auditee flow.
 *
 * Cloned from the auditor's AuditInstanceCreateDialog (2026-08-24) rather
 * than branched inside it — the flows share a table, not a UX.
 */
import { required } from '@shared/components/form/validators.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'created'])

const router = useRouter()
const toast = useToast()

function defaultForm() {
  return {
    auditStandardId: null,
    scheduledDate: '',
    siteId: null,
    departmentId: null,
    leadAuditorUserId: null,
    teamUserIds: [],
    externalAuditFirm: '',
    externalAuditorName: '',
    externalAuditorEmail: '',
    externalAuditorPhone: '',
    scope: '',
    objectives: '',
  }
}

const form = ref(defaultForm())
const saving = ref(false)
const saveError = ref('')
const formRef = ref(null)
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

function close() {
  emit('update:modelValue', false)
}

async function onValidSubmit() {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const res = await post('/v1/services/auditInstances', {
      programTypeId: 'EXTERNAL',
      auditStandardId: form.value.auditStandardId || null,
      scheduledDate: form.value.scheduledDate,
      siteId: form.value.siteId || null,
      departmentId: form.value.departmentId || null,
      leadAuditorUserId: form.value.leadAuditorUserId || null,
      teamUserIds: form.value.teamUserIds,
      externalAuditFirm: form.value.externalAuditFirm.trim() || null,
      externalAuditorName: form.value.externalAuditorName.trim() || null,
      externalAuditorEmail: form.value.externalAuditorEmail.trim() || null,
      externalAuditorPhone: form.value.externalAuditorPhone.trim() || null,
      scope: form.value.scope || null,
      objectives: form.value.objectives || null,
    })
    const instance = res?.auditInstance
    toast.success(`Certification audit ${instance?.auditNumber || ''} created`)
    emit('created', instance)
    close()
    if (navigateAfterSave.value && instance?.id) {
      router.push(getCompanyPath(`/auditee/${instance.id}`))
    }
  } catch (e) {
    saveError.value = e?.message || 'Failed to create audit'
  } finally {
    saving.value = false
  }
}

function submit(navigate) {
  navigateAfterSave.value = navigate
  formRef.value?.submit()
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="New Certification Audit"
    maxWidth="xl"
    @update:modelValue="close"
  >
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
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
          <BaseField label="Standard (optional)">
            <AuditStandardSelectMenu v-model="form.auditStandardId" />
          </BaseField>
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Site">
            <SiteSelectMenu v-model="form.siteId" />
          </BaseField>
          <BaseField label="Department">
            <DepartmentSelectMenu v-model="form.departmentId" :siteId="form.siteId" />
          </BaseField>
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Lead POC (our company)">
            <UserSelectMenu v-model="form.leadAuditorUserId" />
          </BaseField>
          <BaseField label="Involved people">
            <UserSelectMenu v-model="form.teamUserIds" :multiple="true" />
          </BaseField>
        </div>

        <!-- Who is auditing us. Free text — the registrar's auditor has no
             account in this system, and should not need one to be named. -->
        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseText variant="overline">Auditing body</BaseText>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Audit firm / registrar">
              <BaseTextInput v-model="form.externalAuditFirm" placeholder="e.g. BSI, TÜV SÜD, NSF" />
            </BaseField>
            <BaseField label="Auditor name">
              <BaseTextInput v-model="form.externalAuditorName" placeholder="Lead auditor's name" />
            </BaseField>
            <BaseField label="Auditor email">
              <BaseTextInput
                v-model="form.externalAuditorEmail"
                type="email"
                placeholder="name@registrar.com"
              />
            </BaseField>
            <BaseField label="Auditor phone">
              <BaseTextInput v-model="form.externalAuditorPhone" placeholder="+1 …" />
            </BaseField>
          </div>
        </div>

        <BaseField label="Scope">
          <BaseRichTextEditor v-model="form.scope" placeholder="What's in scope?" />
        </BaseField>
        <BaseField label="Objectives">
          <BaseRichTextEditor v-model="form.objectives" placeholder="What should this audit achieve?" />
        </BaseField>
      </div>
    </BaseForm>

    <template #footer>
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:w-full">
        <p v-if="saveError" class="tw:text-xs tw:text-red-600 tw:flex-1">{{ saveError }}</p>
        <span v-else class="tw:flex-1" />
        <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
        <BaseButton variant="outline" :disabled="saving" @click="submit(false)">Create</BaseButton>
        <BaseButton :isLoading="saving" @click="submit(true)">Create &amp; open</BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
