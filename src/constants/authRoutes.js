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
 *
 * SEGMENT-AWARE, deliberately (RS-H-01, fixed 2026-09-08). A bare
 * `path.startsWith(publicRoute)` made `'/shared-records'.startsWith('/share')`
 * true, so the company's own "who outside this company can read our records"
 * page was treated as an unauthenticated route: App.vue took the public boot
 * branch (no `initCurrentCompany`, no sync init, no permission sync) and
 * rendered the bare public shell, and main.js's `handleSessionExpired` returned
 * early so a 401 there never redirected to /signin. Client-side navigation from
 * the sidebar worked, because bootApp() had already run on a non-matching path;
 * a typed URL, a bookmark or a hard refresh showed an empty table with no error.
 * `/support` had the same latent collision with any future `/support-*`.
 *
 * This is the form App.vue's own `isOpenRoute` has always used, three lines
 * above the call site that did not.
 *
 * @param {string} path - The pathname to check
 * @returns {boolean}
 */
export function isPublicRoute(path) {
  return PUBLIC_ROUTES.some(
    (publicRoute) => path === publicRoute || path.startsWith(`${publicRoute}/`),
  )
}

/**
 * Check if a given path is an auth-only route (logged-in users should be redirected away).
 * @param {string} path - The pathname to check
 * @returns {boolean}
 */
export function isAuthRoute(path) {
  return AUTH_ROUTES.some((authRoute) => path.startsWith(authRoute))
}
