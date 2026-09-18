// CF-2 — the gate is PER HOST MODULE, not a blanket "you hold something".
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A SEPARATE JOURNEY FROM CF-1
//
// CF-1 walks one entity type up a grant ladder and shows that more grant means
// more access. That shape has a failure mode it cannot detect: a policy that
// admitted anyone holding ANY grant in ANY module would pass every assertion in
// CF-1, because every persona on that ladder above the bottom rung holds `ncr`
// grants specifically.
//
// The L-2 fix is written as an uncorrelated `VALUES` subquery mapping each of
// the 8 registered `entity_type`s to the authz module that gates it:
//
//     Nonconformance    -> ncr                 Document          -> document_control
//     Capa              -> capa                Training          -> training
//     ChangeRequest     -> change_control      CustomerComplaint -> complaint_management
//     AuditInstance     -> audit_management    Complaint         -> complaints
//
// so the question this file asks is the one CF-1 structurally cannot: does
// holding `capa:read` and nothing else get you the CAPAs' answers and NONE of
// the NCs'? That is a per-row decision made on the `entity_type` column, and it
// is the property that makes the fix a gate rather than a doorman.
//
// The subquery is uncorrelated on purpose — the planner hoists it to a hashed
// SubPlan and calls `authz.has_permission` at most 8 times per statement instead
// of once per row (`EXPLAIN ANALYZE` over the 2,239-row set: 2.26 ms). It
// doubles as a fail-closed `entity_type` gate: a type outside the 8 matches no
// VALUES row and is denied to every non-owner, which is defence in depth behind
// CF-4's CHECK constraint.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
// Answer rows the tenant holds, RLS bypassed:
//   Nonconformance 291 · Capa 377 · ChangeRequest 883 · Document 660
//   AuditInstance 28 · Training 0 · CustomerComplaint 0 · Complaint 0
//
// Rows released by `entity_field_value_select_rls`, via `sqlAsAppUser`:
//
//   persona          grants held                        NC   Capa    CR   Doc  Audit
//   capaSiteEditor   capa: approve,read,update            0    377     0     0      0
//   controller       document_control: delete,read,update 0      0     0   660      0
//   auditReader      audit_management: read               0      0     0     0     28
//   auditor          those five modules: read           291    377   883   660     28
//   noAccess         none                                 0      0     0     0      0
//
// The three single-module personas are the finding. Each one is a full row of
// zeros with exactly ONE non-zero cell, and the non-zero cell moves with the
// grant — which is the only evidence that the `entity_type` column is being
// consulted at all rather than the whole table being released or withheld.
//
// TRAINING IS DELIBERATELY NOT USED as an isolation probe even though
// `trainingAdmin` holds `training:create,delete,manage,read,update`: the tenant
// holds ZERO Training answer rows, so their zero means "empty table" and not
// "denied", and asserting on it would be a probe that can never fail. That trap
// is instead turned into a test — the last one in this file seeds a Training row
// and shows the zero becoming a one.
//
// Counts are compared to ground truth taken in the same run, never to literals.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import {
  HOST_MODULE_BY_ENTITY_TYPE,
  affectedRows,
  dbNow,
  hasPermission,
  installCustomFieldPersonas,
  removeValueRows,
  seedValueRow,
  valueRowsInTable,
  valueRowsVisibleTo,
} from '../fixtures/customFields.js'

/**
 * The entity types the E2E tenant actually holds answer rows for. Anything else
 * would make a "reads 0" assertion unfalsifiable — see the Training note above.
 */
const POPULATED = ['Nonconformance', 'Capa', 'ChangeRequest', 'Document', 'AuditInstance']

/** persona → the ONE entity type their grants should reach. */
const SINGLE_MODULE = [
  { persona: 'capaSiteEditor', reaches: 'Capa', module: 'capa' },
  { persona: 'controller', reaches: 'Document', module: 'document_control' },
  { persona: 'auditReader', reaches: 'AuditInstance', module: 'audit_management' },
]

const probes = []

/**
 * Upper bound for every count comparison — see the identical note in CF-1. This
 * file compares ground truth against five personas across five entity types, so
 * it reads the table thirty times; without a frozen window a single concurrent
 * insert by another suite fails an arbitrary one of them.
 */
let stableBefore = null

test.beforeAll(() => {
  installCustomFieldPersonas()
  stableBefore = dbNow()
})
test.afterAll(() => removeValueRows(probes))

test.describe('CF-2 — one grant reaches one entity type', () => {
  test('the tenant holds answers for every entity type this file probes', () => {
    // Leg 0. Every "reads 0" below is only evidence if there was something to
    // read. Without this the whole file passes against a truncated table.
    for (const type of POPULATED) {
      expect(
        valueRowsInTable(type, { before: stableBefore }),
        `the tenant holds ${type} answer rows for the denials to be about`,
      ).toBeGreaterThan(0)
    }
  })

  for (const { persona, reaches, module } of SINGLE_MODULE) {
    test(`${persona} reads ${reaches} answers and nothing else`, () => {
      // The grant set, asserted rather than assumed — this persona's whole value
      // is being one-module, and a widened role would turn the zeros below into
      // a vacuous pass.
      expect(hasPermission(USERS[persona].id, module, 'read'), `holds ${module}:read`).toBe(true)
      for (const other of POPULATED.filter((t) => t !== reaches)) {
        expect(
          hasPermission(USERS[persona].id, HOST_MODULE_BY_ENTITY_TYPE[other], 'read'),
          `holds no ${HOST_MODULE_BY_ENTITY_TYPE[other]} grant`,
        ).toBe(false)
      }

      // The positive half — the same statement that returns 0 elsewhere returns
      // everything here. This is what stops the denials reading as "the policy
      // matches nothing any more".
      expect(
        valueRowsVisibleTo(USERS[persona].id, reaches, { before: stableBefore }),
        `${module}:read releases every ${reaches} answer row`,
      ).toBe(valueRowsInTable(reaches, { before: stableBefore }))

      // The negative half — one row of zeros, four entity types wide.
      for (const other of POPULATED.filter((t) => t !== reaches)) {
        expect(
          valueRowsVisibleTo(USERS[persona].id, other, { before: stableBefore }),
          `and not one ${other} answer row`,
        ).toBe(0)
      }
    })
  }

  test('a multi-module persona reads all five — the mirror of the three above', () => {
    // Without this, the three tests above are equally consistent with a policy
    // that released exactly one arbitrary entity type to everybody. `auditor`
    // holds `read` on all five host modules and nothing more, so she is the
    // control: same policy, same rows, five non-zero cells.
    for (const type of POPULATED) {
      expect(
        hasPermission(USERS.auditor.id, HOST_MODULE_BY_ENTITY_TYPE[type], 'read'),
        `the auditor holds ${HOST_MODULE_BY_ENTITY_TYPE[type]}:read`,
      ).toBe(true)
      expect(
        valueRowsVisibleTo(USERS.auditor.id, type, { before: stableBefore }),
        `so she reads every ${type} answer row`,
      ).toBe(valueRowsInTable(type, { before: stableBefore }))
    }

    // …and the floor, in the same run: no grant, no rows, on all five.
    for (const type of POPULATED) {
      expect(valueRowsVisibleTo(USERS.noAccess.id, type, { before: stableBefore }), `noAccess reads no ${type}`).toBe(0)
    }
  })

  test('the isolation is per-verb too, not only per-module', () => {
    // `capaSiteEditor` holds capa:approve/read/update. The interesting question
    // is not whether she reads CAPA answers — the test above settled that — but
    // whether her CAPA `update` leaks sideways into the NC rows, which is what a
    // policy that resolved the permission once per STATEMENT rather than once
    // per entity_type would do.
    const ncRow = seedValueRow('Nonconformance')
    const capaRow = seedValueRow('Capa')
    probes.push(ncRow, capaRow)

    const write = (userId, rowId) =>
      sqlAsAppUser(
        `UPDATE entity_field_values SET payload = payload || '{"cf2":1}'::jsonb WHERE id = '${rowId}';`,
        { userId, companyId: COMPANY_ID },
      )

    const editor = USERS.capaSiteEditor.id
    expect(hasPermission(editor, 'capa', 'update'), 'she holds capa:update').toBe(true)
    expect(hasPermission(editor, 'ncr', 'update'), 'and no ncr grant at all').toBe(false)

    // The pair, in this order deliberately: the CAPA write first, so the NC zero
    // that follows cannot be "her session was broken" or "the probe rows do not
    // exist". Same persona, same statement shape, two entity types.
    expect(
      affectedRows(write(editor, capaRow)),
      'capa:update lands on a Capa answers row',
    ).toBe(1)
    expect(
      affectedRows(write(editor, ncRow)),
      'and the identical statement touches nothing on a Nonconformance row',
    ).toBe(0)

    // And the NC row was writable all along — by somebody holding ncr:update.
    // Without this the zero above is also what a nonexistent row looks like.
    expect(
      affectedRows(write(USERS.reviewer.id, ncRow)),
      'the NC row was reachable — the reviewer reaches it',
    ).toBe(1)
  })

  test('a zero from an EMPTY entity type is not a denial — Training, shown both ways', () => {
    // The trap this file is written around. `trainingAdmin` holds
    // `training:create,delete,manage,read,update`, and reads 0 Training answer
    // rows — because the tenant holds none. An isolation matrix that included
    // Training would have recorded that 0 next to `capaSiteEditor`'s 0 and read
    // them as the same fact. They are opposites.
    expect(
      valueRowsInTable('Training'),
      'the tenant holds no Training answers — so far, a zero that means nothing',
    ).toBe(0)
    expect(valueRowsVisibleTo(USERS.trainingAdmin.id, 'Training')).toBe(0)
    expect(valueRowsVisibleTo(USERS.capaSiteEditor.id, 'Training')).toBe(0)

    // Give the entity type a row and the two zeros separate immediately.
    const trainingRow = seedValueRow('Training')
    probes.push(trainingRow)

    expect(
      hasPermission(USERS.trainingAdmin.id, 'training', 'read'),
      'the Training admin holds training:read',
    ).toBe(true)
    expect(
      valueRowsVisibleTo(USERS.trainingAdmin.id, 'Training'),
      'and now reads the row — her earlier zero was an empty table',
    ).toBe(1)
    expect(
      valueRowsVisibleTo(USERS.capaSiteEditor.id, 'Training'),
      'while the CAPA editor’s zero was, and stays, a denial',
    ).toBe(0)
  })
})
