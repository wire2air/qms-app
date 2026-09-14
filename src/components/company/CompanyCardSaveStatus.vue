<script setup>
// Autosave status for a company-settings card header.
//
// A failed save used to render only "Save failed", with the reason hidden in a
// `title` tooltip — unreachable on touch devices and silent to screen readers.
// The reason is the part the admin needs: the cards save over GraphQL, where
// RLS decides, so the usual failure is an authorisation refusal that nothing
// else on the page explains.
const props = defineProps({
  saving: { type: Boolean, default: false },
  error: { type: String, default: null },
})

// PostGraphile's wording when RLS filters an UPDATE down to zero rows — the
// shape a permission refusal takes on this path. Translated, because the raw
// text ("No values were updated in collection 'companies'…") reads like a bug.
const RLS_ZERO_ROWS = /No values were updated in collection/i

const reason = computed(() => {
  if (!props.error) return ''
  if (RLS_ZERO_ROWS.test(props.error)) return "you don't have permission to change these settings"
  return props.error
})
</script>

<template>
  <div class="tw:text-xs" role="status">
    <span v-if="saving" class="tw:text-secondary">Saving…</span>
    <span
      v-else-if="error"
      class="tw:inline-block tw:max-w-xs tw:truncate tw:align-bottom tw:text-red-600"
      :title="error"
    >
      Save failed — {{ reason }}
    </span>
  </div>
</template>
