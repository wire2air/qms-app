<script setup>
import { IconForms } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
// Complaint forms are REST-only admin config (not a synced model).
import { get } from '@/api'
import DynamicForm from '@/components/form/DynamicForm.js'

/**
 * "Submitted via <form>" panel on the ticket page — shows which public
 * form created the ticket and renders the customer's custom-field
 * answers read-only through the same DynamicForm that captured them.
 * Self-hides for tickets that didn't come from a form.
 */
const props = defineProps({
  // Agents with update permission can edit the values in place (the
  // page's deep watcher auto-saves complaint.customFields).
  editable: { type: Boolean, default: false },
  formId: { type: String, default: null },
  // The immutable definition captured at submission time — preferred
  // rendering source. The live form may have changed or been deleted
  // since; the ticket must always show what the customer actually saw.
  formSnapshot: { type: Object, default: null },
  customFields: { type: Object, default: null },
})

const emit = defineEmits(['update:customFields'])

// Legacy fallback (pre-snapshot tickets only): resolve the live form.
const form = ref(null)

watch(
  () => [props.formId, props.formSnapshot],
  async ([formId, snapshot]) => {
    form.value = null
    if (!formId || snapshot) return
    try {
      const data = await get('/v1/services/customerComplaints/forms', { showError: false })
      form.value = (data.forms ?? []).find((f) => f.id === formId) ?? null
    } catch {
      // panel is informational — fail quiet
    }
  },
  { immediate: true },
)

// Snapshot schema wins; legacy tickets fall back to the live template.
const liveSchema = useLiveQueryWithDeps(
  [() => form.value?.formTemplateId],

  async (db, [templateId]) => {
    if (!templateId) return null
    const template = await db.FormTemplate.findByPk(templateId, { force: true })
    return template?.schema ?? null
  },
  { models: ['FormTemplate'] },
)

const schema = computed(() => props.formSnapshot?.schema ?? liveSchema.value ?? null)
const formName = computed(() => props.formSnapshot?.formName ?? form.value?.name ?? null)
const formVersion = computed(() => props.formSnapshot?.version ?? null)

const hasCustomValues = computed(
  () => props.customFields && Object.keys(props.customFields).length > 0,
)

// Local editable copy bound to DynamicForm; pushed up on change so the
// ticket page's auto-save persists it.
const editValues = ref({ ...(props.customFields ?? {}) })
watch(
  () => props.customFields,
  (v) => {
    editValues.value = { ...(v ?? {}) }
  },
)
watch(
  editValues,
  (v) => {
    if (props.editable) emit('update:customFields', { ...v })
  },
  { deep: true },
)

// Schema-less tickets: simple key/value attribute editor.
const newKey = ref('')
const newValue = ref('')

function addAttribute() {
  const key = newKey.value.trim()
  if (!key) return
  emit('update:customFields', { ...(props.customFields ?? {}), [key]: newValue.value })
  newKey.value = ''
  newValue.value = ''
}

function removeAttribute(key) {
  const next = { ...(props.customFields ?? {}) }
  delete next[key]
  emit('update:customFields', next)
}
</script>

<template>
  <BaseCard v-if="formId || hasCustomValues || editable">
    <div class="tw:flex tw:items-center tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4">
      <IconForms :size="16" class="tw:text-primary" />
      <BaseText variant="overline">
        <template v-if="formId">
          Submitted via {{ formName ?? 'web form' }}
          <span v-if="formVersion" class="tw:normal-case tw:font-normal">
            (v{{ formVersion }})
          </span>
        </template>
        <template v-else>Custom attributes</template>
      </BaseText>
    </div>

    <!-- Schema-backed values: editable for agents, readonly otherwise. -->
    <DynamicForm v-if="schema && editable" v-model="editValues" :fields="schema">
      <template #footer><span /></template>
    </DynamicForm>
    <DynamicForm
      v-else-if="schema && hasCustomValues"
      :fields="schema"
      :modelValue="customFields"
      readonly
    >
      <template #footer><span /></template>
    </DynamicForm>

    <!-- Schema-less: raw key/value list (+ editor for agents). -->
    <div v-else class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="(value, key) in customFields ?? {}"
        :key="key"
        class="tw:flex tw:items-center tw:gap-3 tw:text-sm"
      >
        <span class="tw:text-secondary tw:flex-1">{{ key }}</span>
        <span class="tw:font-medium tw:text-right tw:break-all">{{
          typeof value === 'object' ? JSON.stringify(value) : value
        }}</span>
        <button
          v-if="editable"
          class="tw:text-secondary tw:hover:text-red-600"
          @click="removeAttribute(key)"
        >
          ×
        </button>
      </div>
      <div v-if="!hasCustomValues && !editable" class="tw:text-sm tw:text-secondary tw:italic">
        No additional fields were submitted.
      </div>
      <div v-if="editable" class="tw:flex tw:items-center tw:gap-2 tw:pt-1">
        <BaseTextInput v-model="newKey" placeholder="Attribute" size="sm" class="tw:w-36" />
        <BaseTextInput
          v-model="newValue"
          placeholder="Value"
          size="sm"
          class="tw:flex-1"
          @keyup.enter="addAttribute"
        />
        <BaseButton variant="outline" size="sm" :disabled="!newKey.trim()" @click="addAttribute">
          Add
        </BaseButton>
      </div>
    </div>
  </BaseCard>
</template>
