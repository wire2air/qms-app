/**
 * useToast — App-global toast notification system.
 *
 * Uses a module-level reactive queue so toasts work everywhere,
 * including outside component setup (e.g. in main.js handlers).
 *
 * @example
 *   const toast = useToast()
 *   toast.success('Saved!')
 *   toast.error('Failed', { timeout: 5000 })
 *   toast.notify({ type: 'success', message: 'Saved!' }) // success|error|warning|info
 *   // Legacy positive/negative are still accepted and normalized to success/error.
 */

import { ValidationError } from '@syncEngine/index'
import { ref } from 'vue'

/** @type {import('vue').Ref<Array<ToastItem>>} */
const toasts = ref([])

let nextId = 0
const timers = new Map()

/**
 * @typedef {Object} ToastOptions
 * @property {'success'|'error'|'warning'|'info'|'positive'|'negative'} type  positive/negative are legacy aliases
 * @property {string} message
 * @property {string} [caption]
 * @property {'top'|'top-right'|'top-left'|'bottom'|'bottom-right'|'bottom-left'|'center'} [position='top']
 * @property {number} [timeout=3000]  0 = no auto-dismiss
 * @property {boolean} [html=false]
 * @property {boolean} [multiLine=false]
 */

/**
 * @typedef {ToastOptions & { id: number }} ToastItem
 */

/**
 * Add a toast to the queue.
 *
 * Deduped: an identical toast (same type + message + caption) already on
 * screen means the same event was reported through two paths — typically
 * the API layer's global error handler AND a component's catch block both
 * toasting one failed request. Refresh the existing toast's timer instead
 * of stacking a visual duplicate.
 *
 * @param {ToastOptions} options
 * @returns {number} toast id (for programmatic dismiss)
 */
// Legacy Quasar-shape aliases → canonical semantic types.
const TYPE_ALIAS = { positive: 'success', negative: 'error' }

function notify(options) {
  const rawType = options.type || 'info'
  const type = TYPE_ALIAS[rawType] || rawType
  const message = options.message || ''
  const caption = options.caption || ''

  const existing = toasts.value.find(
    (t) => t.type === type && t.message === message && t.caption === caption,
  )
  if (existing) {
    const timer = timers.get(existing.id)
    if (timer) clearTimeout(timer)
    const timeout = options.timeout ?? 3000
    if (timeout > 0) {
      timers.set(
        existing.id,
        setTimeout(() => dismiss(existing.id), timeout),
      )
    }
    return existing.id
  }

  const id = nextId++
  const toast = {
    id,
    type,
    message,
    caption,
    position: options.position || 'top',
    timeout: options.timeout ?? 3000,
    html: options.html || false,
    multiLine: options.multiLine || false,
  }

  toasts.value = [...toasts.value, toast]

  if (toast.timeout > 0) {
    const timer = setTimeout(() => {
      dismiss(id)
    }, toast.timeout)
    timers.set(id, timer)
  }

  return id
}

/**
 * Dismiss a specific toast by id.
 * @param {number} id
 */
function dismiss(id) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

function success(message, options = {}) {
  return notify({ ...options, type: 'success', message })
}

function error(message, options = {}) {
  if (message instanceof ValidationError) {
    message = message.errors.map((err) => `${err.field}: ${err.message}`).join('\n')
  } else if (message instanceof Error) {
    message = message.message
  }

  return notify({ ...options, type: 'error', message })
}

function warning(message, options = {}) {
  return notify({ ...options, type: 'warning', message })
}

/**
 * Dismiss all active toasts.
 */
function dismissAll() {
  for (const timer of timers.values()) {
    clearTimeout(timer)
  }
  timers.clear()
  toasts.value = []
}

export function useToast() {
  return { toasts, notify, dismiss, dismissAll, success, error, warning }
}
