<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const route = useRoute()

const template = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.FormTemplate.findByPk(id)
  },
  { models: ['FormTemplate'] },
)

const mode = computed(() => route.query.mode || 'details')

const breadcrumbItems = computed(() => {
  const items = [
    { label: 'Form Templates', to: getCompanyPath('/templates') },
    {
      label: template.value?.title || 'Template Details',
      to: mode.value === 'records' ? getCompanyPath(`/templates/${props.id}`) : undefined,
    },
  ]

  if (mode.value === 'records') {
    items.push({ label: 'Records' })
  }

  return items
})
</script>

<template>
  <!-- Header Title Section -->
  <SafeTeleport to="#main-header-title">
    <BaseBreadcrumbs :items="breadcrumbItems" />
  </SafeTeleport>

  <!-- Conditional Content Based on Mode -->
  <FormTemplatePageIdDetails v-if="mode === 'details'" :id="props.id" />

  <FormTemplateRecords v-else-if="mode === 'records' && template" :templateId="props.id" />
</template>
