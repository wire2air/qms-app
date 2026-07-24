import { ref } from 'vue'
import { markEdited } from './editTracker.js'

/**
 * observabilityHelper — wraps an instance field in a Vue ref exposed via a
 * custom getter/setter pair so Vue's reactivity tracks reads and writes for
 * template re-renders and watchers.
 *
 * The UPDATE patch is still computed by diffing against the latest IDB row at
 * save time (remote-first), but the setter additionally records the field in
 * the editTracker so hydrate() can tell "unflushed user edit" apart from
 * "stale value the server may overwrite" — writes performed BY hydrate are
 * exempt (see editTracker's hydration flag). This is what stops an in-flight
 * save response / live-query re-run from clobbering an edit made moments ago.
 *
 * `updatedAt` keeps a non-reactive code path so the server's autoUpdate
 * timestamp landing via hydrate() doesn't trigger a render storm; it is also
 * never tracked as a user edit (directSaveStrategy stamps it itself).
 *
 * @param {object} instance - The model instance.
 * @param {string} name     - Field name.
 */
export function observabilityHelper(instance, name) {
  const existing = Object.getOwnPropertyDescriptor(instance, name)
  const initialValue = existing?.value
  let updatedAtValue = initialValue
  const box = ref(initialValue)

  Object.defineProperty(instance, name, {
    enumerable: true,
    configurable: true,
    get() {
      if (name === 'updatedAt') return updatedAtValue
      return box.value
    },
    set(newVal) {
      if (name === 'updatedAt') {
        updatedAtValue = newVal
      } else {
        box.value = newVal
        markEdited(instance, name)
      }
    },
  })
}
