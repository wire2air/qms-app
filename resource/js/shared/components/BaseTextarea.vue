<script setup>
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
  id: {
    type: String,
    default: '',
  },
  errorMsg: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  required: {
    type: Boolean,
    default: false,
  },
  rows: {
    type: Number,
    default: 1,
  },
  autofocus: {
    type: Boolean,
    default: false,
  },
  autosize: {
    type: Boolean,
    default: false,
  },
  inputClass: {
    type: [Object, String],
    default: '',
  },
  maxlength: {
    type: [Number, null],
    default: null,
  },
  maxRows: {
    type: [Number, null],
    default: null,
  },
  showFocusRing: {
    type: Boolean,
    default: false,
  },
})

// --- Emits ---
const emit = defineEmits(['focus', 'blur'])

const model = defineModel({ type: String, default: '' })

// --- Use ---
const slots = useSlots()

// --- Vars ---
const inputEl = ref(undefined)
const isFocused = ref(false)
// Stable id for label↔textarea pairing + aria wiring (falls back to name).
const generatedId = useId()
const inputId = computed(() => props.id || props.name || generatedId)
const errId = computed(() => `${inputId.value}-error`)

function handleFocus() {
  isFocused.value = true
  emit('focus')
}

function handleBlur() {
  isFocused.value = false
  emit('blur')
}
// --- Handlers ---
function focus() {
  inputEl.value?.focus()
}

const autosizeInput = computed(() => model.value ?? '')

if (props.autosize) {
  useTextareaAutosize({
    element: inputEl,
    input: autosizeInput,
  })
}

// --- Watchers & computed ---
const inline = computed(() => props.labelLeft || props.labelRight)

// min height allows us to have initial height determined by the rows prop
// but still allow the textarea to grow
const minHeight = computed(() => {
  if (!props.autosize) {
    return 'auto'
  }
  // first row is 40px, each additional row is 24px
  const firstRowHeight = 24
  return `${(props.rows - 1) * 24 + firstRowHeight}px`
})

const maxHeight = computed(() => {
  if (!props.autosize || !props.maxRows) return 'none'
  const firstRowHeight = 24
  return `${(props.maxRows - 1) * 24 + firstRowHeight}px`
})

// --- Lifecycle hooks & related ---
onMounted(() => {
  if (props.autofocus) {
    focus()
  }
})
defineExpose({
  inputEl,
})
</script>

<template>
  <div :class="{ 'tw:flex': inline, 'tw:flex-row-reverse': labelRight }">
    <div v-if="label || slots.label || instructions" class="tw:mb-2">
      <label
        v-if="label || slots.label"
        class="tw:text-label tw:font-medium tw:text-on-main"
        :class="{ 'tw:inline-block': inline }"
        :for="inputId"
      >
        <slot name="label">
          {{ label }}
          <span v-if="required" class="tw:text-red">*</span>
        </slot>
      </label>
      <p v-if="instructions" class="tw:text-caption tw:text-secondary tw:mb-2">
        {{ instructions }}
      </p>
    </div>
    <div
      v-if="showFocusRing"
      class="tw:relative tw:rounded-xl tw:transition-all tw:duration-300"
      :class="isFocused ? 'tw:ring-2 tw:ring-primary/20 tw:bg-main/50' : 'tw:bg-main/30'"
    >
      <textarea
        :id="id"
        ref="inputEl"
        class="tw:disabled:text-grey-5 tw:w-full tw:resize-none tw:rounded-xl tw:border-none tw:bg-transparent tw:text-sm tw:focus:ring-0 tw:focus:outline-0 tw:disabled:cursor-not-allowed tw:transition-[border,box-shadow] tw:duration-300"
        :class="inputClass"
        :name="name"
        :value="model"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-disabled="disabled"
        :required="required"
        :rows="rows"
        :style="`min-height: ${minHeight}; max-height: ${maxHeight}; overflow-y: ${maxHeight !== 'none' ? 'auto' : 'hidden'}`"
        dir="auto"
        autocomplete="off"
        :maxlength="maxlength"
        @input="model = $event.target.value"
        @focus="handleFocus"
        @blur="handleBlur"
      />
      <slot name="indicator" />
    </div>
    <textarea
      v-else
      :id="inputId"
      ref="inputEl"
      class="tw:w-full tw:resize-none tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:text-main-text tw:placeholder-main-text-muted tw:transition-[border-color,box-shadow] tw:duration-200 tw:focus:outline-none tw:focus:border-primary tw:focus:ring-2 tw:focus:ring-primary/30 tw:disabled:cursor-not-allowed tw:disabled:opacity-60 tw:disabled:bg-main-unselected tw:disabled:text-grey-5"
      :class="inputClass"
      :name="name"
      :value="model"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-disabled="disabled"
      :aria-invalid="errorMsg ? 'true' : undefined"
      :aria-describedby="errorMsg ? errId : undefined"
      :required="required"
      :rows="rows"
      :style="`min-height: ${minHeight}; max-height: ${maxHeight}; overflow-y: ${maxHeight !== 'none' ? 'auto' : 'hidden'}`"
      dir="auto"
      autocomplete="off"
      :maxlength="maxlength"
      @input="model = $event.target.value"
      @focus="handleFocus"
      @blur="handleBlur"
    />
    <BaseErrorText v-if="errorMsg" :id="errId" class="tw:mt-2">{{ errorMsg }}</BaseErrorText>
  </div>
</template>
