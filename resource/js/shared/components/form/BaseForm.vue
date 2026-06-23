<script setup>
/**
 * BaseForm — the spine of the form system. A form becomes "sections + a
 * validate() function" instead of 500 bespoke lines of toast-validation and
 * hand-rolled chrome. It owns:
 *   • the submit pipeline: validate → on failure show + focus ValidationSummary
 *     and jump to the first field; on success emit `submit`
 *   • a sticky footer (StickyFormFooter) with dirty / loading / server-error state
 *   • ⌘↵ / Ctrl↵ to submit
 *   • an unsaved-changes beforeunload guard while `dirty`
 *   • mode="submit" (explicit save) vs mode="autosave" (detail pages — the
 *     footer carries an AutosaveIndicator via #footer-status instead)
 *
 * It is NOT schema-driven (DynamicForm owns that, kept separate). Fields are
 * authored in the default slot with BaseField / FormSection / BaseFieldRow.
 * Root is a <div>, not a <form> (rule #8).
 *
 *   <BaseForm :validate="validate" :dirty="isDirty" :loading="saving"
 *     :submitError="serverError" submitLabel="Raise NC"
 *     @submit="save" @cancel="goBack">
 *     <FormSection title="Basic information">…</FormSection>
 *     <FormSection title="Classification">…</FormSection>
 *   </BaseForm>
 *
 *   // validate returns [] when valid, else [{ id, label, message }]
 *   function validate() {
 *     const errs = []
 *     if (!form.title) errs.push({ id: 'nc-title', label: 'Title', message: 'Title is required.' })
 *     return errs
 *   }
 */
import ValidationSummary from './ValidationSummary.vue'
import StickyFormFooter from './StickyFormFooter.vue'

const props = defineProps({
  // 'submit' (explicit save button) | 'autosave' (status-only footer).
  mode: {
    type: String,
    default: 'submit',
    validator: (v) => ['submit', 'autosave'].includes(v),
  },
  // Returns [] when valid, else [{ id, label, message }]. Required for gating.
  validate: { type: Function, default: null },
  // Extra (e.g. server-side) field errors merged into the summary.
  errors: { type: Array, default: () => [] },
  // Has unsaved changes — drives the footer marker + the beforeunload guard.
  dirty: { type: Boolean, default: false },
  // Submit in progress.
  loading: { type: Boolean, default: false },
  // A failed save, surfaced in the footer (persistent, unlike a toast).
  submitError: { type: String, default: '' },
  // Footer config.
  submitLabel: { type: String, default: 'Save' },
  cancelLabel: { type: String, default: 'Cancel' },
  submitVariant: { type: String, default: 'primary' },
  hideFooter: { type: Boolean, default: false },
  hideCancel: { type: Boolean, default: false },
  // ⌘↵ / Ctrl↵ submits.
  submitHotkey: { type: Boolean, default: true },
  // Warn on tab-close / reload while dirty.
  guardUnsaved: { type: Boolean, default: true },
  summaryTitle: { type: String, default: '' },
})

const emit = defineEmits(['submit', 'cancel', 'invalid'])

const summaryRef = ref(null)
const attempted = ref(false)
const validationErrors = ref([])

// Shown errors = last validation run merged with caller-supplied server errors,
// de-duped by id. Only visible after a submit attempt.
const shownErrors = computed(() => {
  if (!attempted.value) return []
  const byId = new Map()
  for (const e of [...validationErrors.value, ...props.errors]) {
    if (e && e.id && !byId.has(e.id)) byId.set(e.id, e)
  }
  return [...byId.values()]
})

const isAutosave = computed(() => props.mode === 'autosave')
const submitHint = computed(() => (props.submitHotkey && !isAutosave.value ? '⌘↵' : ''))

function focusField(id) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // The id may resolve to a non-focusable container (e.g. a SegmentedControl's
  // radiogroup <div>). Fall through to its first focusable descendant.
  const FOCUSABLE = 'input,select,textarea,button,a[href],[role="radio"][tabindex="0"],[role="radio"],[tabindex]'
  const target = el.matches(FOCUSABLE) ? el : el.querySelector(FOCUSABLE)
  ;(target || el).focus?.({ preventScroll: true })
}

async function submit() {
  if (props.loading || isAutosave.value) return
  attempted.value = true
  validationErrors.value = props.validate ? props.validate() || [] : []
  if (shownErrors.value.length) {
    emit('invalid', shownErrors.value)
    await nextTick()
    summaryRef.value?.focus()
    return
  }
  emit('submit')
}

function onHotkey(e) {
  if (!props.submitHotkey || isAutosave.value) return
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    submit()
  }
}

// Once the user fixes things and re-validates clean, drop the stale summary.
watch(
  () => props.dirty,
  () => {
    if (attempted.value && !shownErrors.value.length) attempted.value = false
  },
)

// Unsaved-changes guard (tab close / reload). Route guards stay with the page
// (it owns the router); this covers the browser-level exit.
function beforeUnload(e) {
  if (props.guardUnsaved && props.dirty && !isAutosave.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

defineExpose({ submit, focusField })
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4" @keydown="onHotkey">
    <ValidationSummary
      v-if="shownErrors.length"
      ref="summaryRef"
      :errors="shownErrors"
      :title="summaryTitle"
      @jump="focusField"
    />

    <div class="tw:flex tw:flex-col tw:gap-4">
      <slot :submit="submit" />
    </div>

    <slot v-if="!hideFooter" name="footer" :submit="submit">
      <StickyFormFooter
        :submitLabel="submitLabel"
        :cancelLabel="cancelLabel"
        :submitVariant="submitVariant"
        :loading="loading"
        :dirty="dirty"
        :error="submitError"
        :hideCancel="hideCancel || isAutosave"
        :submitHint="submitHint"
        @submit="submit"
        @cancel="emit('cancel')"
      >
        <template v-if="$slots['footer-status']" #status>
          <slot name="footer-status" />
        </template>
      </StickyFormFooter>
    </slot>
  </div>
</template>
