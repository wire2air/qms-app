<script setup>
import { IconForms, IconPlus, IconCopy, IconPencil, IconTrash } from '@tabler/icons-vue'
import { post } from '@/api'
import WorkflowStepFormBuilderPanel from '@/components/workflow/WorkflowStepFormBuilderPanel.vue'
import DynamicForm from '@/components/form/DynamicForm.js'

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
  roleIds: [],
  assigneeUserId: null,
  formSchema: [],
})
const form = ref(empty())
const submitting = ref(false)

// `WorkflowStepFormBuilderPanel` honors `startAtSelect` only on open. We pass
// the desired entry mode via this flag and flip it before opening the panel.
const builderOpen = ref(false)
const builderStartAtSelect = ref(false)

watch(isOpen, (open) => {
  if (open) form.value = empty()
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

async function handleSubmit() {
  if (!form.value.name || !form.value.assigneeUserId || !form.value.roleIds?.length) {
    toast.warning('Step name, at least one role, and an assignee are required')
    return
  }
  submitting.value = true
  try {
    await post(`/v1/services/capas/${props.capaId}/addChildStep`, {
      parentInstanceStepId: props.parentInstanceStepId,
      name: form.value.name,
      description: form.value.description || null,
      slaDays: form.value.slaDays || null,
      assigneeUserId: form.value.assigneeUserId,
      formSchema: form.value.formSchema || [],
      roleIds: form.value.roleIds,
    })
    isOpen.value = false
    toast.success('Child step added')
    emit('added')
  } catch (e) {
    toast.error(e.message || 'Failed to add child step')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Add Child Step" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1.5">
          Step name <span class="tw:text-red-500">*</span>
        </label>
        <BaseTextInput v-model="form.name" placeholder="e.g. Recalibrate sensor" />
      </div>
      <div>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1.5">
          Description
        </label>
        <BaseTextarea
          v-model="form.description"
          placeholder="Optional details for the assignee"
          rows="3"
        />
      </div>
      <div>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1.5">
          SLA (days)
        </label>
        <BaseTextInput
          v-model.number="form.slaDays"
          type="number"
          :min="1"
          placeholder="e.g. 5"
          inputClass="tw:w-32"
        />
      </div>
      <div>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1.5">
          Eligible roles <span class="tw:text-red-500">*</span>
        </label>
        <RoleSelectMenu v-model="form.roleIds" multiple :required="true" />
        <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
          Defines who can be assigned now and who can be reassigned later.
        </p>
      </div>
      <div>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1.5">
          Assignee <span class="tw:text-red-500">*</span>
        </label>
        <UserSelectMenu
          v-model="form.assigneeUserId"
          :required="true"
          :roleIdsFilter="form.roleIds"
        />
      </div>

      <!-- Form schema -->
      <div>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1.5">
          Form
        </label>
        <div
          v-if="!hasFormSchema"
          class="tw:border tw:border-dashed tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3"
        >
          <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
            <IconForms :size="18" class="tw:opacity-50 tw:shrink-0" />
            <span class="tw:text-sm">
              No form. The assignee just confirms the step.
            </span>
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
              <BaseButton variant="ghost" size="sm" @click="clearSchema">
                <template #icon><IconTrash :size="14" /></template>
                Remove
              </BaseButton>
            </div>
          </div>
          <div class="tw:p-4 tw:bg-main-hover/30">
            <DynamicForm :fields="form.formSchema" :modelValue="{}" readonly />
          </div>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="outline" :disabled="submitting" @click="close">Cancel</BaseButton>
      <BaseButton
        variant="primary"
        :disabled="
          !form.name || !form.assigneeUserId || !form.roleIds?.length || submitting
        "
        @click="handleSubmit"
      >
        {{ submitting ? 'Adding…' : 'Add step' }}
      </BaseButton>
    </template>
  </BaseDialog>

  <WorkflowStepFormBuilderPanel
    v-model="builderOpen"
    :initialSchema="form.formSchema"
    :startAtSelect="builderStartAtSelect"
    @save="handleSchemaSave"
  />
</template>
