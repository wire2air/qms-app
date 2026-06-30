<script setup>
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { IconX } from '@tabler/icons-vue'

// --- Props & models ---
const props = defineProps({
  label: {
    type: String,
    default: '',
  },
  labelLeft: {
    type: Boolean,
    default: false,
  },
  labelRight: {
    type: Boolean,
    default: false,
  },
  instructions: {
    type: String,
    default: '',
  },
  name: {
    type: String,
    default: '',
  },
  // Control id — pair with a <label for> (e.g. BaseField provides this).
  id: {
    type: String,
    default: undefined,
  },
  errorMsg: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    validator(value) {
      return [
        'text',
        'password',
        'email',
        'tel',
        'datetime-local',
        'date',
        'number',
        'url',
        'checkbox',
      ].includes(value)
    },
    default: 'text',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  required: {
    type: Boolean,
    default: false,
  },
  step: {
    type: [Number, String],
    default: undefined,
  },
  min: {
    type: [Number, String],
    default: undefined,
  },
  max: {
    type: [Number, String],
    default: undefined,
  },
  pattern: {
    type: String,
    default: undefined,
  },
  inputClass: {
    type: String,
    default: '',
  },
  labelWrapperClass: {
    type: String,
    default: '',
  },
  size: {
    type: String,
    validator(value) {
      return ['sm', 'md'].includes(value)
    },
    default: 'sm',
  },
  autofocus: {
    type: Boolean,
    default: false,
  },
  clearBtn: {
    type: Boolean,
    default: false,
  },
})

// --- Emits ---
defineEmits(['blur', 'focus'])

const model = defineModel({ type: [String, Number], default: '' })

// --- Use ---
const slots = useSlots()

// --- Vars ---
const inputEl = ref(null)
// Stable id for label↔input pairing + aria wiring. Falls back to `name`, then
// a generated id, so existing `label`+`name` usages get a working `for`/`id`.
const generatedId = useId()
const inputId = computed(() => props.id || props.name || generatedId)
const errId = computed(() => `${inputId.value}-error`)

// --- Handlers ---
function focus() {
  inputEl.value?.focus()
}

const showClearBtn = computed(() => {
  return props.clearBtn && Boolean(model.value)
})

function clear() {
  model.value = ''
}

// --- Watchers & computed ---
const inline = computed(() => props.labelLeft || props.labelRight)

const cssClass = computed(() => {
  let c =
    'tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:text-sm tw:text-main-text tw:placeholder-main-text-muted tw:transition-[border-color,box-shadow] tw:duration-200 tw:focus:outline-none tw:focus:border-primary tw:focus:ring-2 tw:focus:ring-primary/30 tw:disabled:cursor-not-allowed tw:disabled:opacity-60 tw:disabled:bg-main-unselected'
  if (props.size === 'sm') c += ' tw:py-1.5 tw:text-12'
  else c += ' tw:py-2.5'

  // Left padding - conditional based on icon slot
  if (slots.icon) {
    c += props.size === 'sm' ? ' tw:pl-8' : ' tw:pl-10'
  } else {
    c += ' tw:pl-3'
  }

  // Right padding - conditional based on clear button
  if (props.clearBtn) {
    c += ' tw:pr-10'
  } else {
    c += ' tw:pr-3'
  }

  if (props.inputClass) c += ' ' + props.inputClass
  return c
})

// Render the optional markdown `instructions` to sanitized HTML (links open in
// a new tab). marked + DOMPurify (project deps) — replaces the micromark dep
// and closes the unsanitized-v-html XSS gap.
const renderedInstructions = computed(() => {
  if (!props.instructions) return ''
  const html = DOMPurify.sanitize(marked.parse(props.instructions, { async: false }))
  return html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
})

// --- Lifecycle hooks & related ---
onMounted(() => {
  if (props.autofocus) {
    focus()
  }
})
defineExpose({
  inputEl,
  focus,
})
</script>

<template>
  <div :class="{ 'tw:flex tw:items-center': inline, 'tw:flex-row-reverse': labelRight }">
    <div
      v-if="label || slots.label || instructions"
      :class="labelWrapperClass ? labelWrapperClass : 'tw:mb-1'"
    >
      <label
        v-if="label || slots.label"
        class="tw:dark:text-white"
        :class="{
          'tw:inline-block': !inline,
          'tw:-mb-2': !inline && size === 'md',
          'tw:text-12': size === 'sm',
          'tw:mr-2': labelLeft,
          'tw:ml-2': labelRight,
        }"
        :for="inputId"
      >
        <slot name="label">
          {{ label }}
          <span v-if="required" class="tw:text-red">*</span>
        </slot>
      </label>
      <div
        v-if="instructions"
        class="tw:text-grey-5 tw:dark:text-grey-4 tw:max-w-none tw:dark:prose-invert [&>p>a]:tw:underline"
        :class="{
          'tw:text-14 tw:mb-4': size === 'md',
          'tw:text-12': size === 'sm',
        }"
        v-html="renderedInstructions"
      />
    </div>
    <div class="tw:relative tw:w-full">
      <div
        v-if="slots.icon"
        class="tw:pointer-events-none tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-main-text-hover tw:z-1"
        :class="{ 'tw:size-4': size === 'sm', 'tw:size-5': size === 'md' }"
      >
        <slot name="icon" />
      </div>
      <input
        :id="inputId"
        ref="inputEl"
        :class="cssClass"
        :name="name"
        :value="model"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-disabled="disabled"
        :aria-invalid="errorMsg ? 'true' : undefined"
        :aria-describedby="errorMsg ? errId : undefined"
        :type="type"
        :required="required"
        :min="min"
        :max="max"
        :step="step"
        :pattern="pattern"
        dir="auto"
        autocomplete="off"
        @input="model = $event.target.value"
        @blur="$emit('blur', $event)"
        @focus="$emit('focus', $event)"
      />
      <BaseButton
        v-if="showClearBtn"
        variant="transparent"
        class="tw:absolute tw:right-1 tw:top-1/2 tw:-translate-y-1/2"
        @click="clear"
      >
        <IconX class="tw:size-5" />
      </BaseButton>
    </div>

    <BaseErrorText v-if="errorMsg" :id="errId" class="tw:mt-2">{{ errorMsg }}</BaseErrorText>
  </div>
</template>
