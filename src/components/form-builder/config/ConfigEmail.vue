<script setup>
// Email field settings. Leave the custom format blank to use the built-in
// email validation; set a regex to enforce a stricter/different format
// (e.g. only a corporate domain).
const field = defineModel('field', { type: Object, required: true })
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <BaseField
      label="Custom format (regex)"
      hint="Leave blank for standard email validation. Example: ^[^@\s]+@acme\.com$"
    >
      <BaseTextInput v-model="field.formatRegex" placeholder="standard email validation" />
    </BaseField>
  </div>
</template>
