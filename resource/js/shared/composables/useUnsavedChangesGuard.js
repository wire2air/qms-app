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
 * `isDirty` may be a ref or a getter. The router-bound `useUnsavedChangesGuard`
 * prompts with the in-app `useConfirm` dialog (BaseDialog) by default; pass
 * `confirm`/`message` to override. The pure `createUnsavedGuard` core falls back
 * to `window.confirm` only when no `confirm` is supplied (kept for tests).
 */
import { useConfirm } from './useConfirm.js'

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
  // Default to the in-app confirm dialog (BaseDialog via useConfirm) instead of
  // the native window.confirm, which appears as a jarring browser-chrome popup
  // when switching modules with a dirty Create form. confirmLeave() then returns
  // a Promise<boolean>, which vue-router's navigation guard awaits.
  const { confirm: confirmDialog } = useConfirm()
  const guard = createUnsavedGuard(isDirty, {
    confirm: (message) =>
      confirmDialog({
        title: 'Discard changes?',
        message,
        okLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      }),
    ...options,
  })
  // Returning false (or a Promise resolving false) from the hook aborts the nav.
  onBeforeRouteLeave(() => guard.confirmLeave())
  return guard
}
