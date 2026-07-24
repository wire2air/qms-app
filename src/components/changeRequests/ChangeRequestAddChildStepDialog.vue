<script setup>
/**
 * Owner adds an implementation sub-task under the CR's Implementation
 * stage (or any other parent stage with allowChildSteps=true). Pre-
 * selects the seeded Task / Action form template — same UX as the
 * CAPA add-child-step dialog.
 */
import { IconForms, IconPlus, IconCopy, IconPencil, IconTrash } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import WorkflowStepFormBuilderPanel from '@/components/workflow/WorkflowStepFormBuilderPanel.vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import { db } from '@models/index'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  crId: { type: String, required: true },
  parentInstanceStepId: { type: String, required: true },
})

const emit = defineEmits(['added'])
const isOpen = defineModel({ type: Boolean, default: false })

const toast = useToast()

const empty = () => ({
  name: '',
  description: '',
  slaDays: null,
  assigneeUserId: null,
  formSchema: [],
  requireComments: false,
  requireEsignature: false,
})
const form = ref(empty())
const formRef = ref(null)
const submitting = ref(false)
const saveError = ref('')

// Inherit role gating from the parent stage so the assignee picker
// surfaces the right people (e.g. only Quality Engineers under an
// Implementation stage seeded for that role).
const parentInstanceStep = useLiveQueryWithDeps(
  [() => props.parentInstanceStepId],

  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
  { models: ['WorkflowInstanceStep'] },
)
const parentTemplateRoles = useLiveQueryWithDeps(
  [() => parentInstanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.WorkflowStepRole.where('stepId', stepId).exec()
  },

  { models: ['WorkflowStepRole'], initial: [] },
)
const parentAdHocRoles = useLiveQueryWithDeps(
  [() => props.parentInstanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.RoleOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },

  { models: ['RoleOnWorkflowInstanceStep'], initial: [] },
)
const inheritedRoleIds = computed(() => {
  const ids = new Set()
  for (const r of parentTemplateRoles.value) ids.add(r.roleId)
  for (const r of parentAdHocRoles.value) ids.add(r.roleId)
  return [...ids]
})

const builderOpen = ref(false)
const builderStartAtSelect = ref(false)

// Pre-fill formSchema with the seeded Task / Action template on open
// — same behavior as CAPA's add-child-step dialog. Full scan + JS find
// because `code` isn't an IDB index on FormTemplate.
watch(isOpen, async (open) => {
  if (!open) return
  form.value = empty()
  saveError.value = ''
  const allFormTemplates = await db.FormTemplate.where().exec()
  const taskTemplate = allFormTemplates.find((t) => t.code === 'TASK')
  if (taskTemplate?.schema && Array.isArray(taskTemplate.schema)) {
    form.value.formSchema = JSON.parse(JSON.stringify(taskTemplate.schema))
  }
})

const hasFormSchema = computed(() => (form.value.formSchema?.length ?? 0) > 0)
const fieldCountLabel = computed(() => {
  const n = form.value.formSchema?.length ?? 0
  return n === 1 ? '1 field' : `${n} fields`
})

function openBuilderBlank() {
  builderStartAtSelect.value = false
  builderOpen.value = true
}
function openBuilderFromTemplate() {
  builderStartAtSelect.value = true
  builderOpen.value = true
}
function openBuilderEdit() {
  builderStartAtSelect.value = false
  builderOpen.value = true
}
function handleSchemaSave(schema) {
  form.value.formSchema = Array.isArray(schema) ? schema : []
}
function clearSchema() {
  form.value.formSchema = []
}

async function onValidSubmit() {
  submitting.value = true
  saveError.value = ''
  try {
    await post(`/v1/services/changeRequests/${props.crId}/addChildStep`, {
      parentInstanceStepId: props.parentInstanceStepId,
      name: form.value.name,
      description: form.value.description || null,
      slaDays: form.value.slaDays || null,
      assigneeUserId: form.value.assigneeUserId,
      formSchema: form.value.formSchema || [],
      roleIds: inheritedRoleIds.value,
      requireComments: !!form.value.requireComments,
      requireEsignature: !!form.value.requireEsignature,
    })
    isOpen.value = false
    toast.success('Sub-task added')
    emit('added')
  } catch (e) {
    saveError.value = e.message || 'Failed to add sub-task'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="tw:contents">
    <BaseDialog v-model="isOpen" title="Add Implementation Sub-task" maxWidth="2xl">
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <BaseField label="Sub-task name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.name"
                placeholder="e.g. Update SOP-001, Assign training, Notify supplier"
              />
            </template>
          </BaseField>
          <BaseField label="Instructions">
            <div class="dialog-description-editor">
              <BaseRichTextEditor
                v-model="form.description"
                placeholder="What does the assignee need to do?"
              />
            </div>
          </BaseField>
          <BaseField
            label="Due within"
            help="SLA — how many business days the assignee has to complete this step once it activates."
          >
            <div class="tw:flex tw:items-center tw:gap-2">
              <BaseTextInput
                v-model.number="form.slaDays"
                type="number"
                :min="1"
                placeholder="e.g. 5"
                inputClass="tw:w-24"
              />
              <span class="tw:text-xs tw:font-medium tw:text-secondary">
                business days of activation
              </span>
            </div>
          </BaseField>
          <div class="tw:flex tw:justify-between tw:gap-6">
            <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
              <BaseSwitch v-model="form.requireComments" />
              <span class="tw:text-xs tw:font-semibold tw:text-on-main">Require Comments</span>
            </label>
            <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
              <BaseSwitch v-model="form.requireEsignature" />
              <span class="tw:text-xs tw:font-semibold tw:text-on-main">Require E-signature</span>
            </label>
          </div>
          <BaseField label="Assignee" required :value="form.assigneeUserId" :rules="[required()]">
            <template #default="field">
              <UserSelectMenu
                v-bind="field"
                v-model="form.assigneeUserId"
                :required="true"
                :roleIdsFilter="inheritedRoleIds"
              />
            </template>
          </BaseField>

          <BaseField label="Form">
            <div
              v-if="!hasFormSchema"
              class="tw:border tw:border-dashed tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3"
            >
              <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
                <IconForms :size="18" class="tw:opacity-50 tw:shrink-0" />
                <span class="tw:text-sm">No form. The assignee just confirms the step.</span>
              </div>
              <div class="tw:flex tw:flex-wrap tw:gap-2">
                <BaseButton variant="outline" size="sm" @click="openBuilderBlank">
                  <template #icon><IconPlus :size="14" /></template>
                  Build form
                </BaseButton>
                <BaseButton variant="outline" size="sm" @click="openBuilderFromTemplate">
                  <template #icon><IconCopy :size="14" /></template>
                  Use template
                </BaseButton>
              </div>
            </div>
            <div v-else class="tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
              <div
                class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-4 tw:py-2 tw:border-b tw:border-divider"
              >
                <span
                  class="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-semibold tw:bg-primary/10 tw:text-primary"
                >
                  {{ fieldCountLabel }}
                </span>
                <div class="tw:flex tw:items-center tw:gap-2">
                  <BaseButton variant="outline" size="sm" @click="openBuilderEdit">
                    <template #icon><IconPencil :size="14" /></template>
                    Edit
                  </BaseButton>
                  <BaseButton variant="transparent" size="sm" @click="clearSchema">
                    <template #icon><IconTrash :size="14" /></template>
                    Remove
                  </BaseButton>
                </div>
              </div>
              <div class="tw:p-4 tw:bg-main-hover/30">
                <DynamicForm :fields="form.formSchema" :modelValue="{}" readonly />
              </div>
            </div>
          </BaseField>
        </div>
      </BaseForm>

      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Add Sub-task"
          :loading="submitting"
          :error="saveError"
          @cancel="close"
          @submit="formRef.submit()"
        />
      </template>
    </BaseDialog>

    <WorkflowStepFormBuilderPanel
      v-model="builderOpen"
      :initialSchema="form.formSchema"
      :startAtSelect="builderStartAtSelect"
      @save="handleSchemaSave"
    />
  </div>
</template>

<style scoped>
.dialog-description-editor :deep(.rich-text-editor-content) {
  max-height: 8rem;
  overflow-y: auto;
}
</style>
