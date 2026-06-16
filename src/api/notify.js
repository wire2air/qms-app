/**
 * Notification adapter — abstracts the notification implementation.
 *
 * The API layer emits 'notify' events via the eventBus.  A UI-framework
 * specific adapter subscribes to those events and translates them into
 * actual toast / snackbar calls.
 *
 * This file provides:
 *   1. `notify()` — internal helper used by the API layer to emit
 *   2. `registerNotifyHandler()` — called once at app boot to wire a handler
 *
 * The API layer NEVER imports Quasar, Vue, or any UI library directly.
 *
 * @example
 *   // In main.js or an app-level plugin:
 *   import { registerNotifyHandler } from '@/api'
 *   import { useToast } from '@shared/composables/useToast.js'
 *
 *   const toast = useToast()
 *   registerNotifyHandler(({ type, message }) => {
 *     toast.notify({ type, message })
 *   })
 */

import { eventBus } from './eventBus.js'

/** @type {Function|null} */
let handler = null

/**
 * Register the concrete notification implementation.
 * Called once during app initialisation.
 *
 * @param {(payload: { type: string, message: string, errors?: object }) => void} fn
 */
function registerNotifyHandler(fn) {
  // Remove previous subscription if re-registered (HMR safety)
  if (handler) {
    eventBus.on('notify', () => {}) // no-op, old ref is already replaced
  }
  handler = fn
  eventBus.on('notify', fn)
}

/**
 * Emit a notification.  Does nothing if no handler is registered.
 * Used internally by the API layer — NOT meant for direct component use.
 *
 * @param {'positive'|'negative'|'warning'|'info'} type
 * @param {string} message
 * @param {object} [extra]  e.g. { errors: { email: ['already taken'] } }
 */
function notify(type, message, extra = {}) {
  eventBus.emit('notify', { type, message, ...extra })
}

export { notify, registerNotifyHandler }
