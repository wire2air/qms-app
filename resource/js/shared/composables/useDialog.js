import { ref } from 'vue'

/**
 * useDialog — open/close state for a dialog or drawer, replacing the
 * `const showXDialog = ref(false)` + `showXDialog.value = true/false` pattern
 * scattered across components. Pairs with BaseDialog/BaseDrawer's v-model.
 *
 *   const dialog = useDialog()
 *   <BaseButton @click="dialog.open()">Edit</BaseButton>
 *   <BaseDialog v-model="dialog.isOpen" title="Edit">…</BaseDialog>
 *
 * Optional onOpen/onClose hooks run on transitions (e.g. reset a form on close).
 *
 * @param {{ initial?: boolean, onOpen?: () => void, onClose?: () => void }} [opts]
 */
export function useDialog(opts = {}) {
  const isOpen = ref(opts.initial ?? false)

  function open() {
    if (isOpen.value) return
    isOpen.value = true
    opts.onOpen?.()
  }

  function close() {
    if (!isOpen.value) return
    isOpen.value = false
    opts.onClose?.()
  }

  function toggle() {
    isOpen.value ? close() : open()
  }

  return { isOpen, open, close, toggle }
}
