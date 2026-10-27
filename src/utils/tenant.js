/**
 * Subdomain tenancy — read the active tenant from the browser host.
 *
 * The tenant is the first host label under VITE_ROOT_DOMAIN:
 *   acme.qability.com      → "acme"
 *   acme.localhost:5173    → "acme"   (local dev, no /etc/hosts needed)
 *   qability.com / localhost → null   (apex — public / account pages)
 *   admin.qability.com     → null     (reserved — not a tenant)
 *
 * Mirrors backend/shared/constants/tenancy.js. There is no company slug in the
 * URL path anymore; the host IS the tenant selection.
 */

// Mirror of RESERVED_SUBDOMAINS in backend/shared/constants/tenancy.js.
const RESERVED = new Set([
  'www',
  'app',
  'api',
  'auth',
  'admin',
  'static',
  'cdn',
  'assets',
  'mail',
  'status',
  'help',
  'docs',
  'portal',
  'grafana',
  'traefik',
  'dev',
  'support',
  'cms',
  'blog',
  'inbound',
  'email',
  'smtp',
  'imap',
  'pop',
  'pop3',
  'mx',
  'webmail',
  'autodiscover',
  'autoconfig',
  'ns1',
  'ns2',
  'ftp',
  'sftp',
  'vpn',
  'edge',
  'help-edge',
  'ws',
  'sync',
  'files',
  'media',
  'img',
  'images',
  'storage',
  'monitor',
  'sentry',
  'staging',
  'stage',
  'prod',
  'preview',
  'beta',
  'sandbox',
  'test',
  'qa',
  'uat',
  'login',
  'signin',
  'signup',
  'sso',
  'id',
  'account',
  'accounts',
  'billing',
  'secure',
  'www2',
  'shop',
  'store',
  'news',
  'careers',
  'jobs',
  'legal',
  'privacy',
  'terms',
  'trust',
  'security',
  'academy',
  'learn',
  'community',
  'partners',
  'events',
  'platform',
  'console',
  'dashboard',
  'internal',
  'system',
  'root',
])

export function rootDomain() {
  return (import.meta.env.VITE_ROOT_DOMAIN || 'localhost').toLowerCase()
}

/**
 * Host of the platform apex (sign-in, signup, workspace picker, /platform).
 * Defaults to the root, where tenants are `<code>.<apex>` (local, dev).
 * VITE_APP_HOST separates the two when tenants sit on the bare domain:
 * VITE_ROOT_DOMAIN=qability.com + VITE_APP_HOST=app.qability.com. Mirrors
 * appHostDomain() in backend/shared/constants/tenancy.js.
 */
export function appHost() {
  return (import.meta.env.VITE_APP_HOST || rootDomain()).toLowerCase()
}

/**
 * The tenant slug for the current host, or null on apex / reserved hosts.
 */
/**
 * The Support Desk host family: `acme.support.<apex>` beside `acme.app.<apex>`
 * (dev: `acme.support.localhost`). Mirrors supportRootDomain() in
 * backend/shared/constants/tenancy.js; VITE_SUPPORT_ROOT_DOMAIN overrides.
 */
export function supportRootDomain() {
  const override = import.meta.env.VITE_SUPPORT_ROOT_DOMAIN
  if (override) return String(override).toLowerCase()
  const root = rootDomain()
  return root.startsWith('app.') ? `support.${root.slice(4)}` : `support.${root}`
}

/** True when this tab is on the Support Desk host family. */
export function isSupportHost() {
  const host = window.location.hostname.toLowerCase()
  const sroot = supportRootDomain()
  return sroot !== rootDomain() && host.endsWith(`.${sroot}`)
}

export function currentSubdomain() {
  const host = window.location.hostname.toLowerCase() // no port
  const root = rootDomain()

  // Support host: the same tenant, served as its own product.
  if (isSupportHost()) {
    const label = host.slice(0, -(supportRootDomain().length + 1))
    if (!label || label.includes('.') || RESERVED.has(label)) return null
    return label
  }

  if (host === root || host === appHost() || !host.endsWith(`.${root}`)) return null

  const label = host.slice(0, -(root.length + 1))
  if (label.includes('.')) return null // multi-label → not a flat tenant host
  if (RESERVED.has(label)) return null

  return label
}

/**
 * Absolute origin for a tenant subdomain in the current environment,
 * preserving protocol and port. `tenantOrigin('acme')`:
 *   dev  → http://acme.localhost:5173
 *   prod → https://acme.qability.com
 */
export function tenantOrigin(code, surface = isSupportHost() ? 'support' : 'app') {
  const { protocol, port } = window.location
  const portSuffix = port ? `:${port}` : ''
  const root = surface === 'support' ? supportRootDomain() : rootDomain()
  return `${protocol}//${code}.${root}${portSuffix}`
}

/**
 * Origin of the workspace selector (the apex WorkspacePicker), preserving
 * protocol and port. Use this to send a user back from a tenant's /signin to
 * "choose a different workspace".
 *
 * Targets appHost(): the root itself locally and on dev, and `app.<domain>` in
 * production, where tenants sit on the bare domain and the bare domain is the
 * marketing site.
 *   local → http://localhost:5173
 *   dev   → https://dev.qability.net
 *   prod  → https://app.qability.com
 */
export function apexOrigin() {
  const { protocol, port } = window.location
  const portSuffix = port ? `:${port}` : ''
  return `${protocol}//${appHost()}${portSuffix}`
}

/**
 * Navigate to a tenant.
 *
 * Same-host target → plain in-app navigation (the session cookie is already
 * here). Different tenant → go through the backend auth handoff so a session
 * cookie is established on the target subdomain: /api/v1/auth/switch mints a
 * one-time token on the current host (where we're authenticated) and 302s to
 * the target host's /v1/auth/handoff. A bare cross-origin redirect wouldn't
 * carry the cookie, so this indirection is required.
 */
export function gotoTenant(code, path = '/dashboard') {
  if (code === currentSubdomain()) {
    window.location.assign(path)
  } else {
    const q = `company=${encodeURIComponent(code)}&next=${encodeURIComponent(path)}`
    window.location.assign(`/api/v1/auth/switch?${q}`)
  }
}
