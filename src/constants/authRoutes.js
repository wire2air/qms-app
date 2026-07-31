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
// Note: `/reset-esign-pin` is public but intentionally NOT an AUTH_ROUTE — the
// signer is usually still logged in when they reset, and AUTH_ROUTEs bounce
// logged-in users to the dashboard.
// `/asset-request/:token` and `/supplier-document/:token` used to live here.
// Both were retired: suppliers now read shared documents and upload requested
// files as logged-in portal users, so nothing about a supplier interaction is
// reachable without a session.
export const PUBLIC_ROUTES = [
  ...AUTH_ROUTES,
  '/reset-esign-pin',
  // Public complaint intake forms (/support/<slug>) — no session needed.
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
