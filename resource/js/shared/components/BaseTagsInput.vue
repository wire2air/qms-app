<script setup>
/**
 * BaseTagsInput — free-text token/chip input. For ad-hoc string lists (aliases,
 * keywords, email-ish tags) where there is NO entity behind each value — that's
 * the line vs. the XSelectMenu triad (which is for SyncEngine entities). The
 * form system had no component for this.
 *
 * Type and press Enter or comma to add a tag; Backspace on an empty input
 * removes the last one. Chips reuse BaseBadge (clearable). v-model is a string[].
 * BaseField-compatible — spread the field payload onto it:
 *
 *   <BaseField label="Keywords" hint="Press Enter to add">
 *     <template #default="field">
 *       <BaseTagsInput v-bind="field" v-model="form.keywords" placeholder="Add a keyword…" />
 *     </template>
 *   </BaseField>
 */
defineOptions({ inheritAttrs: false })

const props = defineProps({
  placeholder: { type: String, default: 'Add…' },
  disabled: { type: Boolean, default: false },
  // Max number of tags (null = unlimited).
  max: { type: Number, default: null },
  // Allow the same tag twice.
  allowDuplicates: { type: Boolean, default: false },
  // Trim whitespace around each added tag.
  trim: { type: Boolean, default: true },
  size: { type: String, default: 'md' },
})

const model = defineModel({ type: Array, default: () => [] })

const draft = ref('')
const inputEl = ref(null)

const atMax = computed(() => props.max != null && model.value.length >= props.max)

function addTag() {
  let value = props.trim ? draft.value.trim() : draft.value
  if (!value) return
  if (atMax.value) return
  if (!props.allowDuplicates && model.value.includes(value)) {
    draft.value = ''
    return
  }
  model.value = [...model.value, value]
  draft.value = ''
}

function removeTag(index) {
  const next = [...model.value]
  next.splice(index, 1)
  model.value = next
}

function onKeydown(e) {
  if (props.disabled) return
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag()
  } else if (e.key === 'Backspace' && !draft.value && model.value.length) {
    e.preventDefault()
    removeTag(model.value.length - 1)
  }
}

// Click anywhere in the field focuses the text input.
function focusInput() {
  if (!props.disabled) inputEl.value?.focus()
}

const sizeClass = computed(() =>
  props.size === 'sm' ? 'tw:min-h-8 tw:gap-1 tw:p-1' : 'tw:min-h-9 tw:gap-1.5 tw:p-1.5',
)
</script>

<template>
  <div
    class="tw:flex tw:flex-wrap tw:items-center tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:transition-colors tw:focus-within:border-primary tw:focus-within:ring-2 tw:focus-within:ring-primary/30"
    :class="[sizeClass, disabled ? 'tw:cursor-not-allowed tw:opacity-60' : 'tw:cursor-text']"
    @click="focusInput"
  >
    <BaseBadge
      v-for="(tag, i) in model"
      :key="`${tag}-${i}`"
      class="tw:bg-sidebar tw:text-on-main"
      :clearable="!disabled"
      :clearLabel="`Remove ${tag}`"
      size="sm"
      @clear="removeTag(i)"
    >
      {{ tag }}
    </BaseBadge>

    <input
      ref="inputEl"
      v-bind="$attrs"
      v-model="draft"
      type="text"
      :placeholder="atMax ? '' : placeholder"
      :disabled="disabled || atMax"
      class="tw:min-w-24 tw:flex-1 tw:border-0 tw:bg-transparent tw:px-1.5 tw:py-0.5 tw:text-sm tw:text-on-main tw:outline-none tw:placeholder:text-placeholder tw:disabled:cursor-not-allowed"
      @keydown="onKeydown"
      @blur="addTag"
    />
  </div>
</template>
