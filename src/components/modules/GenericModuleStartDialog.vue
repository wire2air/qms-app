<script setup>
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import WorkflowStepReviewerSelect from '@/components/workflow/WorkflowStepReviewerSelect.vue'
import { formModuleFor } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  recordId: { type: String, required: true },
  templateId: { type: String, required: true },
  moduleKey: { type: String, default: '' },
})
const emit = defineEmits(['started'])
const open = defineModel({ type: Boolean, default: false })

const template = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => (id ? db.FormTemplate.findByPk(id) : null),
  { models: ['FormTemplate'] },
)

// Routed top-level sections, in order — each becomes a workflow step on Start.
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

// Synthetic step for the shared reviewer-picker card. id = section name — the
// key the backend maps onto the real synthesized step at Start.
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

const selections = reactive({}) // sectionName -> userId
const saving = ref(false)
const error = ref('')

const firstStepHasUser = computed(() => {
  const first = routedSections.value[0]
  return first ? !!selections[first.name] : false
})

async function start() {
  if (saving.value || !firstStepHasUser.value) return
  error.value = ''
  saving.value = true
  try {
    const sectionAssignees = {}
    for (const sec of routedSections.value) {
      const uid = selections[sec.name]
      if (uid) sectionAssignees[sec.name] = [uid]
    }
    await post(`/v1/services/form-modules/records/${props.recordId}/start`, { sectionAssignees })
    open.value = false
    emit('started')
  } catch (e) {
    error.value = e?.message || 'Failed to start'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Assign Step Reviewers" maxWidth="lg">
    <div class="tw:space-y-3 tw:py-2">
      <p class="tw:text-sm tw:text-secondary">
        Assign task to user for each workflow step before starting.
      </p>
      <WorkflowStepReviewerSelect
        v-for="(sec, i) in routedSections"
        :key="sec.name"
        v-model="selections[sec.name]"
        :module="moduleDescriptor"
        :step="stepFor(sec)"
        :stepIndex="i"
        :roleIds="rolesFor(sec)"
        :required="i === 0"
      />
      <div v-if="!routedSections.length" class="tw:text-sm tw:text-bad">
        This module has no routed sections — add section routing in the form builder first.
      </div>
      <div v-if="error" class="tw:text-sm tw:text-bad">{{ error }}</div>
    </div>
    <template #footer>
      <BaseButton variant="outline" @click="open = false">Cancel</BaseButton>
      <BaseButton variant="primary" :loading="saving" :disabled="!firstStepHasUser" @click="start">
        Start
      </BaseButton>
    </template>
  </BaseDialog>
</template>
