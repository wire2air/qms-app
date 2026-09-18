<script setup>
/**
 * Inline options builder for the canvas (user request 2026-08-10), shared by
 * every custom-options choice field: Multiple Choice, Checkboxes and — since
 * 2026-08-15 — Dropdown. Renders like the live control (radio / checkbox
 * glyph per row, a numbered list for a Dropdown) while everything edits in
 * place: rename an option, delete it, "+ Add option". Mutates the shared
 * field object directly, mirroring ChecklistBuilderCard.
 *
 * The choice-type switch that used to live here is gone — one answer vs
 * several is now the field-type picker beside the label.
 *
 * Only mounted for CUSTOM-options fields (see FormCanvasField): a field
 * bound to an Option Set keeps the read-only preview — the set is tenant
 * config shared across forms, and editing it inline here would silently
 * change every form that uses it.
 */
import { IconTrash } from '@tabler/icons-vue'

const props = defineProps({
  field: { type: Object, required: true },
})

// A Dropdown has no per-option glyph on the live control — its options are a
// numbered list — so it gets an index instead of a radio/checkbox mark
// (Dropdown reuses this card since 2026-08-15).
const isSelect = computed(() => props.field.type === 'select')

const glyphClass = computed(() =>
  props.field.groupType === 'checkbox'
    ? 'tw:rounded'
    : props.field.groupType === 'toggle'
      ? 'tw:rounded-full tw:w-6'
      : 'tw:rounded-full',
)

function addOption() {
  if (!Array.isArray(props.field.options)) props.field.options = []
  props.field.options.push('')
}

function removeOption(i) {
  props.field.options.splice(i, 1)
}
</script>

<template>
  <div class="tw:mt-2 tw:flex tw:flex-col tw:gap-2">
    <!-- (No label here — FormCanvasField renders the shared question header
         above this card: label, field-type picker and description. This card
         is just the option list. 2026-08-15) -->

    <!-- (No choice-type dropdown here — removed 2026-08-15. One answer vs
         several is now picked in the field-type selector beside the label,
         where "Multiple choice" and "Checkboxes" are separate entries. Two
         type controls on one card was the confusing part.) -->

    <!-- Options — editable rows that read like the live control -->
    <div class="tw:flex tw:flex-col tw:gap-1.5" @click.stop @mousedown.stop>
      <div
        v-for="(opt, i) in field.options"
        :key="i"
        class="tw:group tw:flex tw:items-center tw:gap-2"
      >
        <span
          v-if="isSelect"
          class="tw:w-4 tw:shrink-0 tw:text-xs tw:text-secondary tw:text-right tw:tabular-nums"
        >
          {{ i + 1 }}.
        </span>
        <span
          v-else
          class="tw:w-4 tw:h-4 tw:shrink-0 tw:border-2 tw:border-divider tw:bg-main"
          :class="glyphClass"
        />
        <BaseTextInput
          v-model="field.options[i]"
          size="sm"
          class="tw:flex-1"
          :placeholder="`Option ${i + 1}`"
        />
        <button
          type="button"
          class="tw:p-1 tw:rounded tw:text-secondary tw:opacity-0 tw:group-hover:opacity-100 tw:hover:text-red-500 tw:hover:bg-red-50 tw:transition-all"
          :title="`Delete option ${i + 1}`"
          @click.stop="removeOption(i)"
        >
          <IconTrash :size="14" />
        </button>
      </div>

      <!-- "Add option" reads as the NEXT row in the list, not a link below it
           (user request 2026-08-15, Google Forms parity): same glyph column,
           same spacing, muted until hovered — so the list visibly continues
           and clicking where the next option would go is what adds it. -->
      <button
        type="button"
        class="tw:group/add tw:flex tw:items-center tw:gap-2 tw:text-left tw:rounded tw:py-1 tw:-my-0.5 tw:transition-colors"
        @click.stop="addOption"
      >
        <span
          v-if="isSelect"
          class="tw:w-4 tw:shrink-0 tw:text-xs tw:text-secondary/50 tw:text-right tw:tabular-nums"
        >
          {{ (field.options?.length ?? 0) + 1 }}.
        </span>
        <span
          v-else
          class="tw:w-4 tw:h-4 tw:shrink-0 tw:border-2 tw:border-dashed tw:border-divider tw:bg-main"
          :class="glyphClass"
        />
        <span
          class="tw:text-sm tw:text-secondary tw:group-hover/add:text-primary tw:transition-colors"
        >
          Add option
        </span>
      </button>
    </div>
  </div>
</template>
