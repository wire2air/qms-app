<script setup>
// Email field built on BaseTextInput (type=email): native email semantics and
// it inherits the form validator's inline error display (keyed by `name`). The
// actual rules — built-in email check, or a custom format regex set on the
// field — are applied by the form layer (DynamicForm) / a BaseField :rules.
defineOptions({ inheritAttrs: false })
const model = defineModel({ type: [String, Number], default: '' })
</script>

<template>
  <BaseTextInput v-model="model" type="email" placeholder="name@example.com" v-bind="$attrs" />
</template>
