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
//
// `/share/:token` reopens that door DELIBERATELY, and for a different audience.
// The retired routes were about suppliers ACTING (uploading, responding), which
// rightly needs an account. This one is about anyone READING a single record —
// a customer, an auditor, a supplier's quality lead — where requiring an
// account means creating logins for people who will never log in. Access is
// still two-factor: the link plus a code sent to the address on the share
// record. It is NOT an AUTH_ROUTE: an internal user previewing what they just
// shared must not be bounced to the dashboard.
export const PUBLIC_ROUTES = [
  ...AUTH_ROUTES,
  '/reset-esign-pin',
  // Public complaint intake forms (/support/<slug>) — no session needed.
  '/support',
  // External record share links.
  '/share',
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
