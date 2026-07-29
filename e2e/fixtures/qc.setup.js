// QC suite pre-flight: purge the inspection lots left behind by previous runs.
//
// WHY THIS EXISTS. Every QC journey mints at least one inspection lot, so the
// E2ELAB tenant grows by ~10 lots per full run. The frontend syncEngine
// bootstraps INSTANT-strategy models into IndexedDB on every fresh browser
// context, and each journey opens one or two — so the per-context hydration
// cost climbs with the accumulated data until UI interactions start timing out.
// Observed directly: runs 1–3 green, then intermittent failures that move
// around the suite (check-in, collect-samples, save-results) with no code
// change between them. That is data growth, not a race in any one spec.
//
// The purge is scoped hard: only rows whose lot_number matches the E2E prefix
// this suite mints, only in the E2ELAB tenant. It cannot touch demo or customer
// data, and it leaves the seeded master data (specs, plans, templates,
// storage locations) alone — those are cheap and shared.
import { test as setup, expect } from '@playwright/test'
import { COMPANY_ID } from './cast.js'
import { sql, sqlValue } from './db.js'

setup('purge inspection lots from previous QC runs', async () => {
  const before = Number(
    sqlValue(
      `SELECT count(*) FROM inspection_lots
        WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-%'`,
    ),
  )

  // Children first — retain_samples/results/events/samples cascade off the lot,
  // but retain_sample_events references retain_samples, so delete inside out.
  // (Hard delete, not soft: these are throwaway fixtures, and leaving
  // soft-deleted rows behind would defeat the point — the syncEngine still
  // pages through them during bootstrap.)
  sql(`
    DELETE FROM retain_sample_events WHERE retain_sample_id IN (
      SELECT rs.id FROM retain_samples rs
        JOIN inspection_lots l ON l.id = rs.inspection_lot_id
       WHERE l.company_id = '${COMPANY_ID}' AND l.lot_number LIKE 'E2E-LOT-%');
    DELETE FROM retain_samples WHERE inspection_lot_id IN (
      SELECT id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-%');
    DELETE FROM inspection_results WHERE inspection_lot_id IN (
      SELECT id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-%');
    DELETE FROM inspection_samples WHERE inspection_lot_id IN (
      SELECT id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-%');
    DELETE FROM inspection_defects WHERE inspection_lot_id IN (
      SELECT id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-%');
    DELETE FROM inspection_lot_events WHERE inspection_lot_id IN (
      SELECT id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-%');
    DELETE FROM inspection_batches WHERE inspection_lot_id IN (
      SELECT id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-%');
    DELETE FROM inspection_lots
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-%';
  `)

  // Specs and plans the authoring journeys mint (PW-J4/J5) accumulate too, and
  // a stale EFFECTIVE spec on the authoring product would make the next run's
  // supersession assertions ambiguous.
  // The approval signatures must go first: `signatures_specification_id_fkey`
  // is ON DELETE RESTRICT, deliberately — a Part-11 signature is not supposed
  // to be removable by deleting what it signed. That guarantee is worth more
  // than this cleanup, so the purge works WITH it (drop the test signature
  // explicitly) rather than around it. Scoped to specs this suite authored.
  sql(`
    DELETE FROM signatures WHERE specification_id IN (
      SELECT id FROM specifications WHERE company_id = '${COMPANY_ID}' AND name LIKE 'E2E Spec %');
    DELETE FROM signatures WHERE sampling_plan_id IN (
      SELECT id FROM sampling_plans WHERE company_id = '${COMPANY_ID}' AND name LIKE 'E2E Plan %');
    UPDATE specifications SET signature_id = NULL
     WHERE company_id = '${COMPANY_ID}' AND name LIKE 'E2E Spec %';
    UPDATE sampling_plans SET signature_id = NULL
     WHERE company_id = '${COMPANY_ID}' AND name LIKE 'E2E Plan %';
    DELETE FROM specification_characteristics WHERE specification_id IN (
      SELECT id FROM specifications WHERE company_id = '${COMPANY_ID}' AND name LIKE 'E2E Spec %');
    DELETE FROM specifications WHERE company_id = '${COMPANY_ID}' AND name LIKE 'E2E Spec %';
    DELETE FROM sampling_plans WHERE company_id = '${COMPANY_ID}' AND name LIKE 'E2E Plan %';
    DELETE FROM sampling_standards WHERE company_id = '${COMPANY_ID}' AND name LIKE 'E2E Custom AQL %';
  `)

  const after = Number(
    sqlValue(
      `SELECT count(*) FROM inspection_lots
        WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-%'`,
    ),
  )
  expect(after, `purged ${before} leftover E2E lots`).toBe(0)

  // The seeded fixtures must survive the purge — if any of these vanish the
  // whole suite fails in confusing ways, so fail loudly here instead.
  expect(
    sqlValue(`SELECT count(*) FROM specifications WHERE id = 'e2e96000-0000-4000-8000-000000000001'`),
    'seeded specification intact',
  ).toBe('1')
  expect(
    sqlValue(`SELECT count(*) FROM sampling_plans WHERE id = 'e2e98000-0000-4000-8000-000000000001'`),
    'seeded sampling plan intact',
  ).toBe('1')
})
