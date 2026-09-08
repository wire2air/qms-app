// Documents suite pre-flight: purge the documents left behind by previous runs.
//
// WHY THIS EXISTS. Same failure mode qcSetup and inspectionsLogsSetup already
// solve, arriving late here because Documents was the first suite written and
// nobody went back for it. Every journey mints at least one document, so the
// E2ELAB tenant grows every run. Document / DocumentVersion / DocumentSection
// are synced models: the frontend syncEngine bootstraps them into IndexedDB on
// each fresh browser context, and the per-context hydration cost climbs with the
// accumulated rows until UI interactions start timing out.
//
// Measured 2026-09-08, which is what finally identified it: 894 documents in the
// tenant, 890 of them run-minted leftovers. Three consecutive full-project runs
// with NO code change between them degraded 17 → 10 → 9 passing, and the
// failures moved around the suite — j1, j3, j4, j5, j7, j8, c1, c6 — always as
// `locator.click` timeouts after `page.goto('/documents')`. That is data growth,
// not a race in any one spec.
//
// It cost real time to find. The failures were first blamed on a concurrent
// agent's test run, then on a REST scope filter shipped the same day; that
// filter was reverted on the strength of a single-spec A/B (3/3 pass reverted,
// 2/3 fail restored) which, this close to a timeout cliff, was a coin flip
// rather than evidence. The filter was innocent — nothing in `src/` calls the
// REST document list at all; the page is driven entirely by the syncEngine — and
// it has since been restored. If this suite starts failing again in the same
// shape, suspect accumulation here before suspecting a controller.
//
// The purge is scoped hard: only documents whose title matches what these specs
// mint (`uniqueTitle()` → `E2E <tag> <ms>`, plus J7's `J7 <ms> …` variants), only
// in the E2ELAB tenant. It cannot touch demo or customer data, and it leaves the
// seeded master data (templates, statuses, standards) alone — those are cheap,
// shared, and referenced by fixed ids.
import { test as setup, expect } from '@playwright/test'
import { COMPANY_ID } from './cast.js'
import { sql, sqlValue } from './db.js'

const MINE = `company_id = '${COMPANY_ID}' AND (title LIKE 'E2E %' OR title LIKE 'J7 %')`

setup('purge documents from previous runs', async () => {
  const before = Number(sqlValue(`SELECT count(*) FROM documents WHERE ${MINE}`))

  // Deletion order is dictated by the FK delete rules, checked against
  // pg_constraint rather than assumed:
  //
  //   documents        → document_versions / _sections / _sites /
  //                      users_on_documents / *_document_links   CASCADE
  //   documents        → document_reviews                        NO ACTION  ← explicit
  //   document_versions→ document_links / _sections / supplier_documents CASCADE
  //   task_instances   → signatures                              RESTRICT   ← explicit, first
  //   task_instances   → document_reviews                        NO ACTION  ← explicit, first
  //
  // task_instances carry no FK to documents at all — the link is polymorphic
  // (entity_type + entity_id), so nothing cascades and they must be matched by
  // hand. Both shapes exist: 'Document' for review/approval tasks and
  // 'DocumentVersion' for version-scoped ones.
  const taskIds = `
    SELECT ti.id FROM task_instances ti
     WHERE (ti.entity_type = 'Document'
            AND ti.entity_id IN (SELECT id FROM documents WHERE ${MINE}))
        OR (ti.entity_type = 'DocumentVersion'
            AND ti.entity_id IN (SELECT dv.id FROM document_versions dv
                                  WHERE dv.document_id IN (SELECT id FROM documents WHERE ${MINE})))`

  // Signatures first and explicitly. `signatures_task_instance_id_fkey` is
  // ON DELETE RESTRICT by design — a Part 11 signature must not disappear
  // because someone deleted what it signed. That guarantee is worth more than
  // this cleanup, so the purge works WITH it rather than around it.
  sql(`DELETE FROM signatures WHERE task_instance_id IN (${taskIds});`)
  sql(`DELETE FROM document_reviews WHERE task_instance_id IN (${taskIds});`)
  sql(`DELETE FROM document_reviews WHERE document_id IN (SELECT id FROM documents WHERE ${MINE});`)
  sql(`DELETE FROM task_instances WHERE id IN (${taskIds});`)

  // Hard delete, not soft: leaving soft-deleted rows behind would defeat the
  // whole point, because the syncEngine still pages through them on bootstrap.
  sql(`DELETE FROM documents WHERE ${MINE};`)

  const after = Number(sqlValue(`SELECT count(*) FROM documents WHERE ${MINE}`))
  expect(after, `purged ${before} leftover E2E documents`).toBe(0)

  // The seeded fixtures must survive — if any vanish the suite fails in
  // confusing ways, so fail loudly here instead. Templates are what
  // `createSopDocument` picks from; without one, every journey dies at step one.
  expect(
    Number(
      sqlValue(
        `SELECT count(*) FROM document_templates WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL`,
      ),
    ),
    'seeded document templates intact',
  ).toBeGreaterThan(0)
})
