<script setup>
/**
 * ValidationSummary — one focusable, persistent list of every validation error,
 * shown at the top of a form on a failed submit. Replaces the anti-pattern of
 * firing N sequential toasts (NonconformancesCreate fired 11), which surface
 * errors one at a time, transiently, and unanchored to any field.
 *
 * Each error is a button that emits `jump` with the field id so the form can
 * scroll to + focus the offending control. The root is `role="alert"` and
 * programmatically focusable (call `.focus()` via the template ref after a
 * failed submit) so screen-reader and keyboard users land on the summary.
 *
 *   <ValidationSummary ref="summaryRef" :errors="errorList" @jump="focusField" />
 *
 *   // errorList: [{ id: 'nc-title', label: 'Title', message: 'Title is required.' }]
 *   function onSubmitInvalid(errors) {
 *     errorList.value = errors
 *     nextTick(() => summaryRef.value?.focus())
 *   }
 *   function focusField(id) {
 *     const el = document.getElementById(id)
 *     el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
 *     el?.focus({ preventScroll: true })
 *   }
 */
import { IconAlertTriangle } from '@tabler/icons-vue'

const props = defineProps({
  // [{ id, label, message }] — id is the control id to focus; label is the
  // field name (link text); message is the per-field error.
  errors: { type: Array, default: () => [] },
  // Override the auto-generated heading.
  title: { type: String, default: '' },
})

const emit = defineEmits(['jump'])

const rootEl = ref(null)
const headingId = useId()

const count = computed(() => props.errors.length)
const headingText = computed(
  () =>
    props.title ||
    `Please fix ${count.value} ${count.value === 1 ? 'issue' : 'issues'} before continuing`,
)

// Let the parent focus the summary after a failed submit.
function focus() {
  rootEl.value?.focus()
}
defineExpose({ focus })
</script>

<template>
  <div
    v-if="count"
    ref="rootEl"
    role="alert"
    tabindex="-1"
    :aria-labelledby="headingId"
    class="tw:rounded-xl tw:border tw:border-red-200 tw:bg-red-50 tw:p-4 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-red-300"
  >
    <div class="tw:flex tw:items-start tw:gap-3">
      <IconAlertTriangle :size="20" class="tw:mt-0.5 tw:shrink-0 tw:text-red-600" aria-hidden="true" />
      <div class="tw:min-w-0 tw:flex-1">
        <p :id="headingId" class="tw:text-sm tw:font-semibold tw:text-red-700">
          {{ headingText }}
        </p>
        <ul class="tw:mt-2 tw:flex tw:flex-col tw:gap-1">
          <li v-for="err in errors" :key="err.id">
            <button
              type="button"
              class="tw:text-left tw:text-sm tw:text-red-700 tw:underline tw:decoration-red-300 tw:underline-offset-2 tw:hover:decoration-red-600 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-red-300 tw:rounded"
              @click="emit('jump', err.id)"
            >
              <span class="tw:font-medium">{{ err.label }}</span>
              <span v-if="err.message"> — {{ err.message }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
