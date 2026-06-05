/**
 * Build an in-app path. Under subdomain tenancy the tenant lives in the host
 * (acme.qability.com), not the URL path, so routes are flat and this just
 * guarantees a single leading slash. Kept as a function (rather than touching
 * ~77 call sites) so navigation reads the same everywhere; the slug-prefixing
 * it used to do is gone.
 *
 * @param {string} path  e.g. '/documents' or 'documents/123'
 * @returns {string}     e.g. '/documents'
 */
export function getCompanyPath(path) {
  if (!path) return '/'
  return path.startsWith('/') ? path : `/${path}`
}
