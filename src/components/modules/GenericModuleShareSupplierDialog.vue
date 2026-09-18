<script setup>
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import WorkflowStepReviewerSelect from '@/components/workflow/WorkflowStepReviewerSelect.vue'
import { formModuleFor } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  recordId: { type: String, required: true },
  templateId: { type: String, required: true },
  moduleKey: { type: String, default: '' },
})
const emit = defineEmits(['shared'])
const open = defineModel({ type: Boolean, default: false })

const template = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => (id ? db.FormTemplate.findByPk(id) : null),
  { models: ['FormTemplate'] },
)

const routedSections = computed(() =>
  (template.value?.schema || [])
    .filter((f) => f.type === 'section' && f.routing && f.routing.type)
    .sort((a, b) => (a.routing.order ?? 0) - (b.routing.order ?? 0)),
)

const moduleDescriptor = computed(() =>
  formModuleFor(
    props.moduleKey || template.value?.internalName,
    template.value?.moduleConfig?.displayName || template.value?.title || 'record',
  ),
)

// Synthetic step for the shared reviewer-picker card. isSupplierFacing makes the
// card show a supplier picker for Action steps and stay internal for Approval.
function stepFor(sec) {
  return {
    id: sec.name,
    name: sec.label || sec.name,
    stepType: sec.routing.type === 'APPROVAL' ? 'APPROVAL' : 'ACTION',
  }
}
function rolesFor(sec) {
  const r = sec.routing || {}
  if (r.roles?.length) return r.roles
  return r.assigneeRole ? [r.assigneeRole] : []
}

const supplierId = ref(null)
const selections = reactive({}) // sectionName -> userId

// Changing the supplier invalidates the supplier-user picks — clear them so the
// re-keyed cards re-default against the new supplier's users.
watch(supplierId, () => {
  for (const k of Object.keys(selections)) delete selections[k]
})

const saving = ref(false)
const error = ref('')

const firstStepHasUser = computed(() => {
  const first = routedSections.value[0]
  return first ? !!selections[first.name] : false
})
const canShare = computed(() => !!supplierId.value && firstStepHasUser.value)

async function share() {
  if (saving.value || !canShare.value) return
  error.value = ''
  saving.value = true
  try {
    const sectionAssignees = {}
    for (const sec of routedSections.value) {
      const uid = selections[sec.name]
      if (uid) sectionAssignees[sec.name] = [uid]
    }
    await post(`/v1/services/form-modules/records/${props.recordId}/share-supplier`, {
      sectionAssignees,
    })
    open.value = false
    emit('shared')
  } catch (e) {
    error.value = e?.message || 'Failed to share'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Share with supplier" maxWidth="lg">
    <div class="tw:space-y-3 tw:py-2">
      <p class="tw:text-sm tw:text-secondary">
        Pick the supplier, then assign each step — fill steps go to a supplier user, approvals stay
        with your internal reviewers.
      </p>

      <BaseField label="Supplier">
        <SupplierSelectMenu v-model="supplierId" required />
      </BaseField>

      <template v-if="supplierId">
        <WorkflowStepReviewerSelect
          v-for="(sec, i) in routedSections"
          :key="`${sec.name}:${supplierId}`"
          v-model="selections[sec.name]"
          :module="moduleDescriptor"
          :step="stepFor(sec)"
          :stepIndex="i"
          :roleIds="rolesFor(sec)"
          :isSupplierFacing="true"
          :supplierId="supplierId"
          :required="i === 0"
        />
      </template>
      <p v-else class="tw:text-xs tw:text-secondary">Select a supplier to assign the steps.</p>

      <div v-if="!routedSections.length" class="tw:text-sm tw:text-bad">
        This module has no routed sections — add section routing in the form builder first.
      </div>
      <div v-if="error" class="tw:text-sm tw:text-bad">{{ error }}</div>
    </div>
    <template #footer>
      <BaseButton variant="outline" @click="open = false">Cancel</BaseButton>
      <BaseButton variant="primary" :loading="saving" :disabled="!canShare" @click="share">
        Share with supplier
      </BaseButton>
    </template>
  </BaseDialog>
</template>
