import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import { installPermissionGuard } from './permissionGuard'
import { installEditorTeardownGuard } from './editorTeardownGuard'

const router = createRouter({
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes,
  history: createWebHistory(),
})

// Enforce per-route permissions (redirects unauthorized users to /no-access).
installPermissionGuard(router)

// Blur the active element before navigating away — closes any open TipTap
// BubbleMenu popup cleanly first, avoiding a teardown race with the rich
// text editor's own unmount. See editorTeardownGuard.js for the full story.
installEditorTeardownGuard(router)

export default router
