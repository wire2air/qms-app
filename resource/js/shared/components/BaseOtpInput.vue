<script setup>
// Segmented OTP-style input. Renders `length` single-character boxes and keeps
// the v-model in sync with the concatenated value. Accepts uppercase
// alphanumeric characters by default (e.g. invitation codes like "ABX12A99").
const props = defineProps({
  length: { type: Number, default: 6 },
  disabled: { type: Boolean, default: false },
  errorMsg: { type: String, default: '' },
  // Restricts allowed characters. 'alnum' → A-Z0-9 (uppercased), 'numeric' → 0-9.
  charset: {
    type: String,
    default: 'alnum',
    validator: (v) => ['alnum', 'numeric'].includes(v),
  },
})

const modelValue = defineModel({ type: String, default: '' })

const allowed = computed(() => (props.charset === 'numeric' ? /[^0-9]/g : /[^A-Z0-9]/g))

function sanitize(raw) {
  let s = String(raw ?? '')
  if (props.charset !== 'numeric') s = s.toUpperCase()
  return s.replace(allowed.value, '')
}

const cells = ref(Array.from({ length: props.length }, () => ''))
const inputs = ref([])

// Keep cells in sync when the model is set/cleared externally (e.g. form reset).
watch(
  modelValue,
  (val) => {
    const chars = sanitize(val).slice(0, props.length).split('')
    const next = Array.from({ length: props.length }, (_, i) => chars[i] || '')
    if (next.join('') !== cells.value.join('')) cells.value = next
  },
  { immediate: true },
)

function emitValue() {
  modelValue.value = cells.value.join('')
}

function focusCell(i) {
  const el = inputs.value[i]
  if (el) {
    el.focus()
    el.select?.()
  }
}

function onInput(i, event) {
  const cleaned = sanitize(event.target.value)
  if (!cleaned) {
    // Rejected character (or cleared) — keep the box empty.
    cells.value[i] = ''
    event.target.value = ''
    emitValue()
    return
  }
  // Take the last typed character so retyping over a filled box works.
  cells.value[i] = cleaned[cleaned.length - 1]
  event.target.value = cells.value[i]
  emitValue()
  if (i < props.length - 1) focusCell(i + 1)
}

function onKeydown(i, event) {
  if (event.key === 'Backspace') {
    if (cells.value[i]) {
      cells.value[i] = ''
      emitValue()
    } else if (i > 0) {
      cells.value[i - 1] = ''
      emitValue()
      focusCell(i - 1)
    }
    event.preventDefault()
  } else if (event.key === 'ArrowLeft' && i > 0) {
    focusCell(i - 1)
    event.preventDefault()
  } else if (event.key === 'ArrowRight' && i < props.length - 1) {
    focusCell(i + 1)
    event.preventDefault()
  }
}

function onPaste(i, event) {
  event.preventDefault()
  const pasted = sanitize(event.clipboardData?.getData('text'))
  if (!pasted) return
  const chars = pasted.split('')
  let idx = i
  for (const ch of chars) {
    if (idx >= props.length) break
    cells.value[idx] = ch
    idx += 1
  }
  emitValue()
  focusCell(Math.min(idx, props.length - 1))
}
</script>

<template>
  <div>
    <div class="tw:flex tw:gap-2">
      <input
        v-for="(cell, i) in cells"
        :key="i"
        :ref="(el) => (inputs[i] = el)"
        :value="cell"
        type="text"
        inputmode="text"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        maxlength="1"
        :disabled="disabled"
        :aria-label="`Character ${i + 1}`"
        :aria-invalid="errorMsg ? 'true' : undefined"
        :class="[
          'tw:size-11 tw:rounded-lg tw:border tw:bg-sidebar tw:text-center tw:text-lg tw:font-semibold tw:uppercase tw:text-main-text tw:transition-[border-color,box-shadow] tw:duration-200 tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/30 tw:disabled:cursor-not-allowed tw:disabled:opacity-60 tw:disabled:bg-main-unselected',
          errorMsg ? 'tw:border-red-500 tw:focus:border-red-500' : 'tw:border-divider tw:focus:border-primary',
        ]"
        @input="onInput(i, $event)"
        @keydown="onKeydown(i, $event)"
        @paste="onPaste(i, $event)"
      />
    </div>
    <BaseErrorText v-if="errorMsg" class="tw:mt-2">{{ errorMsg }}</BaseErrorText>
  </div>
</template>
