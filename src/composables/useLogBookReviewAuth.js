import { db } from '@models/index'
import { currentSession } from '@/utils/currentSession.js'

/**
 * Log-entry review authorization (2026-08-09) — the FE mirror of the backend
 * SECURITY DEFINER function public.is_log_book_reviewer + the review controller
 * gate. A user may review a log book's entries when they are:
 *   - a company OWNER (always — product decision), OR
 *   - the book's designated supervisor (log_books.supervisor_user_id), OR
 *   - an additional reviewer — a specific user, or a member of a reviewer role
 *     (log_book_reviewers) — who ALSO has access to the book's site(s).
 * A book with no site rows is global (no site gate); the supervisor is never
 * site-gated. The global field_records:review permission does NOT grant review
 * of a book unless the user is a reviewer of that book.
 *
 * Site membership = users.site_id (primary) ∪ user_sites (additional), mirroring
 * authz.effective_site_ids.
 */
export function useLogBookReviewAuth() {
  const userId = computed(() => currentSession.value?.userId ?? currentSession.value?.id ?? null)
  const isOwner = computed(() => !!currentSession.value?.isOwner)

  const state = useLiveQueryWithDeps(
    [() => userId.value],
    async (dbi, [uid]) => {
      const empty = { supervisorOf: new Set(), reviewerOf: new Set(), reviewers: new Map(), bookSites: new Map() }
      if (!uid) return empty

      const myRoleIds = new Set((await dbi.RoleOnUser.where('userId', uid).exec()).map((r) => r.roleId))
      const me = await dbi.User.findByPk(uid)
      const mySites = new Set(
        [me?.siteId, ...(await dbi.UserSite.where('userId', uid).exec()).map((s) => s.siteId)].filter(
          Boolean,
        ),
      )

      // book → set(siteId)
      const bookSites = new Map()
      for (const s of await dbi.SiteOnLogBook.where().exec()) {
        if (!bookSites.has(s.logBookId)) bookSites.set(s.logBookId, new Set())
        bookSites.get(s.logBookId).add(s.siteId)
      }
      const siteOk = (bookId) => {
        const sites = bookSites.get(bookId)
        if (!sites || sites.size === 0) return true // global book
        for (const sid of sites) if (mySites.has(sid)) return true
        return false
      }

      const supervisorOf = new Set(
        (await dbi.LogBook.where().exec())
          .filter((lb) => lb.supervisorUserId === uid)
          .map((lb) => lb.id),
      )

      // book → [{userId?, roleId?}] roster, and the books *I* review via roster.
      const reviewers = new Map()
      const reviewerOf = new Set()
      for (const r of await dbi.LogBookReviewer.where().exec()) {
        if (!reviewers.has(r.logBookId)) reviewers.set(r.logBookId, [])
        reviewers.get(r.logBookId).push(r)
        const mine = r.userId === uid || (r.roleId && myRoleIds.has(r.roleId))
        if (mine && siteOk(r.logBookId)) reviewerOf.add(r.logBookId)
      }
      return { supervisorOf, reviewerOf, reviewers, bookSites }
    },
    {
      models: ['RoleOnUser', 'User', 'UserSite', 'SiteOnLogBook', 'LogBook', 'LogBookReviewer'],
      initial: { supervisorOf: new Set(), reviewerOf: new Set(), reviewers: new Map(), bookSites: new Map() },
    },
  )

  /** Set of logBookIds the current user can review (excludes the owner-all case). */
  const reviewableBookIds = computed(() => {
    const s = state.value ?? {}
    return new Set([...(s.supervisorOf ?? []), ...(s.reviewerOf ?? [])])
  })

  /** Can the current user review this log book's entries? (owner ⇒ always) */
  function canReviewBook(bookOrId) {
    if (isOwner.value) return true
    const id = typeof bookOrId === 'string' ? bookOrId : bookOrId?.id
    return !!id && reviewableBookIds.value.has(id)
  }

  return { reviewableBookIds, canReviewBook, isOwner, userId, reviewersState: state }
}

/**
 * Resolve the authorized reviewer USER ids for one log book (supervisor +
 * reviewer users + members of reviewer roles, each site-gated except the
 * supervisor). Used by the over-the-shoulder dialog to offer "who is signing".
 * Standalone (imperative) so callers can await it on demand.
 */
export async function resolveAuthorizedReviewerUserIds(logBook) {
  if (!logBook?.id) return []
  const out = new Set()
  if (logBook.supervisorUserId) out.add(logBook.supervisorUserId)

  const bookSiteRows = await db.SiteOnLogBook.where('logBookId', logBook.id).exec()
  const bookSites = new Set(bookSiteRows.map((s) => s.siteId))
  const hasSiteAccess = async (uid) => {
    if (!bookSites.size) return true // global book
    const u = await db.User.findByPk(uid)
    const sites = new Set([u?.siteId, ...(await db.UserSite.where('userId', uid).exec()).map((s) => s.siteId)].filter(Boolean))
    for (const sid of bookSites) if (sites.has(sid)) return true
    return false
  }

  const rows = await db.LogBookReviewer.where('logBookId', logBook.id).exec()
  for (const r of rows) {
    if (r.userId) {
      if (await hasSiteAccess(r.userId)) out.add(r.userId)
    } else if (r.roleId) {
      const members = await db.RoleOnUser.where('roleId', r.roleId).exec()
      for (const m of members) if (await hasSiteAccess(m.userId)) out.add(m.userId)
    }
  }
  return [...out]
}

/**
 * Users eligible to be ADDED as a specific reviewer of this log book — internal
 * users with access to the book's site(s) (global book ⇒ all internal users).
 * Powers the site-gated user picker in the Additional Reviewers section.
 */
export async function resolveSiteEligibleUserIds(logBook) {
  const users = (await db.User.where().exec()).filter((u) => u.kind !== 'EXTERNAL_SUPPLIER')
  const bookSiteRows = logBook?.id ? await db.SiteOnLogBook.where('logBookId', logBook.id).exec() : []
  const bookSites = new Set(bookSiteRows.map((s) => s.siteId))
  if (!bookSites.size) return users.map((u) => u.id) // global book → everyone
  const userSites = await db.UserSite.where().exec()
  const additionalByUser = new Map()
  for (const us of userSites) {
    if (!additionalByUser.has(us.userId)) additionalByUser.set(us.userId, new Set())
    additionalByUser.get(us.userId).add(us.siteId)
  }
  return users
    .filter((u) => {
      const sites = new Set([u.siteId, ...(additionalByUser.get(u.id) ?? [])].filter(Boolean))
      for (const sid of bookSites) if (sites.has(sid)) return true
      return false
    })
    .map((u) => u.id)
}
