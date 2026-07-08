import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import { installPermissionGuard } from './permissionGuard'

const router = createRouter({
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes,
  history: createWebHistory(),
})

// Enforce per-route permissions (redirects unauthorized users to /no-access).
installPermissionGuard(router)

export default router
