/**
 * useUnsavedChangesGuard — confirm before abandoning a dirty form via in-app
 * navigation. BaseForm already guards the browser-level exit (tab close /
 * reload) via beforeunload; this covers the gap it explicitly leaves to the page
 * (router navigation), so a Cancel/back/sidebar click on a half-filled form
 * doesn't silently discard the user's work.
 *
 *   const isDirty = ref(false)
 *   const { confirmLeave, allowLeave } = useUnsavedChangesGuard(isDirty)
 *
 *   function goBack() { router.push('/list') }      // route guard prompts if dirty
 *   async function onSaved(id) {
 *     allowLeave()                                  // the post-save nav must not prompt
 *     router.push(`/records/${id}`)
 *   }
 *
 * `isDirty` may be a ref or a getter. Pass `confirm`/`message` to override the
 * default window.confirm (e.g. a BaseDialog-based confirm).
 */
const DEFAULT_MESSAGE = 'You have unsaved changes. Leave this page and discard them?'

// Pure decision core — no router, fully testable.
export function createUnsavedGuard(isDirty, options = {}) {
  const confirm =
    options.confirm || ((msg) => (typeof window !== 'undefined' ? window.confirm(msg) : true))
  const message = options.message || DEFAULT_MESSAGE
  const bypass = ref(false)

  // True when it's safe to leave: not dirty, already bypassed, or user confirmed.
  function confirmLeave() {
    if (bypass.value || !toValue(isDirty)) return true
    return confirm(message)
  }

  // Permanently allow leaving — call right before a programmatic navigation that
  // should not prompt (e.g. after a successful save).
  function allowLeave() {
    bypass.value = true
  }

  return { confirmLeave, allowLeave }
}

export function useUnsavedChangesGuard(isDirty, options = {}) {
  const guard = createUnsavedGuard(isDirty, options)
  // Returning false from the hook aborts the navigation.
  onBeforeRouteLeave(() => guard.confirmLeave())
  return guard
}
