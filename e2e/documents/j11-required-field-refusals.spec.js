// PW-J11 · Documents required-field refusal — UI only, and the reason matters.
//
// THERE IS NO REST CREATE ROUTE FOR DOCUMENTS. `routes/documents/crud.js` mounts
// two GETs and nothing else; no `router.post` exists anywhere under
// `routes/documents`. `createDocumentSchema` in `schemas/documents.js` is real,
// has its own unit test, and is attached to NO route — it is orphaned, left
// behind when creation moved to GraphQL. Every document is created by the
// syncEngine (`db.Document.create()` via `useLiveMutation`), judged by
// `documents_ins` RLS and the table's triggers, with no HTTP status to read.
//
// So the REST arms that cover CAPA, NC and CR cannot exist here: posting to
// `/api/v1/services/documents` would 404 for every key, which is not a 400 and
// proves nothing about field enforcement. Wiring a route so the arms could pass
// would be inventing production surface to satisfy a test — backwards.
//
// What this file therefore asserts is the half that IS reachable: the user is
// told what is missing, and nothing is written. OQ-01 TC-01-01 steps 2-4 ask for
// per-field identification ("omit the Site, then attempt to save → refused; the
// missing field is identified"); BaseForm validates the whole form at once and
// names the offenders in its ValidationSummary, so one empty submit covers the
// intent. Server-level proof of required-ness stays uncovered until someone
// writes a GraphQL-level probe — record that in the execution summary rather
// than claiming it.
import { test } from '@playwright/test'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { expectEmptyFormRefused } from '../fixtures/negativeArms.js'

/**
 * Scoped to the tenant on purpose. This count is the evidence that a refused
 * create wrote NOTHING, so it is compared before and after the refusal — and an
 * unscoped `count(*)` makes any concurrent insert anywhere in the database
 * (a graphile_worker job, another tenant's fixture, a leaked row from an
 * earlier spec) look like the refused create having written a row. That is a
 * SECURITY-SHAPED false positive: it reports "a rejected request created a
 * record", which is the most alarming thing this suite can say.
 */
function documentCount() {
  return Number(
    sqlValue(`SELECT count(*) FROM documents WHERE company_id = '${COMPANY_ID}'`),
  )
}

test.describe('PW-J11 · Documents required-field refusal', () => {
  test.use({ storageState: AUTH.author })

  test('UI: submitting an empty create form tells the user what is missing', async ({ page }) => {
    test.setTimeout(120_000)

    // No wizard and no workflow picker: /documents/create is one tabbed
    // BaseForm (Properties / Content / Training). The approval workflow is
    // inherited from the document template and rendered read-only —
    // WorkflowVersionSelect is not mounted by any documents component — so
    // there is no card to click and no `reach` hook needed.
    await expectEmptyFormRefused(page, {
      createPath: '/documents/create',
      submitLabel: 'Create Document',
      countRows: documentCount,
    })
  })
})
