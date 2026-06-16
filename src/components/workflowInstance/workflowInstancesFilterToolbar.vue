<script setup>
import { IconSearch } from '@tabler/icons-vue'

const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(() => !!(filters.value.search || filters.value.statusId))

function clearAll() {
  filters.value = { ...filters.value, search: '', statusId: null }
}
</script>

<template>
  <!-- Scoped search stays in the app header (preserved placement) -->
  <SafeTeleport to="#main-header-search">
    <BaseTextInput
      v-model="filters.search"
      placeholder="Search by ID, title, or submitter…"
      class="tw:flex-1 tw:max-w-md"
    >
      <template #icon>
        <IconSearch :size="18" class="tw:text-secondary" />
      </template>
    </BaseTextInput>
  </SafeTeleport>

  <BaseFilterBar hideSearch :showClear="showClear" @clear="clearAll">
    <template #filters>
      <WorkflowInstanceStatusSelectMenu v-model="filters.statusId" />
    </template>
    <template #actions>
      <slot name="actions" />
    </template>
  </BaseFilterBar>
</template>
