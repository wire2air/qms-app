<script setup>
import { IconSearch } from '@tabler/icons-vue'

const filters = defineModel('filters', {
  type: Object,
  required: true,
})

function hasItems(v) {
  return Array.isArray(v) ? v.length > 0 : !!v
}

const showClear = computed(
  () =>
    !!(
      filters.value.search ||
      hasItems(filters.value.documentTypeId) ||
      hasItems(filters.value.siteId) ||
      filters.value.statusId
    ),
)

function clearAll() {
  filters.value = {
    ...filters.value,
    search: '',
    documentTypeId: null,
    siteId: null,
    statusId: null,
  }
}
</script>

<template>
  <!-- Scoped search stays in the app header (preserved placement) -->
  <SafeTeleport to="#main-header-search">
    <BaseTextInput
      v-model="filters.search"
      name="search"
      placeholder="Search templates by name or code…"
      clearBtn
      class="tw:flex-1 tw:max-w-md"
    >
      <template #icon>
        <IconSearch :size="16" />
      </template>
    </BaseTextInput>
  </SafeTeleport>

  <BaseFilterBar hideSearch :showClear="showClear" @clear="clearAll">
    <template #filters>
      <DocumentTypeSelectMenu v-model="filters.documentTypeId" multiple />
      <SiteSelectMenu v-model="filters.siteId" :required="false" multiple />
      <FormTemplateStatusSelectMenu v-model="filters.statusId" />
    </template>
    <template #actions>
      <slot name="actions" />
    </template>
  </BaseFilterBar>
</template>
