import { nextTick } from 'vue'

/**
 * Route guard that clears any open TipTap BubbleMenu popup before every
 * navigation.
 *
 * Works around a real teardown race in @tiptap/vue-3's BubbleMenu (used by
 * BaseRichTextEditor.vue): useEditor()'s internal onBeforeUnmount hook does a
 * DOM clone-swap then Editor.destroy() SYNCHRONOUSLY, but each BubbleMenu is a
 * tippy.js popup — a sibling of <EditorContent>, not a child of it — that
 * positions/tears down its own popup ASYNCHRONOUSLY (tippy uses
 * requestAnimationFrame internally, which a plain nextTick() microtask does
 * NOT wait out) against a live reference into editor.view. When a route
 * change unmounts a page with an open (or recently focused) rich-text
 * editor, the editor's view can be destroyed before tippy's pending
 * teardown work runs, and that later callback then dereferences an
 * already-null vnode/instance — surfacing as "Uncaught (in promise)
 * TypeError: Cannot read properties of null (reading 'insertBefore' |
 * 'parentNode' | 'type' | 'emitsOptions')" from Vue's own renderer. Because
 * the error is thrown asynchronously (not inside the route's unmount hook
 * itself), it doesn't just log — it can leave the outgoing route's
 * transition looking stuck.
 *
 * Two-part mitigation, since neither alone is reliably synchronous:
 *  1. Blur the active element (typically the ProseMirror contenteditable),
 *     which makes BubbleMenu's shouldShow return false — the "polite" path.
 *  2. Forcibly remove any [data-tippy-root] popup nodes tippy has already
 *     mounted to document.body — a hard guarantee, independent of tippy's
 *     own hide/rAF timing, that no stale popup DOM survives into the
 *     destructive clone-swap+destroy that's about to run. Removing a DOM
 *     node directly (not through Vue) can't itself throw a Vue-render
 *     error; tippy/Vue's later no-op attempts to touch the missing node are
 *     guarded by existence checks in their own teardown paths.
 */
export function installEditorTeardownGuard(router) {
  router.beforeEach(async () => {
    const active = document.activeElement
    if (active && typeof active.blur === 'function' && active !== document.body) {
      active.blur()
    }
    document.querySelectorAll('[data-tippy-root]').forEach((el) => el.remove())
    await nextTick()
  })
}
