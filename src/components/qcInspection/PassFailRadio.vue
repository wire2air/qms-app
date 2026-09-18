<script setup>
/**
 * Mutually-exclusive Pass / Fail radio pair for test-result capture (user
 * decision 2026-07-27: radios, not dropdowns). Model is the tri-state
 * valueBool — true = Pass, false = Fail, null = not answered.
 */
defineProps({ disabled: { type: Boolean, default: false } })
const model = defineModel({ type: Boolean, default: null })

// Unique group name per instance so grids of many cells don't cross-link.
const name = `pf-${crypto.randomUUID()}`

const selected = computed(() => (model.value === true ? 'PASS' : model.value === false ? 'FAIL' : null))
</script>

<template>
  <div class="tw:inline-flex tw:items-center tw:gap-3">
    <BaseRadio
      :modelValue="selected"
      value="PASS"
      :name="name"
      label="Pass"
      :disabled="disabled"
      @update:modelValue="model = true"
    />
    <BaseRadio
      :modelValue="selected"
      value="FAIL"
      :name="name"
      label="Fail"
      :disabled="disabled"
      @update:modelValue="model = false"
    />
  </div>
</template>
