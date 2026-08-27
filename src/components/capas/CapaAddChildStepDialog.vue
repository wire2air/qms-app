<script setup>
import { IconForms, IconPlus, IconCopy, IconPencil, IconTrash } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import WorkflowStepFormBuilderPanel from '@/components/workflow/WorkflowStepFormBuilderPanel.vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import { db } from '@models/index'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  capaId: { type: String, required: true },
  parentInstanceStepId: { type: String, required: true },
})

const emit = defineEmits(['added'])
const isOpen = defineModel({ type: Boolean, default: false })

const toast = useToast()

const empty = () => ({
  name: '',
  description: '',
  slaDays: null,
  dueDate: null,
  assigneeUserId: null,
  formSchema: [],
  requireComments: false,
  requireEsignature: false,
})
const form = ref(empty())
const formRef = ref(null)
const submitting = ref(false)
const saveError = ref('')

// Resolve the parent's eligible role IDs. Two pivots can carry them:
//   - Template-spawned parent (instanceStep.stepId set): roles live on
//     `WorkflowStepRole` keyed by stepId.
//   - Ad-hoc parent (stepId null, itself added via addChildStep earlier):
//     roles live on `RoleOnWorkflowInstanceStep` keyed by the instance
//     step's id.
// Read both; whichever returns rows is the source. The dialog forwards
// these ids as `roleIds` in the addChildStep payload — EMPTY is legal
// (a step whose reviewers were picked at submit has no role pool, and an
// empty pool means every active internal user).
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

// `WorkflowStepFormBuilderPanel` honors `startAtSelect` only on open. We pass
// the desired entry mode via this flag and flip it before opening the panel.
const builderOpen = ref(false)
const builderStartAtSelect = ref(false)

// Pre-select the seeded "Task / Action" form template (rich text + file
// upload) when the dialog opens. User can still clear it and pick a
// different template — or start blank — via the form picker below.
// Lookup is best-effort; if the template hasn't been seeded yet (older
// tenants that pre-date the bootstrap), the dialog opens with empty
// schema and the existing flow takes over. Full scan + JS find because
// `code` isn't a SyncEngine IDB index on FormTemplate.
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
    await post(`/v1/services/capas/${props.capaId}/addChildStep`, {
      parentInstanceStepId: props.parentInstanceStepId,
      name: form.value.name,
      description: form.value.description || null,
      slaDays: form.value.dueDate ? null : form.value.slaDays || null,
      dueDate: form.value.dueDate ? form.value.dueDate.toFormat('yyyy-LL-dd') : null,
      assigneeUserId: form.value.assigneeUserId,
      formSchema: form.value.formSchema || [],
      roleIds: inheritedRoleIds.value,
      requireComments: !!form.value.requireComments,
      requireEsignature: !!form.value.requireEsignature,
    })
    emit('added')
    isOpen.value = false
    toast.success('Task added')
  } catch (e) {
    saveError.value = e.message || 'Failed to add task'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="tw:contents">
    <BaseDialog v-model="isOpen" title="Add Tasks" maxWidth="2xl">
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <BaseField label="Step name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.name"
                placeholder="e.g. Recalibrate sensor"
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
          <!-- Days OR a date (2026-08-18). A window is right for "the assignee
               gets 5 days"; a date is right for work with a real deadline. The
               two are mutually exclusive and the date wins at activation. -->
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
                @input="form.dueDate = null"
              />
              <span class="tw:text-xs tw:font-medium tw:text-secondary">
                business days of activation
              </span>
            </div>
          </BaseField>
          <BaseField label="…or due on a specific date">
            <div class="tw:flex tw:items-center tw:gap-2">
              <BaseDateField
                v-model="form.dueDate"
                mode="date"
                clearable
                @update:modelValue="(v) => v && (form.slaDays = null)"
              />
              <span class="tw:text-xs tw:font-medium tw:text-secondary">
                Fixed calendar date (overrides the window)
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

          <!-- Form schema -->
          <BaseField label="Form">
            <div
              v-if="!hasFormSchema"
              class="tw:border tw:border-dashed tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3"
            >
              <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
                <IconForms :size="18" class="tw:opacity-50 tw:shrink-0" />
                <span class="tw:text-sm"> No form. The assignee just confirms the step. </span>
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
          submitLabel="Add task"
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
/* BaseRichTextEditor's content grows to fill its parent via flex-grow. Cap the
   inner ProseMirror surface so the dialog's description field stays
   compact — long content scrolls within the editor. */
.dialog-description-editor :deep(.rich-text-editor-content) {
  max-height: 8rem;
  overflow-y: auto;
}
</style>
