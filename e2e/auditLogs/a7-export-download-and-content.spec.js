// ALD-A7 — URS-SEC-09, the export: a file that is actually DOWNLOADED and whose
// CONTENT is read back, plus the honest boundary of where the export exists.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT ALD-A5 ALREADY PROVES, AND WHAT IT DELIBERATELY DOES NOT
//
// ALD-A5 asserts the AFFORDANCE on both sides — Ava (`audit_trail:read`) is
// offered no Export CSV button, Olivia (owner bypass) is. Neither leg ever
// clicks it. So the requirement "the trail can be exported for review" rested
// on a button's visibility, which is compatible with an export that downloads
// nothing, downloads an empty file, or downloads a file missing the columns a
// reviewer needs. A signature block that cannot be read back is not evidence,
// and neither is an export nobody opened.
//
// This file downloads the file and reads it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PERSONA, AND WHY IT IS A NEW ONE
//
// Before seed §49 the tenant held exactly two `audit_trail` grants, both `read`
// (E2E Auditor, E2E Role Admin) — measured, and §35's own header says so and
// explains why: "Nothing in the product consumes audit_trail:export yet." That
// stopped being true when `AuditLogDialog.vue` grew
// `canExport = isAllowed(['audit_trail:export'])`.
//
// The only persona who could reach the button was therefore `owner`, through the
// `isOwner` short-circuit at the top of `isAllowed` — which proves the button
// renders and proves nothing whatever about the GRANT, because the owner would
// see it if the gate read `audit_trail:banana`. §49 seeds `trailExporter`
// (Tess), who holds `audit_trail:read` + `audit_trail:export` + `ncr:read` and
// nothing else.
//
// `ncr:read` is there because `AuditLogDialog` is embedded on ten DETAIL pages
// and on no standalone route, so an export journey must stand on a record the
// persona can OPEN — and `nonconformances_sel` releases a row only to the
// owner, to an in-scope `ncr:read` holder, to a task assignee, or to a user it
// is shared with. Without it the run would have failed on a page that never
// rendered, reading as "the export button is missing". It costs nothing,
// because the denial leg below is `auditor`, who holds `ncr:read` too: the pair
// still differs by `audit_trail:export` and by nothing else the dialog reads.
//
// Ava is untouched on purpose: ALD-A5's "reading the trail is not permission to
// export it" is a property this suite holds deliberately, and closing
// URS-SEC-09 by widening her role would have bought one requirement by breaking
// another.
//
// WHY TESS HOLDS `read` AS WELL AS `export`, which looks redundant and is not:
// `authz.effective_permission_strings` (read live) emits one string per granted
// row and adds NO implied read, so an export-only session would carry
// `audit_trail:export` without `audit_trail:read`, `canRead` would be false, the
// dialog would render its DENIAL state, and the Export button — which lives
// inside that `v-else` — would never mount. She would fail the journey she
// exists for, for a reason that reads like a product defect.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ THE BOUNDARY, STATED PLAINLY BECAUSE IT IS THE FINDING
//
// THE EXPORT EXISTS ON EXACTLY ONE SURFACE. `AuditLogDialog.vue` — the
// per-record history dialog, embedded on ten detail pages — has `exportCsv()`
// and its button. The FILTERED TRAIL PAGE HAS NEITHER. Grepping
// `Export|exportCsv|IconDownload` across `AuditLogsHome.vue`,
// `AuditLogsIndex.vue`, `AuditLogsList.vue` and `AuditLogsFilters.vue` returns
// ZERO hits; `useAuditLogs.js` has no export path either.
//
// That matters because the filtered page is the surface a reviewer reaches for.
// It is where module, action, actor and date-range filters live
// (`AuditLogsFilters.vue`), and a Part 11 review is normally scoped by those and
// not by one record. So the product can export "this record's history" and
// cannot export "every APPROVE in Documents last quarter" at all.
//
// The last test in this file pins that absence as a KNOWN GAP rather than
// quietly testing only the surface that works. Weakening URS-SEC-09 to "an
// export exists somewhere" would be the dishonest move here — the honest one is
// to prove the dialog export fully and name the one that is missing.
import fs from 'node:fs'
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  PROBE_NC,
  TRAIL_SYNC_TIMEOUT,
  auditLogMenuItem,
  auditRows,
  dbNow,
  gotoAuditLogs,
  revealRecordActions,
  seedProbeNc,
  trailDeniedNotice,
  waitForAuditRow,
} from '../fixtures/auditLogs.js'

const NC_PATH = `/nonconformances/${PROBE_NC.id}`
/** The IP the fixture's acts are made from, so the CSV column has a value to carry. */
const PROBE_IP = '203.0.113.90' // RFC 5737 TEST-NET-3 — never routable.

/** Split one CSV line, honouring the doubled-quote escaping `csvEscape` emits. */
function parseCsvLine(line) {
  const out = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(field)
      field = ''
    } else {
      field += c
    }
  }
  out.push(field)
  return out
}

/**
 * Write one attributed, addressed UPDATE onto the probe NC, so the exported
 * rows are guaranteed to carry a performer AND an IP. Without this the CSV
 * could legitimately contain only rows whose `ip_address` is NULL and the
 * column assertion would be vacuous.
 *
 * `title` is in the `nonconformances` audit trackFields, so this produces a
 * real old→new diff rather than an ignored write.
 */
function touchProbeNc(tag) {
  sql(
    `SELECT set_config('app.current_user_id', '${USERS.owner.id}', false);
     SELECT set_config('app.current_user_ip', '${PROBE_IP}', false);
     UPDATE nonconformances SET title = '${tag}', updated_at = NOW()
      WHERE id = '${PROBE_NC.id}';`,
  )
}

test.describe('ALD-A7 · URS-SEC-09 — the trail export, downloaded and read', () => {
  test('a grant holder downloads the record’s trail, and the file carries the rows', async ({
    browser,
  }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 180_000)

    // ── Arrange. A record with a history that this test wrote, so "the CSV has
    // rows" can be upgraded to "the CSV has THESE rows".
    const since = dbNow()
    seedProbeNc(USERS.owner.id)
    await waitForAuditRow({
      entityType: 'Nonconformances',
      entityId: PROBE_NC.id,
      action: 'CREATE',
      since,
    })

    const tag = `ALD-A7 export subject ${Date.now()}`
    const updateSince = dbNow()
    touchProbeNc(tag)
    await waitForAuditRow({
      entityType: 'Nonconformances',
      entityId: PROBE_NC.id,
      action: 'UPDATE',
      since: updateSince,
    })

    // Ground truth at the database, before the browser is involved. If the UPDATE
    // row did not land with an IP, the column assertion below would fail for a
    // reason that has nothing to do with the export.
    expect(
      sqlValue(
        `SELECT ip_address FROM audit_logs
          WHERE entity_id = '${PROBE_NC.id}' AND action = 'UPDATE'
            AND created_at > '${updateSince}' ORDER BY created_at DESC LIMIT 1`,
      ),
      'the row the export must carry has an address on it',
    ).toBe(PROBE_IP)

    const ctx = await browser.newContext({ storageState: AUTH.trailExporter })
    try {
      const page = await ctx.newPage()
      await page.goto(NC_PATH, { waitUntil: 'domcontentloaded', timeout: 30_000 })

      // Assert the RECORD rendered before asserting anything about the button.
      // Tess reaches this page on `ncr:read` at tenant scope (seed §49), and if
      // that ever stopped holding — a scope change, a policy edit — the button
      // would be absent for a reason that has nothing to do with the export
      // grant, and the failure would read as "the export button is missing"
      // three steps from its cause. This barrier makes the two distinguishable.
      await expect(
        page.getByText(PROBE_NC.number).first(),
        'the record renders for the export persona — a missing button below is then about the button',
      ).toBeVisible({ timeout: 60_000 })

      await revealRecordActions(page)
      await expect(
        auditLogMenuItem(page),
        'export implies read, so the History affordance is offered',
      ).toBeVisible({ timeout: 20_000 })
      await auditLogMenuItem(page).click()

      // The headlessui `role="dialog"` node is a zero-box wrapper — usable as a
      // SCOPE, useless as a visibility assertion. The heading is what is painted.
      const dialog = page.getByRole('dialog')
      await expect(
        page.getByRole('heading', { name: `Audit Log — ${PROBE_NC.number}` }),
        'the history dialog opened',
      ).toBeVisible({ timeout: 20_000 })
      await expect(
        trailDeniedNotice(dialog),
        'and she is not looking at the denial state — `read` is in the grant for exactly this reason',
      ).toHaveCount(0)

      // The rows must be IN THE DIALOG before the export is clicked. `exportCsv`
      // serialises `logs.value`, which is a live IndexedDB query — clicking
      // while it is still `[]` downloads a header-only file, and the assertion
      // would fail on a product that works.
      await expect(
        auditRows(dialog).first(),
        'the history is loaded — the export is built from these rows, not from a server round trip',
      ).toBeVisible({ timeout: TRAIL_SYNC_TIMEOUT })

      const exportBtn = dialog.getByRole('button', { name: /Export CSV/ })
      await expect(
        exportBtn,
        'the export grant — and not the owner bypass — puts the button on screen',
      ).toBeVisible({ timeout: 20_000 })

      // ── Act. THE DOWNLOAD ITSELF, which is what this file exists for.
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click(),
      ])

      expect(
        download.suggestedFilename(),
        'it downloads as a CSV named for the record it came from',
      ).toMatch(/^audit-log-.*\.csv$/)

      const path = await download.path()
      expect(path, 'the browser actually wrote a file').toBeTruthy()
      const csv = fs.readFileSync(path, 'utf8')

      // ── Assert the CONTENT. A header-only file is the failure mode a
      // visibility-only test cannot see, so the row count is checked first.
      const lines = csv.split('\n').filter((l) => l.trim().length > 0)
      expect(lines.length, 'the file has a header AND at least one data row').toBeGreaterThan(1)

      // Every column a reviewer needs, by name and in order. Asserting
      // `csv.includes('IP Address')` would pass on a file whose header drifted
      // out of alignment with its rows — the defect that makes an export
      // unusable without making it look broken.
      expect(
        parseCsvLine(lines[0]),
        'the header names when, what, who, and from where — the four a Part 11 reviewer reads',
      ).toEqual([
        'When',
        'Action',
        'Entity Type',
        'Entity ID',
        'Performed By',
        'User ID',
        'IP Address',
        'Old Value',
        'New Value',
      ])

      const header = parseCsvLine(lines[0])
      const rows = lines.slice(1).map(parseCsvLine)
      const col = (row, name) => row[header.indexOf(name)]

      // Only rows for THIS record may be in a per-record export. An export that
      // leaked the whole tenant's trail would still satisfy "it has rows".
      for (const row of rows) {
        expect(
          col(row, 'Entity ID'),
          'a per-record export contains only that record’s history',
        ).toBe(PROBE_NC.id)
      }

      // The UPDATE this test performed, found by the value it wrote. This is
      // what upgrades "the file has rows" to "the file has the right rows".
      const updateRow = rows.find((r) => col(r, 'Action') === 'UPDATE')
      expect(updateRow, 'the change this test made is in the export').toBeTruthy()
      expect(
        col(updateRow, 'New Value'),
        'carrying the new value — the "what changed" half of the record',
      ).toContain(tag)
      expect(
        col(updateRow, 'Old Value'),
        'and the value it replaced, so the change is legible without the live system',
      ).not.toBe('')
      expect(
        col(updateRow, 'IP Address'),
        'and the address it came from — the column that exists ONLY here, nowhere on screen',
      ).toBe(PROBE_IP)
      expect(
        col(updateRow, 'User ID'),
        'attributed by id, which survives a rename',
      ).toBe(USERS.owner.id)
      expect(
        col(updateRow, 'Performed By'),
        'and by the name a reader recognises — resolved from the User model, not left as a uuid',
      ).toBe(USERS.owner.name)
      expect(col(updateRow, 'When'), 'and timestamped').not.toBe('')

      // The CREATE is there too. A trail that exports only the most recent
      // change is not a history.
      expect(
        rows.some((r) => col(r, 'Action') === 'CREATE'),
        'the record’s creation is in the same export — this is a history, not a latest-change view',
      ).toBeTruthy()
    } finally {
      await ctx.close()
    }
  })

  test('the export is a SEPARATE grant — a reader still cannot download it', async ({
    browser,
  }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 120_000)

    // The pair that makes the download above mean something. ALD-A5 asserts
    // this for Ava as an affordance; it is re-asserted here against the SAME
    // record, in the SAME run, immediately after a persona downloaded from it —
    // so "no button" cannot be explained by the dialog being broken, the rows
    // being absent, or the seed not having applied.
    const since = dbNow()
    seedProbeNc(USERS.owner.id)
    await waitForAuditRow({
      entityType: 'Nonconformances',
      entityId: PROBE_NC.id,
      action: 'CREATE',
      since,
    })

    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await ctx.newPage()
      await page.goto(NC_PATH, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await expect(page.getByText(PROBE_NC.number).first()).toBeVisible({ timeout: 60_000 })

      await revealRecordActions(page)
      await auditLogMenuItem(page).click()
      const dialog = page.getByRole('dialog')
      await expect(
        page.getByRole('heading', { name: `Audit Log — ${PROBE_NC.number}` }),
      ).toBeVisible({ timeout: 20_000 })

      // She READS it — the positive half. Without this the absence below is
      // equally consistent with a persona who cannot see the dialog at all.
      await expect(
        auditRows(dialog).first(),
        'the reader genuinely reads the trail',
      ).toBeVisible({ timeout: TRAIL_SYNC_TIMEOUT })

      await expect(
        dialog.getByRole('button', { name: /Export CSV/ }),
        'and still cannot take it out of the building — read and export are separate actions',
      ).toHaveCount(0)
    } finally {
      await ctx.close()
    }

    // The grant split at its source, so the UI result above cannot be a
    // coincidence of rendering. Exactly one role in this tenant holds export.
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions
          WHERE company_id = '${COMPANY_ID}' AND module_id = 'audit_trail'
            AND action_id = 'export'`,
      ),
      'exactly one role holds audit_trail:export — §49’s, and nobody else’s',
    ).toBe('1')
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id AND ru.deleted_at IS NULL
          WHERE rmp.company_id = '${COMPANY_ID}' AND rmp.module_id = 'audit_trail'
            AND rmp.action_id = 'export' AND ru.user_id = '${USERS.auditor.id}'`,
      ),
      'and the reader persona is not in it',
    ).toBe('0')
  })

  test('KNOWN GAP · the FILTERED trail page offers no export at all', async ({ browser }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 120_000)

    // ── KNOWN DEFECT ALD-EXPORT-01: URS-SEC-09 is only HALF met.
    //
    // The per-record dialog exports (proved above). `/audit-logs` — the surface
    // that carries the module / action / actor / date-range filters, i.e. the
    // one a reviewer actually scopes a Part 11 review with — has NO export of
    // any kind. Verified in source, not inferred from the screen:
    //
    //   * `AuditLogsHome.vue`, `AuditLogsIndex.vue`, `AuditLogsList.vue` and
    //     `AuditLogsFilters.vue` contain no `Export`, no `exportCsv`, no
    //     `IconDownload`.
    //   * `composables/useAuditLogs.js` exposes `auditLogs`, `filters`,
    //     `loading` and `resetFilters` — no serialiser, no download path.
    //   * `exportCsv()` and `canExport` exist ONLY in `AuditLogDialog.vue`.
    //
    // CONSEQUENCE: "export every APPROVE in Documents for Q3" is not an
    // operation the product supports. A reviewer must open each record and
    // export ten separate files, or query the database directly.
    //
    // This test is written to FAIL THE DAY THE GAP CLOSES. It pins the absence
    // deliberately, and the right response to it going red is to delete it and
    // assert the new export's content the way the first test does — NOT to
    // relax it. It is here so the validation record says "half met, measured"
    // instead of "met".
    const ctx = await browser.newContext({ storageState: AUTH.trailExporter })
    try {
      const page = await ctx.newPage()
      await gotoAuditLogs(page)

      // The positive control first. This persona holds the widest audit grant in
      // the tenant and the page is populated for her — so an absent button below
      // is a product fact and not an empty or denied page.
      await expect(
        auditRows(page).first(),
        'the filtered trail page renders rows for the export holder',
      ).toBeVisible({ timeout: TRAIL_SYNC_TIMEOUT })

      // And the filters she would scope a review with are right there, which is
      // what makes the missing export a gap rather than a design choice.
      await expect(
        page.getByRole('button', { name: /Export/i }),
        'KNOWN DEFECT ALD-EXPORT-01 — the filtered trail page has no export, so a filter-scoped review cannot be exported at all',
      ).toHaveCount(0)
      await expect(
        page.getByRole('menuitem', { name: /Export/i }),
        'nor behind an overflow menu',
      ).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })
})
