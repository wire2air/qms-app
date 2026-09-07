/**
 * The two notification deep-link resolvers must agree.
 *
 * ONE `notifications` row feeds both surfaces. `send_notification` builds the
 * emailed link with `buildCompanyEntityUrl` (qms/backend/shared/utils/
 * companyAppUrl.js); the bell menu builds the in-app link with
 * `notificationPath` (./notificationRoutes.js). Both read the same
 * `resource_type` / `resource_id`.
 *
 * A type registered in only one of them does not error. The email lands on the
 * record and the click lands on /notifications, or the reverse. Nothing logs a
 * mismatch, no test caught it, and the only way it surfaces is a customer
 * saying "the link in the email works but the bell doesn't".
 *
 * Which is what had happened, for five of the eight kinds an automation rule
 * can target: ChangeRequest, InspectionLot, AuditInstance, Complaint, and every
 * admin-defined module key. The backend resolved all five; the in-app table
 * knew three types in total.
 *
 * The comment at the top of the backend table already stated the rule — "Add a
 * row here when registering a new resourceHandler … so the email links land on
 * the right page" — and the in-app one said "Add a type to BOTH or to neither."
 * Two comments, no mechanism, five broken links. This file is the mechanism.
 */
import { describe, it, expect } from 'vitest'
import { RESOURCE_ROUTES, notificationPath, hasNotificationRoute } from './notificationRoutes.js'
import { AUTOMATION_OBJECTS } from './automationObjects.js'

// The email half, imported directly out of the sibling repo — the same file the
// worker imports, not a copy of it.
const { entityRouteSegment, buildCompanyEntityUrl } =
  await import('../../../qms/backend/shared/utils/companyAppUrl.js')

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

/** What the email link would point at, as a path (no origin). */
function emailPath(type, id) {
  const segment = entityRouteSegment(type)
  // buildCompanyEntityUrl decides whether the id is appended; reproduce that by
  // building a real URL and taking its pathname, so this test cannot drift from
  // the function it is checking.
  process.env.APP_URL = process.env.APP_URL || 'https://app.example.test'
  process.env.ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'example.test'
  const url = buildCompanyEntityUrl({ companyCode: 'acme', entityType: type, entityId: id })
  return url ? new URL(url).pathname : `/${segment}`
}

describe('in-app and email deep links resolve identically', () => {
  it('agrees on every type the in-app table registers', () => {
    // The strongest available assertion: for each registered type, the two
    // resolvers must produce the same path. Includes the id-carrying decision —
    // /analytics/reports vs /analytics/reports/{runId} is precisely the kind of
    // difference that makes one surface 404 and the other not.
    const disagreements = []
    for (const type of Object.keys(RESOURCE_ROUTES)) {
      const inApp = notificationPath(type, ID)
      const email = emailPath(type, ID)
      if (inApp !== email) disagreements.push(`${type}: in-app ${inApp} vs email ${email}`)
    }
    expect(disagreements, disagreements.join('\n')).toEqual([])
  })

  it('agrees on admin-defined module records', () => {
    // Module keys are open-ended (any lowercase module_key a tenant creates),
    // so this is the branch rather than a table row. The scheduled automation
    // sweep serves ONLY module objects, so every time-based rule's notification
    // arrives with a lowercase resourceType — the in-app link was dead for the
    // entire category.
    for (const key of ['deviation', 'supplier_audit', 'change_log_2']) {
      expect(notificationPath(key, ID)).toBe(`/m/${key}/${ID}`)
      expect(emailPath(key, ID)).toBe(`/m/${key}/${ID}`)
    }
  })

  it('agrees on the analytics snake_case vocabulary', () => {
    // The analytics worker tasks emit table names, not model names. Both
    // resolvers canonicalise; if only one did, `analytics_alert` would route to
    // /m/analytics_alert/{id} on that side — a confident 404.
    for (const raw of ['analytics_alert', 'analytics_alerts', 'analytics_report_run']) {
      expect(notificationPath(raw, ID)).toBe(emailPath(raw, ID))
    }
  })
})

describe('every automation target kind has a working in-app link', () => {
  // The eight kinds a rule can target: the seven built-in objects plus the
  // module-key category. This is the finding, stated as a test.
  const builtIns = AUTOMATION_OBJECTS.map((o) => o.value)

  it('covers all seven built-in objects', () => {
    expect(builtIns).toHaveLength(7)
    for (const type of builtIns) {
      expect(hasNotificationRoute(type), `${type} has no in-app route`).toBe(true)
      expect(notificationPath(type, ID)).toBe(emailPath(type, ID))
    }
  })

  it('covers the module-key category', () => {
    expect(hasNotificationRoute('deviation')).toBe(true)
  })

  it('names the five that were broken', () => {
    // Explicit, so a future edit that drops one fails on a test that says which
    // link stopped working rather than only on a count.
    const wasBroken = {
      ChangeRequest: `/change-requests/${ID}`,
      InspectionLot: `/qc-inspection/lots/${ID}`,
      AuditInstance: `/audits/instances/${ID}`,
      Complaint: `/complaints/${ID}`,
      deviation: `/m/deviation/${ID}`,
    }
    for (const [type, path] of Object.entries(wasBroken)) {
      expect(notificationPath(type, ID), `${type} regressed`).toBe(path)
    }
  })
})

describe('the resolver does not invent destinations', () => {
  it('returns null for a PascalCase type nobody registered', () => {
    // Null is what makes the component warn and land on /notifications. A
    // guessed plural segment here would produce a confident 404 instead — the
    // email builder guesses because it cannot see the route table; the in-app
    // one can, and must not.
    expect(notificationPath('Widget', ID)).toBe(null)
    expect(hasNotificationRoute('Widget')).toBe(false)
  })

  it('AnalyticsWidget stays deliberately unregistered', () => {
    // A widget is a layout cell in a dashboard, not a record anyone navigates
    // to. Registering it would encode the lie that its id is navigable.
    expect(RESOURCE_ROUTES.AnalyticsWidget).toBeUndefined()
  })

  it('the id-less routes drop the id on BOTH sides', () => {
    for (const type of ['Equipment', 'AnalyticsAlert', 'AnalyticsReportRun']) {
      expect(notificationPath(type, ID)).not.toContain(ID)
      expect(emailPath(type, ID)).not.toContain(ID)
    }
  })
})

describe('Complaint and CustomerComplaint are different records', () => {
  it('routes them to different pages', () => {
    // `complaints` is the live QMS module; `customer_complaints` is the older
    // ticketing entity. The automation registry targets the first. Collapsing
    // them would send a complaint notification to a ticket that does not exist.
    expect(notificationPath('Complaint', ID)).toBe(`/complaints/${ID}`)
    expect(emailPath('CustomerComplaint', ID)).toBe(`/customer-complaints/${ID}`)
  })
})
