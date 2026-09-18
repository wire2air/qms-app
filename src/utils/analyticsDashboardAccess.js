/**
 * Who may do what to a saved dashboard.
 *
 * ── THIS IS NOT THE ENFORCEMENT ─────────────────────────────────────────────
 * The rules below are a MIRROR of the RLS policies in `database/rls.sql`, kept
 * here for one purpose only: not offering a button that is going to 403. The
 * server is the authority, every mutation still goes through it, and nothing in
 * this file is load-bearing for security. If the two ever disagree, the server
 * wins and the symptom is a disabled button, not a leak.
 *
 * The policies, restated (analytics_dashboards_{select,update,delete}_rls):
 *   READ    your own, always; plus `shared` ones if you hold reports_dashboards:read.
 *           A private draft is private from EVERYONE, company owner included —
 *           unusually for this codebase, the owner is not short-circuited past it.
 *   UPDATE  yours, or anything if you hold reports_dashboards:manage.
 *   DELETE  the same, AND `is_system = false` — a seeded persona default is not a
 *           tenant's to delete; they may copy it and delete the copy.
 *
 * Widgets carry no visibility of their own; writing a widget IS editing its
 * dashboard, so `canEditDashboard` gates every widget affordance too. That
 * matches `analytics_widgets_*_rls`, which correlate to the parent rather than
 * restating the predicate.
 *
 * `isAllowed(['reports_dashboards:manage'])` already returns true for a company
 * owner (`currentSession.isOwner` short-circuits it), so the owner branch of the
 * SQL needs no separate test here — pass its result as `canManage`.
 */

export const VISIBILITY = {
  PRIVATE: 'private',
  SHARED: 'shared',
}

/** Labels + the one-line explanation of what each state actually means. */
export const VISIBILITY_META = {
  private: {
    id: 'private',
    name: 'Private',
    help: 'Only you can open this dashboard. Not your administrator, not the company owner.',
  },
  shared: {
    id: 'shared',
    name: 'Shared',
    help: 'Anyone in your company with analytics access can open it. They see their OWN numbers — sharing a dashboard shares the question, never the answer.',
  },
}

/**
 * Can this viewer change the dashboard — rename it, share it, add or move a
 * widget?
 *
 * @param {{ ownerId?: string }|null} dashboard
 * @param {{ userId?: string|null, canManage?: boolean }} viewer
 * @returns {boolean}
 */
export function canEditDashboard(dashboard, { userId = null, canManage = false } = {}) {
  if (!dashboard) return false
  if (canManage) return true
  return !!userId && dashboard.ownerId === userId
}

/**
 * Can this viewer delete it? Editing plus the is_system guard — a shipped
 * persona default would otherwise be permanently lost from the tenant, and the
 * next upgrade would silently recreate it, which reads as the delete having
 * failed.
 *
 * @param {{ ownerId?: string, isSystem?: boolean }|null} dashboard
 * @param {{ userId?: string|null, canManage?: boolean }} viewer
 * @returns {boolean}
 */
export function canDeleteDashboard(dashboard, viewer = {}) {
  if (!canEditDashboard(dashboard, viewer)) return false
  return !dashboard.isSystem
}

/**
 * Is this dashboard the viewer's own? Drives the "Mine" / "Shared with me"
 * split in the list — which is a different question from `canEdit`, because a
 * manage-holder can edit a dashboard that is emphatically not theirs.
 *
 * @param {{ ownerId?: string }|null} dashboard
 * @param {string|null} userId
 */
export function isOwnDashboard(dashboard, userId) {
  return !!dashboard && !!userId && dashboard.ownerId === userId
}

/**
 * Split a list into the two groups the list page shows. Anything reaching the
 * client has already passed the SELECT policy, so "not mine" means "shared with
 * me" — there is no third bucket.
 *
 * @param {Array} dashboards
 * @param {string|null} userId
 * @returns {{ mine: Array, shared: Array }}
 */
export function partitionDashboards(dashboards = [], userId = null) {
  const mine = []
  const shared = []
  for (const d of dashboards) {
    if (isOwnDashboard(d, userId)) mine.push(d)
    else shared.push(d)
  }
  return { mine, shared }
}

/**
 * Renumber `position` to a dense 0..n-1 sequence matching array order, and
 * return only the rows whose stored position actually changed.
 *
 * Dense rather than sparse because `position` is the ONLY ordering key
 * (`analytics_widgets_dashboard_idx` is on `(dashboard_id, position)`) and gaps
 * left by a delete would eventually collide. Returning just the changed rows
 * keeps a drag of one tile from issuing a write for every other tile on the
 * board — each write is a GraphQL round trip under the pessimistic save model.
 *
 * @param {Array<{ id: string, position?: number }>} widgets in their new order
 * @returns {Array<{ id: string, position: number }>} rows needing a save
 */
export function reindexPositions(widgets = []) {
  const changed = []
  widgets.forEach((w, index) => {
    if (!w) return
    if (w.position !== index) changed.push({ id: w.id, position: index })
  })
  return changed
}
