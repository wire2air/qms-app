/**
 * useConfirm — App-global confirmation dialog, mirroring useToast.
 *
 * Replaces blocking `window.confirm()` with a themed, accessible, async
 * dialog. A single <ConfirmDialogHost> (mounted once in App.vue) renders the
 * state below; `confirm()` returns a Promise<boolean> that resolves true on
 * OK, false on cancel/dismiss — so call sites keep their imperative shape:
 *
 * @example
 *   const confirm = useConfirm()
 *   if (!(await confirm({
 *     title: 'Delete rule',
 *     message: `Delete "${rule.name}"? This cannot be undone.`,
 *     okLabel: 'Delete',
 *     danger: true,
 *   }))) return
 *   await rule.delete()
 */

import { reactive } from 'vue'

/**
 * @typedef {Object} ConfirmOptions
 * @property {string} [title]
 * @property {string} [message]
 * @property {string} [okLabel='Confirm']
 * @property {string} [cancelLabel='Cancel']
 * @property {boolean} [danger=false]  Red confirm button for destructive actions.
 * @property {boolean} [persistent=false]  Disable backdrop/esc dismissal.
 */

const state = reactive({
  open: false,
  options: {},
  /** @type {((value: boolean) => void) | null} */
  resolver: null,
})

/**
 * Open the confirm dialog. Resolves true on OK, false otherwise.
 * @param {ConfirmOptions} [options]
 * @returns {Promise<boolean>}
 */
function confirm(options = {}) {
  // If a previous prompt is still open, resolve it as cancelled before reopening.
  if (state.resolver) {
    state.resolver(false)
    state.resolver = null
  }
  state.options = {
    title: options.title || '',
    message: options.message || '',
    okLabel: options.okLabel || 'Confirm',
    cancelLabel: options.cancelLabel || 'Cancel',
    okVariant: options.danger ? 'danger' : 'primary',
    persistent: options.persistent || false,
  }
  state.open = true
  return new Promise((resolve) => {
    state.resolver = resolve
  })
}

function resolveWith(value) {
  state.open = false
  if (state.resolver) {
    state.resolver(value)
    state.resolver = null
  }
}

export function useConfirm() {
  return { confirm }
}

// For the host component only.
export function useConfirmState() {
  return { state, resolveWith }
}
