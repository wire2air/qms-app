<script setup>
/**
 * "On this page" rail — h2/h3 entries emitted by DocsMarkdownArticle's
 * enhancement pass, scroll-spy highlighted by the parent view.
 */
const props = defineProps({
  items: { type: Array, default: () => [] },
  activeId: { type: String, default: null },
})

const emit = defineEmits(['select'])
</script>

<template>
  <nav v-if="props.items.length" aria-label="On this page" class="tw:flex tw:flex-col tw:gap-0.5 tw:text-sm">
    <p class="tw:mb-1 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
      On this page
    </p>
    <button
      v-for="item in props.items"
      :key="item.id"
      type="button"
      class="tw:truncate tw:rounded-md tw:px-2 tw:py-1 tw:text-left tw:transition-colors"
      :class="[
        item.depth === 3 ? 'tw:pl-5' : '',
        item.id === props.activeId
          ? 'tw:bg-main-selected tw:text-primary'
          : 'tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main',
      ]"
      @click="emit('select', item.id)"
    >
      {{ item.text }}
    </button>
  </nav>
</template>
