// Shared DB helpers for the Notifications journeys.
//
// PW-J1's routed notifications are minted through REAL flows (documents.js's
// createSopDocument + a chat message — the exact pipeline documents/j10
// already proves) so they carry genuine worker-written rows, not synthetic
// ones. `notifications` IS a directly logically-replicated table
// (backend/sync/replication.js TABLES — confirmed by reading it, not assumed
// from root CLAUDE.md's older summary, which only names audit_logs and the
// graphile_worker job table), so any INSERT — worker-written or raw SQL —
// reaches the recipient's live bell without a reload.
//
// The ONE deliberate exception is `insertUnroutedNotification`: there is no
// real emitter today that produces a genuinely unrouted resourceType
// (`Nonconformance`, the roadmap doc's own suggested fixture, has been
// routed since notificationRoutes.js registered it — see that file's
// RESOURCE_ROUTES). `AnalyticsWidget` is the one type the code deliberately
// keeps out of RESOURCE_ROUTES (see the comment on that export), which is
// exactly what this regression pin needs to hold constant.
import { sql, sqlValue } from './db.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Purge a notification left behind by a prior failed run, by exact title. */
export function purgeNotification(title) {
  sqlValue(`DELETE FROM notifications WHERE title = ${quote(title)}`)
}

/**
 * Purge EVERY notification for a persona — the PW-J1 target, `notifyRecipient`
 * (e2e-seed.sql §48), exists precisely so a hard delete here is safe: nothing
 * else in the suite ever notifies them, so there is nothing else to lose. Run
 * before AND after the spec so a prior failed run's leftovers can't skew this
 * run's exact-count assertions (`unreadCountOf`).
 */
export function purgeAllNotificationsFor(userId) {
  sqlValue(`DELETE FROM notifications WHERE user_id = ${quote(userId)}`)
}

/**
 * Insert a notification with a resourceType nobody has registered a route
 * for, so PW-J1 can pin the CURRENT fallback-navigation behaviour
 * (NotificationsItem.vue's fallbackTarget) rather than the roadmap doc's
 * stale "does not navigate" claim.
 */
export function insertUnroutedNotification({ id, companyId, userId, title }) {
  sql(`INSERT INTO notifications
         (id, company_id, user_id, notification_type_id, title, resource_type, resource_id,
          channels, is_read, created_at, updated_at)
       VALUES
         (${quote(id)}, ${quote(companyId)}, ${quote(userId)}, 'SYSTEM', ${quote(title)},
          'AnalyticsWidget', gen_random_uuid(), ARRAY['in-app'], false, NOW(), NOW())`)
}
