<script setup>
/**
 * A boolean shown as an explicit Yes / No pair (user request 2026-08-16).
 *
 * A checkbox can only say "yes" or "nothing" — unticked reads as both "no" and
 * "nobody has looked yet". For a question QA has to answer on the record, like
 * "were samples received?", those are different facts: one is a finding, the
 * other is an open item. So the model is tri-state — true / false / null — and
 * neither button is pressed until someone answers.
 *
 * A segmented pair rather than a BaseSelect because the value is a real
 * boolean, and `false` is exactly the value select components tend to confuse
 * with "nothing selected". Real <button>s, so it is keyboard-operable.
 *
 * Clicking the pressed option clears back to null when `clearable`, which is
 * how an answer given by mistake gets taken back.
 */
defineProps({
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: true },
  yesLabel: { type: String, default: 'Yes' },
  noLabel: { type: String, default: 'No' },
})

const model = defineModel({ type: Boolean, default: null })

function pick(value, clearable) {
  if (model.value === value && clearable) {
    model.value = null
    return
  }
  model.value = value
}
</script>

<template>
  <div class="tw:inline-flex tw:rounded-full tw:bg-main-hover tw:p-0.5">
    <button
      v-for="opt in [
        { value: true, label: yesLabel },
        { value: false, label: noLabel },
      ]"
      :key="String(opt.value)"
      type="button"
      :disabled="disabled"
      :aria-pressed="model === opt.value"
      class="tw:px-3 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-bold tw:transition-colors tw:cursor-pointer tw:disabled:cursor-not-allowed tw:disabled:opacity-60"
      :class="
        model === opt.value
          ? 'tw:bg-primary tw:text-white'
          : 'tw:text-secondary tw:hover:text-primary'
      "
      @click="pick(opt.value, clearable)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
