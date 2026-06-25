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
import { BaseFormRegistryKey } from './formContext.js'

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
// Result of the optional form-level :validate() prop, captured on submit (the
// back-compat escape hatch alongside per-field rules).
const legacyErrors = ref([])

// Per-field rules registry. Each BaseField registers a { id, label, getError,
// validate } entry; submit() runs every validate(), and fieldErrors reflects
// their live inline error so the summary shrinks as fields are fixed. The Set is
// plain (a reactive Set would auto-unwrap the entries' refs); membership changes
// bump registryVersion, and getError() tracks each field's error reactively.
const fields = new Set()
const registryVersion = ref(0)
// Collapsible FormSections register { id, open } so focusField can expand the
// section containing a jumped-to error (C1) — otherwise the control sits in a
// display:none body, invisible and unfocusable.
const sections = new Set()
provide(BaseFormRegistryKey, {
  register: (f) => (fields.add(f), registryVersion.value++),
  unregister: (f) => (fields.delete(f), registryVersion.value++),
  registerSection: (s) => sections.add(s),
  unregisterSection: (s) => sections.delete(s),
})
const fieldErrors = computed(() => {
  registryVersion.value // re-collect when fields mount/unmount
  return [...fields]
    .filter((f) => f.getError())
    .map((f) => ({ id: f.id, label: f.label, message: f.getError() }))
})

// Shown errors = live per-field rule errors + the legacy validate() run +
// caller-supplied server errors, de-duped by id. Only visible after a submit
// attempt.
const shownErrors = computed(() => {
  if (!attempted.value) return []
  const byId = new Map()
  for (const e of [...fieldErrors.value, ...legacyErrors.value, ...props.errors]) {
    if (e && e.id && !byId.has(e.id)) byId.set(e.id, e)
  }
  return [...byId.values()]
})

const isAutosave = computed(() => props.mode === 'autosave')
const submitHint = computed(() => (props.submitHotkey && !isAutosave.value ? '⌘↵' : ''))

async function focusField(id) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null
  if (!el) return
  // Expand any collapsed section that contains the target so the error and its
  // control are visible before we scroll/focus (C1). Opening an open section is
  // a no-op, so no need to test the current state.
  for (const s of sections) {
    const secEl = document.getElementById(s.id)
    if (secEl && secEl.contains(el)) s.open()
  }
  await nextTick()
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // The id may resolve to a non-focusable container (e.g. a SegmentedControl's
  // radiogroup <div>). Fall through to its first focusable descendant.
  const FOCUSABLE =
    'input,select,textarea,button,a[href],[role="radio"][tabindex="0"],[role="radio"],[tabindex]'
  const target = el.matches(FOCUSABLE) ? el : el.querySelector(FOCUSABLE)
  ;(target || el).focus?.({ preventScroll: true })
}

async function submit() {
  if (props.loading || isAutosave.value) return
  attempted.value = true
  // Run every registered field's rules (each sets its own inline error), then
  // the optional form-level validate() escape hatch.
  for (const f of fields) f.validate()
  legacyErrors.value = props.validate ? props.validate() || [] : []
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

// Once every error clears (fields re-validate live once touched), drop the
// stale summary. Driven by shownErrors so it shrinks and disappears on its own.
watch(shownErrors, (errs) => {
  if (attempted.value && !errs.length) attempted.value = false
})

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
