<script setup>
/** An article's state: Draft, Published, Published + changes not yet published, Archived. */
const props = defineProps({
  status: { type: String, default: 'DRAFT' },
  pendingChanges: { type: Boolean, default: false },
})
const SCHEME_MAP = {
  DRAFT: { label: 'Draft', class: 'tw:bg-gray-100 tw:text-gray-700' },
  PUBLISHED: { label: 'Published', class: 'tw:bg-green-100 tw:text-green-700' },
  ARCHIVED: { label: 'Archived', class: 'tw:bg-gray-200 tw:text-gray-500' },
}
const scheme = computed(() => SCHEME_MAP[props.status] || SCHEME_MAP.DRAFT)
</script>

<template>
  <span class="tw:inline-flex tw:flex-wrap tw:items-center tw:gap-1 tw:whitespace-nowrap">
    <BaseBadge size="sm" :class="scheme.class">{{ scheme.label }}</BaseBadge>
    <BaseBadge
      v-if="pendingChanges"
      size="sm"
      class="tw:bg-amber-100 tw:text-amber-800"
      title="The draft has changes the live version doesn't"
      >Changes not published</BaseBadge
    >
  </span>
</template>
