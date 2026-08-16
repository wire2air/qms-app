<script setup>
/**
 * The "+" between two document-template sections (user request 2026-08-16).
 *
 * Replaces drag-and-drop, which was removed the same day. Dragging was only
 * ever used to put a NEW section in the middle of a template — append, then
 * drag it up eight positions — and it rarely landed where the author aimed.
 * Inserting at the gap expresses that intent in one click, and `order`
 * renumbers behind it (see sectionOrder.insertSectionAt).
 *
 * Occupies exactly the 12px the list's old `space-y-3` left between cards, so
 * revealing it on hover shifts nothing. Hidden until hover or keyboard focus:
 * a "+" in every gap, always painted, would out-shout the sections themselves.
 *
 * A real <button>, so it is tabbable and fires on Enter/Space — a hover-only
 * insert would be unreachable without a mouse.
 */
import { IconPlus } from '@tabler/icons-vue'

defineProps({
  // 1-based position the new section would take. Announced, never displayed —
  // the visual is just the line and the "+".
  position: { type: Number, required: true },
})

defineEmits(['insert'])
</script>

<template>
  <button
    type="button"
    class="tw:group tw:relative tw:w-full tw:h-3 tw:flex tw:items-center tw:bg-transparent tw:border-0 tw:p-0 tw:cursor-pointer"
    :aria-label="`Insert a section at position ${position}`"
    :title="`Insert a section at position ${position}`"
    @click="$emit('insert')"
  >
    <span
      class="tw:flex tw:items-center tw:w-full tw:opacity-0 tw:group-hover:opacity-100 tw:group-focus-visible:opacity-100 tw:transition-opacity"
    >
      <span class="tw:flex-1 tw:h-px tw:bg-primary/40" />
      <span
        class="tw:mx-2 tw:shrink-0 tw:flex tw:items-center tw:justify-center tw:w-5 tw:h-5 tw:rounded-full tw:bg-primary tw:text-white"
      >
        <IconPlus :size="12" />
      </span>
      <span class="tw:flex-1 tw:h-px tw:bg-primary/40" />
    </span>
  </button>
</template>
