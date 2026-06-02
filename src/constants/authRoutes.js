/**
 * Auth-only routes — logged-in users should be redirected to dashboard.
 */
export const AUTH_ROUTES = [
  '/signin',
  '/signup',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/accept-invitation',
]

/**
 * Public/unauthorized routes that don't require authentication.
 * These routes are exempt from session expiry redirects.
 */
export const PUBLIC_ROUTES = [
  ...AUTH_ROUTES,
  '/asset-request',
  '/supplier-document',
  '/support',
]

/**
 * Check if a given path is a public route.
 * @param {string} path - The pathname to check
 * @returns {boolean}
 */
export function isPublicRoute(path) {
  return PUBLIC_ROUTES.some((publicRoute) => path.startsWith(publicRoute))
}

/**
 * Check if a given path is an auth-only route (logged-in users should be redirected away).
 * @param {string} path - The pathname to check
 * @returns {boolean}
 */
export function isAuthRoute(path) {
  return AUTH_ROUTES.some((authRoute) => path.startsWith(authRoute))
}
