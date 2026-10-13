// SMK-007 · the second tenant cannot read a single first-tenant record by id.
//
// The cheapest possible cross-tenant gate: the E2EALT owner (a real, fully
// privileged owner — isOwner bypass inside ITS tenant) asks for known E2ELAB ids,
// one per module, over both read surfaces:
//
//   GraphQL  — `<singular>(id: $id)`, the exact shape the SyncEngine's own fetch
//              uses (syncEngine/network/GraphQLSchemaGenerator.js generateQueryStrings).
//   REST     — the module's GET-by-id route, where one exists.
//
// Every answer must be "nothing": GraphQL `data.<field> === null` (or an error),
// REST 401/403/404 or a 2xx that does not carry the record. A leak is any
// response that contains the foreign record's id.
//
// POSITIVE CONTROL. A probe that is broken (wrong field name, route moved) also
// returns "nothing", which would read as a pass. So every GraphQL probe is first
// run as the E2ELAB owner, who MUST get the row back; a type whose control fails
// is reported as INCONCLUSIVE and fails the test softly rather than passing.
//
// Ids come from read-only SQL at runtime; a type with no E2ELAB rows is skipped
// with an annotation.
import { test, expect, request } from '@playwright/test'
import { AUTH, BASE_URL, ALT_BASE_URL, ALT_USERS } from '../fixtures/cast.js'
import { gql, sampleLabId } from '../fixtures/smoke.js'

/**
 * table     — Postgres table (company_id-scoped)
 * field     — PostGraphile single-row field (pluralize.singular of the ClientModel table)
 * rest(id)  — REST GET-by-id path through the Vite proxy, where the api has one
 */
const PROBES = [
  { label: 'Nonconformance', table: 'nonconformances', field: 'nonconformance' },
  { label: 'CAPA', table: 'capas', field: 'capa' },
  {
    label: 'Change request',
    table: 'change_requests',
    field: 'changeRequest',
    // No plain GET /changeRequests/:id exists; /links is the only per-id read.
    rest: (id) => `/api/v1/services/changeRequests/${id}/links`,
  },
  {
    label: 'Document',
    table: 'documents',
    field: 'document',
    rest: (id) => `/api/v1/services/documents/${id}`,
  },
  { label: 'Complaint (internal)', table: 'complaints', field: 'complaint' },
  { label: 'Customer complaint', table: 'customer_complaints', field: 'customerComplaint' },
  {
    label: 'Supplier',
    table: 'suppliers',
    field: 'supplier',
    rest: (id) => `/api/v1/services/suppliers/${id}`,
  },
  {
    label: 'Training instance',
    table: 'training_instances',
    field: 'trainingInstance',
    rest: (id) => `/api/v1/services/trainingInstances/${id}`,
  },
  { label: 'Quality event', table: 'quality_events', field: 'qualityEvent' },
  {
    label: 'Inspection lot',
    table: 'inspection_lots',
    field: 'inspectionLot',
    rest: (id) => `/api/v1/services/qcInspection/lots/${id}`,
  },
  {
    label: 'Log entry (field record)',
    table: 'field_records',
    field: 'fieldRecord',
    rest: (id) => `/api/v1/services/fieldRecords/${id}`,
  },
  {
    label: 'Task',
    table: 'task_instances',
    field: 'taskInstance',
    rest: (id) => `/api/v1/services/taskInstances/${id}`,
  },
  { label: 'Custom-field value', table: 'entity_field_values', field: 'entityFieldValue' },
  {
    label: 'Module record',
    table: 'records',
    field: 'record',
    rest: (id) => `/api/v1/services/records/${id}`,
  },
]

function gqlQueryFor(field) {
  return `query SmkIsolation($id: UUID!) { ${field}(id: $id) { id } }`
}

function pad(s, n) {
  s = String(s)
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

test.describe('SMK-007 · tenant isolation matrix', () => {
  test(
    'E2EALT owner cannot read any E2ELAB record by id (GraphQL + REST)',
    { tag: ['@smoke', '@p0'] },
    async () => {
      test.setTimeout(120_000)
      const alt = await request.newContext({ baseURL: ALT_BASE_URL, storageState: AUTH.altOwner })
      const lab = await request.newContext({ baseURL: BASE_URL, storageState: AUTH.owner })
      const rows = []
      const leaks = []
      const inconclusive = []
      try {
        // The attacker's session must be real, or every "denied" below is meaningless.
        const who = await alt.get('/api/v1/auth/session', { failOnStatusCode: false })
        expect(who.status(), 'E2EALT owner session is live').toBe(200)
        expect((await who.json())?.session?.email, 'probing as the E2EALT owner').toBe(
          ALT_USERS.owner.email,
        )

        for (const p of PROBES) {
          const id = sampleLabId(p.table)
          if (!id) {
            test
              .info()
              .annotations.push({
                type: 'skipped-type',
                description: `${p.label}: no E2ELAB rows in ${p.table}`,
              })
            rows.push({ label: p.label, id: '—', control: 'skip', gql: 'skip', rest: 'skip' })
            continue
          }

          // Positive control: the home-tenant owner sees it through the same query.
          const ctl = await gql(lab, gqlQueryFor(p.field), { id })
          const controlOk = ctl.status === 200 && ctl.body?.data?.[p.field]?.id === id
          const controlNote = controlOk
            ? 'ok'
            : `FAIL(${ctl.status}${ctl.body?.errors ? ': ' + ctl.body.errors[0]?.message?.slice(0, 80) : ''})`

          // Attack: GraphQL.
          const atk = await gql(alt, gqlQueryFor(p.field), { id })
          const gqlLeak = atk.body?.data?.[p.field]?.id === id
          const gqlNote = gqlLeak
            ? 'LEAK'
            : atk.body?.errors
              ? `denied(err: ${atk.body.errors[0]?.message?.slice(0, 50)})`
              : `denied(${atk.status}, null)`
          if (gqlLeak)
            leaks.push(`${p.label} ${id} — GraphQL ${p.field}(id) returned the row to E2EALT`)
          if (!controlOk && !gqlLeak)
            inconclusive.push(
              `${p.label}: GraphQL positive control ${controlNote} — probe proves nothing`,
            )

          // Attack: REST.
          let restNote = 'n/a'
          if (p.rest) {
            const url = p.rest(id)
            const r = await alt.get(url, { failOnStatusCode: false })
            const text = await r.text().catch(() => '')
            const restLeak = r.ok() && text.includes(id)
            restNote = restLeak ? `LEAK(${r.status()})` : `denied(${r.status()})`
            if (restLeak)
              leaks.push(`${p.label} ${id} — REST GET ${url} → ${r.status()} carrying the record`)
            if (r.status() >= 500) {
              test
                .info()
                .annotations.push({
                  type: 'rest-5xx',
                  description: `${p.label}: GET ${url} → ${r.status()} (not a leak, but a server error)`,
                })
            }
          }
          rows.push({ label: p.label, id, control: controlNote, gql: gqlNote, rest: restNote })
        }
      } finally {
        await alt.dispose()
        await lab.dispose()
      }

      const table = [
        `${pad('type', 26)} ${pad('E2ELAB id', 36)} ${pad('control', 10)} ${pad('graphql', 42)} rest`,
        ...rows.map(
          (r) =>
            `${pad(r.label, 26)} ${pad(r.id, 36)} ${pad(r.control, 10)} ${pad(r.gql, 42)} ${r.rest}`,
        ),
      ].join('\n')
      await test.info().attach('isolation-matrix.txt', { body: table, contentType: 'text/plain' })

      expect
        .soft(
          inconclusive,
          `probes whose positive control failed:\n${inconclusive.join('\n')}\n\n${table}`,
        )
        .toEqual([])
      expect(
        leaks,
        `CROSS-TENANT LEAKS (${leaks.length}):\n${leaks.join('\n')}\n\n${table}`,
      ).toEqual([])
      expect(
        rows.filter((r) => r.id !== '—').length,
        `at least one type was actually probed\n\n${table}`,
      ).toBeGreaterThan(0)
    },
  )
})
