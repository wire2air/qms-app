/**
 * siteDependencies.js — what a site is holding up, and how to say so.
 *
 * The delete confirm used to read *"This cannot be undone."* about a SOFT
 * delete, and queried nothing before firing: a site backing hundreds of
 * records went on one click, and every one of those records then rendered a
 * blank site field. Both halves are wrong in opposite directions — the copy
 * overstates the permanence and understates the blast radius.
 *
 * These functions are pure so the guard can be tested without IndexedDB; the
 * component supplies `db`.
 */

/**
 * Client models carrying a `siteId` (or a site pivot row), in the order a user
 * would want to hear about them: people first, then structure, then records.
 *
 * Every entry is best-effort: countSiteDependencies skips a model this build
 * doesn't register rather than failing, because a missing model must never be
 * the reason an admin cannot delete a site.
 */
export const SITE_DEPENDENCY_SOURCES = [
  { model: 'User', field: 'siteId', one: 'user', many: 'users' },
  {
    model: 'UserSite',
    field: 'siteId',
    one: 'extra site assignment',
    many: 'extra site assignments',
  },
  { model: 'Department', field: 'siteId', one: 'department', many: 'departments' },
  { model: 'Document', field: 'siteId', one: 'document', many: 'documents' },
  { model: 'DocumentSite', field: 'siteId', one: 'document link', many: 'document links' },
  { model: 'Nonconformance', field: 'siteId', one: 'nonconformance', many: 'nonconformances' },
  { model: 'Capa', field: 'siteId', one: 'CAPA', many: 'CAPAs' },
  { model: 'ChangeRequest', field: 'siteId', one: 'change request', many: 'change requests' },
  { model: 'QualityEvent', field: 'siteId', one: 'quality event', many: 'quality events' },
  { model: 'Complaint', field: 'siteId', one: 'complaint', many: 'complaints' },
  { model: 'AuditInstance', field: 'siteId', one: 'audit', many: 'audits' },
  { model: 'AuditProgram', field: 'siteId', one: 'audit program', many: 'audit programs' },
  { model: 'Record', field: 'siteId', one: 'record', many: 'records' },
  { model: 'Equipment', field: 'siteId', one: 'equipment item', many: 'equipment items' },
  { model: 'StorageLocation', field: 'siteId', one: 'storage location', many: 'storage locations' },
  { model: 'SupplierOnSite', field: 'siteId', one: 'supplier link', many: 'supplier links' },
  { model: 'SiteOnLogBook', field: 'siteId', one: 'log book link', many: 'log book links' },
  {
    model: 'SiteOnTemplate',
    field: 'siteId',
    one: 'form template link',
    many: 'form template links',
  },
]

/**
 * Count everything pointing at `siteId`, skipping models this build doesn't
 * register and models whose query throws (a broken count must not block the
 * dialog — it degrades to "we could not check", which the copy states).
 *
 * @param {Record<string, any>} db — the syncEngine model registry
 * @param {string} siteId
 * @param {Array} [sources]
 * @returns {Promise<{items: Array<{one: string, many: string, count: number}>, total: number, failed: string[]}>}
 */
export async function countSiteDependencies(db, siteId, sources = SITE_DEPENDENCY_SOURCES) {
  const items = []
  const failed = []
  if (!siteId) return { items, total: 0, failed }

  for (const source of sources) {
    const Model = db?.[source.model]
    if (!Model?.where) continue
    try {
      const rows = await Model.where(source.field, siteId).exec()
      const count = rows?.length ?? 0
      if (count > 0) items.push({ one: source.one, many: source.many, count })
    } catch {
      failed.push(source.model)
    }
  }

  return { items, total: items.reduce((sum, i) => sum + i.count, 0), failed }
}

/**
 * "3 users, 1 department and 12 documents" — the phrase the confirm leads with.
 * Caps the list so a site backing a dozen record types doesn't produce a wall
 * of text in a dialog.
 */
export function describeSiteDependencies(items, max = 4) {
  const list = (Array.isArray(items) ? items : []).filter((i) => i.count > 0)
  if (!list.length) return ''

  const ranked = [...list].sort((a, b) => b.count - a.count)
  const shown = ranked.slice(0, max)
  const hidden = ranked.length - shown.length

  const parts = shown.map((i) => `${i.count} ${i.count === 1 ? i.one : i.many}`)
  if (hidden > 0) parts.push(`${hidden} more ${hidden === 1 ? 'type' : 'types'} of record`)

  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * The confirm body. Honest on both counts the old copy got wrong:
 *
 *  - it is a SOFT delete (the row is retained and an admin can restore it from
 *    the database), so it does not claim to be irreversible;
 *  - it names what depends on the site, because those records keep their
 *    `site_id` and start showing a blank/— site field the moment it goes.
 *
 * @param {{name?: string, code?: string}} site
 * @param {{items?: Array, total?: number, failed?: string[]}} dependencies
 * @returns {string}
 */
export function buildDeleteSiteMessage(site, dependencies = {}) {
  const name = site?.name ?? ''
  const code = site?.code ? ` (${site.code})` : ''
  const head = `Delete '${name}'${code}?`

  const summary = describeSiteDependencies(dependencies.items)
  const couldNotCheck = (dependencies.failed?.length ?? 0) > 0

  const lines = [head]

  if (summary) {
    lines.push(
      `${summary} still reference this site. They are not deleted, but they will stop showing a site until you move them.`,
    )
  } else if (couldNotCheck) {
    lines.push('We could not check what depends on this site, so it may still be in use.')
  } else {
    lines.push('Nothing currently references this site.')
  }

  lines.push(
    'The site is removed from every picker and hidden from the app. It is a soft delete — the record is retained and can be restored by an administrator, but there is no way to restore it from this screen.',
  )

  return lines.join('\n\n')
}
