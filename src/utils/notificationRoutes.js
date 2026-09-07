/**
 * Where a notification's `resourceType` points, in the app.
 *
 * ── THIS TABLE HAS A TWIN AND THEY MUST NOT DISAGREE ─────────────────────────
 * The email half is `entityRouteSegment` / `buildCompanyEntityUrl` in
 * `@qability/shared/utils/companyAppUrl.js` (the `qms` repo). ONE notifications
 * row feeds both surfaces: the worker writes it, `send_notification` builds the
 * emailed deep link from the backend table, and the bell menu builds the in-app
 * link from this one. A type registered in only one place therefore sends the
 * email and the click to different pages — the email lands on the record, the
 * bell lands on /notifications — and nothing anywhere reports it.
 *
 * That is exactly what had happened. The backend resolved ChangeRequest,
 * InspectionLot, AuditInstance, Complaint and every admin-defined module key;
 * the in-app table knew only QualityEvent, Nonconformance and Capa. So five of
 * the eight kinds an automation rule can target had a working emailed link and
 * a dead in-app one, for the whole time those objects have been automatable.
 *
 * Extracted out of NotificationsItem.vue so `notificationRouteParity.spec.js`
 * can import BOTH resolvers and compare them, rather than regex-matching a
 * component's source. Add a type here and in companyAppUrl.js, or in neither.
 *
 * Values are raw paths; the component wraps them in getCompanyPath().
 */

/**
 * Canonicalise the snake_case analytics vocabulary to the PascalCase keys used
 * below.
 *
 * Two vocabularies reach this resolver. Almost every emitter sends the model
 * name (`Nonconformance`), but the analytics worker tasks are raw-SQL jobs with
 * no model in scope and send the TABLE name instead — `evaluate_analytics_alerts`
 * emits `resourceType: 'analytics_alert'`. Both must land on the same page here
 * AND in the email builder, which normalises identically
 * (`analyticsCanonicalType` in `@qability/shared/utils/companyAppUrl.js`).
 *
 * Accepts singular or plural (`analytics_alert`, `analytics_alerts`) because the
 * emitter and the table disagree about which one they use.
 *
 * It must also run BEFORE the module-key branch below: `analytics_alert` matches
 * the lowercase module_key shape exactly, so without this it would route to
 * `/m/analytics_alert/{id}` — the detail page of a module that does not exist.
 */
export function canonicalResourceType(resourceType) {
  const type = String(resourceType ?? '')
  if (!type.startsWith('analytics_')) return type
  const singular = type.endsWith('s') ? type.slice(0, -1) : type
  return singular
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

export const RESOURCE_ROUTES = {
  Document: (id) => `/documents/${id}`,
  Record: (id) => `/records/${id}`,
  WorkflowInstance: (id) => `/workflow-instances/${id}`,
  // TaskInstance has NO standalone detail route (/task-instances/:id 404s) — it
  // is resolved to its host entity by the component, matching the task inbox
  // and the email deep link.
  // Equipment has no detail page yet — land on the list (calibration reminders).
  Equipment: () => '/equipment',
  Nonconformance: (id) => `/nonconformances/${id}`,
  Capa: (id) => `/capas/${id}`,
  QualityEvent: (id) => `/qualityEvents/${id}`,
  TrainingInstance: (id) => `/training-instances/${id}`,
  LogBook: (id) => `/inspections-logs/log-books/${id}`,

  // ── The automation-engine targets that had no in-app route ──────────────
  // Each mirrors the backend OVERRIDES entry exactly, and each destination was
  // checked against src/pages/ before being wired: a plausible path that 404s
  // is worse than the /notifications fallback, because it looks like a broken
  // product rather than a missing feature.
  //   src/pages/change-requests/[[id]].vue
  ChangeRequest: (id) => `/change-requests/${id}`,
  //   src/pages/qc-inspection/lots/[id].vue
  InspectionLot: (id) => `/qc-inspection/lots/${id}`,
  //   src/pages/audits/instances/[id].vue
  AuditInstance: (id) => `/audits/instances/${id}`,
  //   src/pages/complaints/[[id]].vue
  //   (the QMS Complaint module — CustomerComplaint is the older ticketing
  //   entity and lives at /customer-complaints; they are different records.)
  Complaint: (id) => `/complaints/${id}`,

  // ── Analytics ──────────────────────────────────────────────────────────
  // Dashboards and reports are the only analytics records with a page of
  // their own, so they are the only ones that carry an id.
  AnalyticsDashboard: (id) => `/analytics/dashboards/${id}`,
  AnalyticsReport: (id) => `/analytics/reports/${id}`,
  // A schedule is configuration hanging off a report and a run is a row in
  // that report's history — neither is addressable, so both stop at the
  // reports list. Resolving to the PARENT report would be a better landing
  // spot, but it needs an id lookup the email builder (synchronous, no DB
  // handle) cannot do, and a link that lands somewhere different depending on
  // whether you clicked the email or the bell is worse than one that lands one
  // level up in both.
  AnalyticsReportSchedule: () => '/analytics/reports',
  AnalyticsReportRun: () => '/analytics/reports',
  // Alerts have no UI surface at all yet; the analytics home is the honest
  // destination until one exists.
  AnalyticsAlert: () => '/analytics',
  AnalyticsAlertEvent: () => '/analytics',
  // AnalyticsWidget is deliberately ABSENT. A widget is a layout cell inside a
  // dashboard, not a record anyone navigates to; anything worth notifying about
  // a widget (an alert on its metric) is worth notifying about its DASHBOARD,
  // and the emitter already holds that id. Registering it would encode the lie
  // that a widget id is navigable and silently drop the id on the way. It falls
  // through to the analytics fallback instead.
}

/**
 * Admin-defined module records carry a lowercase module_key as their entity
 * type (e.g. `deviation`) and live at /m/:moduleKey/:id — src/pages/m/
 * [moduleKey]/[[id]].vue. Built-in types are all PascalCase, so this only
 * matches generic modules.
 *
 * Automation rules target these by module_key, and the scheduled sweep serves
 * ONLY these, so every notification a time-based rule produces arrives with a
 * lowercase resourceType. Before this branch existed, every one of them landed
 * on /notifications when clicked while its email link worked.
 */
export const MODULE_KEY_RE = /^[a-z][a-z0-9_]*$/

/**
 * The in-app path for a notification, or null when nothing is registered for
 * this type (the caller decides what to do about that — see fallbackTarget in
 * NotificationsItem.vue, which warns and lands somewhere real).
 *
 * @param {string} resourceType  raw resourceType off the notification row
 * @param {string} resourceId
 * @returns {string|null}
 */
export function notificationPath(resourceType, resourceId) {
  const type = canonicalResourceType(resourceType)
  const builder = RESOURCE_ROUTES[type]
  if (builder) return builder(resourceId)
  if (MODULE_KEY_RE.test(type)) return `/m/${type}/${resourceId}`
  return null
}

/** Whether this type has a registered destination (drives the chevron). */
export function hasNotificationRoute(resourceType) {
  const type = canonicalResourceType(resourceType)
  return !!RESOURCE_ROUTES[type] || MODULE_KEY_RE.test(type)
}
