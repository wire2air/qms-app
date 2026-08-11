<script setup>
/**
 * Inline Multiple Choice (optionGroup) builder for the canvas (user request
 * 2026-08-10): renders like the live control — radio / checkbox glyphs per
 * row — while everything edits in place: rename an option, delete it,
 * "+ Add option", and flip the choice type (Radio / Checkbox / Toggle)
 * inline. Mutates the shared field object directly, mirroring
 * ChecklistBuilderCard.
 *
 * Only mounted for CUSTOM-options fields (see FormCanvasField): a field
 * bound to an Option Set keeps the read-only preview — the set is tenant
 * config shared across forms, and editing it inline here would silently
 * change every form that uses it.
 */
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import { GROUP_TYPE_OPTIONS } from '@/constants/formBuilderConfig'

const props = defineProps({
  field: { type: Object, required: true },
})

const editingLabel = ref(false)

const groupTypeItems = computed(() =>
  GROUP_TYPE_OPTIONS.map((o) => ({ id: o.value, name: o.label })),
)

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
    <!-- Click-to-edit label (same affordance as leaf fields) -->
    <div>
      <BaseTextInput
        v-if="editingLabel"
        v-model="field.label"
        size="sm"
        placeholder="Field label"
        @click.stop
        @mousedown.stop
        @keyup.enter="editingLabel = false"
        @keyup.esc="editingLabel = false"
        @blur="editingLabel = false"
      />
      <div
        v-else
        class="tw:inline-flex tw:items-center tw:gap-0.5 tw:text-sm tw:font-medium tw:text-secondary tw:cursor-text tw:hover:text-primary"
        title="Click to rename"
        @click.stop="editingLabel = true"
        @mousedown.stop
      >
        {{ field.label || '(no label)' }}
        <span v-if="field.required" class="tw:text-bad">*</span>
      </div>
    </div>

    <!-- Choice type — inline, next to where its effect shows -->
    <div class="tw:flex tw:items-center tw:gap-2" @click.stop @mousedown.stop>
      <span class="tw:text-xs tw:text-secondary">Type</span>
      <BaseInlineSelect v-model="field.groupType" :items="groupTypeItems" :required="true" />
    </div>

    <!-- Options — editable rows that read like the live control -->
    <div class="tw:flex tw:flex-col tw:gap-1.5" @click.stop @mousedown.stop>
      <div
        v-for="(opt, i) in field.options"
        :key="i"
        class="tw:group tw:flex tw:items-center tw:gap-2"
      >
        <span
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

      <p v-if="!field.options?.length" class="tw:text-xs tw:text-placeholder tw:italic">
        No options yet — add at least two choices.
      </p>

      <button
        type="button"
        class="tw:self-start tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline tw:mt-0.5"
        @click.stop="addOption"
      >
        <IconPlus :size="14" />
        Add option
      </button>
    </div>
  </div>
</template>
