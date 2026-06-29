<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import DynamicForm from '@/components/form/DynamicForm.js'
import { IconForms } from '@tabler/icons-vue'

const props = defineProps({ moduleKey: { type: String, required: true } })
const router = useRouter()

const template = useLiveQueryWithDeps(
  [() => props.moduleKey],
  async (db, [key]) => {
    if (!key) return null
    const list = await db.FormTemplate.where('internalName', key).exec()
    return list.find((t) => t.isModule) || null
  },
  { models: ['FormTemplate'] },
)

const title = computed(
  () => template.value?.moduleConfig?.displayName || template.value?.title || 'Module',
)
// The creator only fills the non-routed content; routed sections (Action /
// Approval) are locked at create and completed by their workflow-step assignees
// after Start.
const isRoutedSection = (f) => f.type === 'section' && f.routing && f.routing.type
const fields = computed(() => (template.value?.schema || []).filter((f) => !isRoutedSection(f)))
const hasDraftFields = computed(() => fields.value.length > 0)

const formData = ref({})
const formRef = ref(null)
const saving = ref(false)

async function create() {
  if (!template.value || saving.value) return
  const valid = await formRef.value?.validate?.()
  if (valid === false) return
  saving.value = true
  try {
    const res = await post('/v1/services/form-modules/records', {
      templateId: template.value.id,
      payload: formData.value,
    })
    const record = res?.record ?? res
    router.push(getCompanyPath(`/m/${props.moduleKey}/${record.id}`))
  } finally {
    saving.value = false
  }
}

function cancel() {
  router.push(getCompanyPath(`/m/${props.moduleKey}`))
}
</script>

<template>
  <BasePage width="narrow" :fullHeight="false">
    <PageHeader :icon="IconForms" :title="`New ${title}`" />
    <div v-if="template" class="tw:flex tw:flex-col tw:gap-4">
      <DynamicForm v-if="hasDraftFields" ref="formRef" v-model="formData" :fields="fields" />
      <!-- Read-only preview of the steps that will fire on Start. -->
      <GenericModuleWorkflowPreview :schema="template.schema" />
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" @click="cancel">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="saving" @click="create">Create</BaseButton>
      </div>
    </div>
  </BasePage>
</template>
