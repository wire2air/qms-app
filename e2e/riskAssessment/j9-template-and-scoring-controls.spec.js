// RA-J9 — TC-08-01 (URS-RSK-01) and TC-08-02 (URS-RSK-02): the scoring method
// is defined and controlled, and an assessment can only be scored against it.
//
// WHY THIS FILE EXISTS. §11 scores both requirements Partial and names the
// gaps precisely:
//   URS-RSK-01 — "Not covered: scoring dimensions and risk bands against an
//     approved method." J5 proves the seeded template is VISIBLE and is the
//     one the workflow field binds. It never looks inside `config`, and it
//     never probes who may change it: its denial test asserts the New Template
//     BUTTON is absent for a zero-grant persona, which is a UI observation —
//     and TC-08-01 step 5's own note says outright that "an inspection-only
//     observation is not evidence for this step."
//   URS-RSK-02 — "Not covered: standalone assessment or a multi-hazard list;
//     only one cell per step." Those two are genuinely absent from the
//     product (TC-08-02 steps 3/4/5 are N/A for that reason), but the steps
//     that ARE executable — step 2's completeness gate and step 6's
//     "only the template's own values are selectable" — have no assertion of
//     the POSITIVE constraint anywhere. J2 pins the Finalize button's disabled
//     state; nothing pins that the matrix offers the template's scale and
//     nothing else.
//
// ── TC-08-01: WHAT "AGAINST AN APPROVED METHOD" MEANS FOR AN AUTOMATED TEST
// An executor compares the configured template to their own SOP. A test has no
// SOP, so it compares the template to the ONE artefact that plays that role
// here: e2e-seed.sql §44b, the declared scoring method for this tenant,
// mirrored in fixtures/cast.js as RISK_ASSESSMENT.template. That mirror is the
// "approved method" of record, and the check below is a genuine
// reconciliation, not a tautology — cast.js and the seed are two independently
// maintained files, and RA-J6's hand calculation is computed from the same
// declaration. A drift in either is a real finding: it would mean the matrix
// the suite scores against is not the matrix it believes it is scoring
// against, which is exactly the configuration-control failure step 1-4 exist
// to catch.
//
// Steps 2-4 also demand the SCALES and the BANDS, not just the dimension
// names — so every level's score and every one of the nine cells' band is
// reconciled, and the FMEA-mode box (TC-08-01's own "record which mode")
// is asserted as Disabled, which is the premise RA-J6's arithmetic rests on.
//
// ── TC-08-01 STEP 5: BY TEST, AT THE POLICY, AS THE NOTE DEMANDS ───────────
// "The template's row-level policies are generated at runtime rather than
// written into the policy file, so there is no settings page or policy listing
// to read the answer off. Confirm it by test." Live shape (pg_policies,
// verified):
//     risk_assessment_templates_upd  USING + WITH CHECK
//       company_id = authz.current_company_id()
//       AND (current_is_owner() OR (has_permission('risk_assessment_templates','update')
//            AND scope_allowed(..., created_by, NULL, NULL)))
// `reviewer` is the persona that makes this non-vacuous: they hold capa
// read+update — they are a real assessor who scores against this very matrix
// every journey in this project — and they hold ZERO
// risk_assessment_templates grants. `author` holds all four and is the
// admitting control, without which a policy that had stopped matching
// anything would make the refusal pass for the wrong reason.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, RISK_ASSESSMENT, USERS } from '../fixtures/cast.js'
import { findCapaByTitle, sql, sqlAsAppUser, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { createCapa, uniqueTitle, openCapa } from '../fixtures/capas.js'
import { purgeRiskAssessment } from '../fixtures/riskAssessment.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`
const TEMPLATE = RISK_ASSESSMENT.template

/** The seeded template's `config` JSONB, parsed. Never string-matched. */
function readTemplateConfig() {
  const out = sql(
    `SELECT config::text FROM risk_assessment_templates WHERE id = ${quote(TEMPLATE.id)}`,
  )
  if (!out) return null
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

test.describe('RA-J9 · TC-08-01 / TC-08-02 the scoring method is defined and controlled', () => {
  test('steps 1-4 — the template\'s dimensions, scales and bands reconcile with the declared scoring method, and FMEA mode is Disabled', async () => {
    const config = readTemplateConfig()
    expect(config, 'the template under test exists and its config parses').toBeTruthy()

    // Step 2 — THE DIMENSIONS. Two axes, likelihood and severity, and (per the
    // FMEA box below) no third.
    expect(Array.isArray(config.likelihood), 'a likelihood dimension is configured').toBe(true)
    expect(Array.isArray(config.severity), 'a severity dimension is configured').toBe(true)
    expect(config.likelihood.length, 'three likelihood levels, as declared').toBe(3)
    expect(config.severity.length, 'three severity levels, as declared').toBe(3)

    // TC-08-01's FMEA-mode box. The E2E template runs with detectability
    // DISABLED, so the RPN is likelihood x severity — which is the premise
    // RA-J6's hand calculation depends on. If this ever flips, RA-J6's
    // expected values are wrong and this assertion is where that is caught.
    expect(
      config.enableDetectability,
      'FMEA mode is DISABLED for this template: the RPN is likelihood x severity, with no detectability factor',
    ).toBe(false)
    expect(config.detectability ?? [], 'and no detectability scale is configured').toEqual([])

    // Step 3 — THE SCALES AND THE MEANING OF EACH VALUE. Every level's id,
    // label and score reconciled against the declared method one by one, so a
    // rescale (score 3 quietly becoming 5) is a failure rather than a silent
    // change of what every assessment in the tenant means.
    const EXPECTED_LIKELIHOOD = [
      { ...TEMPLATE.likelihood.low, score: 1 },
      { ...TEMPLATE.likelihood.medium, score: 2 },
      { ...TEMPLATE.likelihood.high, score: 3 },
    ]
    const EXPECTED_SEVERITY = [
      { ...TEMPLATE.severity.minor, score: 1 },
      { ...TEMPLATE.severity.moderate, score: 2 },
      { ...TEMPLATE.severity.severe, score: 3 },
    ]
    for (const [axis, expected, actual] of [
      ['likelihood', EXPECTED_LIKELIHOOD, config.likelihood],
      ['severity', EXPECTED_SEVERITY, config.severity],
    ]) {
      for (const level of expected) {
        const found = actual.find((l) => l.id === level.id)
        expect(found, `${axis} level "${level.label}" is configured`).toBeTruthy()
        expect(found.label, `${axis} "${level.label}" keeps its label`).toBe(level.label)
        expect(
          found.score,
          `${axis} "${level.label}" scores ${level.score} — a rescale here silently changes every RPN in the tenant`,
        ).toBe(level.score)
      }
    }

    // Step 4 — THE RISK-LEVEL BANDS, and the full cell map. Three bands, and
    // all nine cells mapped: an UNMAPPED cell is a real product behaviour
    // (OQ-08 §5's last bullet — "an unmapped matrix cell finalizes with a real
    // RPN but no risk band"), so "every cell resolves to a band" has to be
    // asserted, not assumed.
    expect(config.riskLevels.length, 'three acceptability bands').toBe(3)
    for (const key of ['low', 'medium', 'high']) {
      const band = config.riskLevels.find((r) => r.id === TEMPLATE.riskLevels[key].id)
      expect(band, `the "${TEMPLATE.riskLevels[key].label}" band is configured`).toBeTruthy()
      expect(band.label).toBe(TEMPLATE.riskLevels[key].label)
    }

    const cells = config.cells ?? {}
    expect(
      Object.keys(cells).length,
      'all 3x3 = 9 cells are mapped — an unmapped cell would finalize with an RPN and NO band',
    ).toBe(9)
    const bandById = new Map(config.riskLevels.map((r) => [r.id, r.label]))
    // The declared cell map, transcribed from §44b by hand — the same
    // reconciliation an executor performs against their SOP's acceptability
    // criteria.
    const EXPECTED_CELLS = {
      'Low:Minor': 'Low',
      'Low:Moderate': 'Low',
      'Low:Severe': 'Medium',
      'Medium:Minor': 'Low',
      'Medium:Moderate': 'Medium',
      'Medium:Severe': 'High',
      'High:Minor': 'Medium',
      'High:Moderate': 'High',
      'High:Severe': 'High',
    }
    const idFor = (axis, label) =>
      TEMPLATE[axis][label.toLowerCase()].id
    for (const [name, expectedBand] of Object.entries(EXPECTED_CELLS)) {
      const [lLabel, sLabel] = name.split(':')
      const key = `${idFor('likelihood', lLabel)}:${idFor('severity', sLabel)}`
      expect(cells[key], `cell ${name} is mapped`).toBeTruthy()
      expect(
        bandById.get(cells[key]),
        `cell ${name} resolves to the "${expectedBand}" band — the acceptability criterion for that combination`,
      ).toBe(expectedBand)
    }
  })

  test('step 5 — a user without risk_assessment_templates:update cannot alter the template, proven AT THE POLICY (an inspection is not evidence)', async () => {
    const before = readTemplateConfig()
    expect(before, 'arrange: the template is readable').toBeTruthy()

    // The persona is deliberately NOT a zero-grant one. `reviewer` holds capa
    // read+update — they are the assessor who scores against this matrix in
    // every other journey in this project — and zero template grants. That is
    // the real-world shape of the control: the people who USE the matrix must
    // not be able to redefine it.
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users rou ON rou.role_id = rmp.role_id
          WHERE rou.user_id = ${quote(USERS.reviewer.id)}
            AND rmp.company_id = ${quote(COMPANY_ID)}
            AND rmp.module_id = 'risk_assessment_templates'`,
      ),
      'arrange: the refusing persona genuinely holds no template grant',
    ).toBe('0')

    // (a) Rescaling an axis — the change that retroactively alters what every
    // future RPN means.
    const rescale = sqlAsAppUser(
      `UPDATE public.risk_assessment_templates
          SET config = jsonb_set(config, '{likelihood,0,score}', '99'::jsonb)
        WHERE id = ${quote(TEMPLATE.id)};`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(rescale.ok, `sqlAsAppUser should not error: ${rescale.error}`).toBe(true)
    expect(
      readTemplateConfig().likelihood.find((l) => l.id === TEMPLATE.likelihood.low.id).score,
      'the scale did not move — a template-update holder is required',
    ).toBe(1)

    // (b) Remapping a cell — the change that silently reclassifies a risk.
    const highSevereKey = `${TEMPLATE.likelihood.high.id}:${TEMPLATE.severity.severe.id}`
    const remap = sqlAsAppUser(
      `UPDATE public.risk_assessment_templates
          SET config = jsonb_set(config, '{cells,${highSevereKey}}', ${quote(`"${TEMPLATE.riskLevels.low.id}"`)}::jsonb)
        WHERE id = ${quote(TEMPLATE.id)};`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(remap.ok, `sqlAsAppUser should not error: ${remap.error}`).toBe(true)
    expect(
      readTemplateConfig().cells[highSevereKey],
      'the highest-risk cell still maps to the High band — it was not downgraded',
    ).toBe(TEMPLATE.riskLevels.high.id)

    // (c) Renaming, and (d) retiring by soft-delete — F-06's note is that the
    // UI's "Delete" is really a GraphQL UPDATE of deleted_at, governed by the
    // update permission, so both go through the same policy.
    sqlAsAppUser(
      `UPDATE public.risk_assessment_templates SET name = 'Renamed by an unauthorized user' WHERE id = ${quote(TEMPLATE.id)};`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(
      sqlValue(`SELECT name FROM risk_assessment_templates WHERE id = ${quote(TEMPLATE.id)}`),
      'the template kept its name',
    ).toBe(TEMPLATE.name)
    sqlAsAppUser(
      `UPDATE public.risk_assessment_templates SET deleted_at = now() WHERE id = ${quote(TEMPLATE.id)};`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(
      sqlValue(`SELECT deleted_at FROM risk_assessment_templates WHERE id = ${quote(TEMPLATE.id)}`),
      'and was not retired out from under the assessments scored against it',
    ).toBeFalsy()

    // CONTROL — `author` holds all four template verbs and MUST be admitted.
    // Without this the four refusals above would pass equally well against a
    // policy that had stopped matching anything at all (RA-J3's vacuity
    // lesson). The description column is used so the control cannot disturb
    // the scoring method the rest of this project depends on, and it is put
    // straight back.
    const original = sqlValue(
      `SELECT COALESCE(description,'') FROM risk_assessment_templates WHERE id = ${quote(TEMPLATE.id)}`,
    )
    const marker = `E2E RA-J9 control ${Date.now()}`
    const control = sqlAsAppUser(
      `UPDATE public.risk_assessment_templates SET description = ${quote(marker)} WHERE id = ${quote(TEMPLATE.id)};`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(control.ok, `sqlAsAppUser should not error: ${control.error}`).toBe(true)
    expect(
      sqlValue(
        `SELECT description FROM risk_assessment_templates WHERE id = ${quote(TEMPLATE.id)}`,
      ),
      'a risk_assessment_templates:update holder CAN write — the probe above is sound',
    ).toBe(marker)
    sqlValue(
      `UPDATE risk_assessment_templates SET description = ${quote(original)} WHERE id = ${quote(TEMPLATE.id)}`,
    )

    // THE BOUNDARY, recorded rather than implied. The SELECT policy is
    // company-only — `risk_assessment_templates_sel` is
    // `company_id = authz.current_company_id()` with NO permission clause — so
    // every authenticated user in the tenant can READ the matrix, grant or
    // not. TC-08-01 asks only about ALTERING it, so this is not a failure of
    // the step; it is pinned so "the template is controlled" is never read as
    // "the template is confidential".
    // `::text` on a boolean renders 'true'/'false' here, not 't'/'f' — the
    // short forms only come back from psql's own tuple formatting of a real
    // boolean COLUMN. Count matching policies instead, which has one
    // unambiguous rendering either way.
    const selGatedCount = sqlValue(
      `SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'risk_assessment_templates'
          AND cmd = 'SELECT' AND COALESCE(qual,'') LIKE '%has_permission%'`,
    )
    expect(
      selGatedCount,
      'KNOWN BEHAVIOUR: risk_assessment_templates_sel is tenancy-only — the scoring method is readable tenant-wide by design. Only WRITE is permission-gated.',
    ).toBe('0')
    // …and the SELECT policy does exist, so the zero above means "ungated",
    // not "no policy at all" (which would mean the table was unreadable).
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'risk_assessment_templates' AND cmd = 'SELECT'`,
      ),
      'a SELECT policy is present — the zero above is "ungated", not "absent"',
    ).toBe('1')
  })

  test('TC-08-02 steps 2 and 6 — the matrix offers ONLY the template\'s own values, and both axes are required before an assessment can be finalized', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await ctxAuthor.newPage()
    const title = uniqueTitle('RA-J9-scale')
    await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
    const capa = findCapaByTitle(title)
    expect(capa, 'the CAPA landed in Postgres').not.toBeNull()
    purgeRiskAssessment(capa.id)
    await openCapa(authorPage, capa.id)
    await ctxAuthor.close()

    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = ${quote(capa.id)}
          AND assigned_to = ${quote(USERS.reviewer.id)} AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
      { timeoutMs: 45_000, label: 'reviewer task assigned' },
    )

    const ctxReviewer = await browser.newContext({ storageState: AUTH.reviewer })
    const page = await ctxReviewer.newPage()
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})

    const table = page.locator('table').filter({ has: page.getByText('Likelihood', { exact: false }) }).first()
    await expect(table, 'the matrix rendered against the bound template').toBeVisible({
      timeout: 30_000,
    })

    // Step 2 — THE COMPLETENESS GATE. Read the protocol's own note: there is
    // no title and no scope field on this assessment, so there is nothing for
    // the system to refuse and a refusal must not be recorded. The equivalent
    // control is that BOTH axes must be chosen before Finalize is available
    // (canFinalize === !!likelihoodId && !!severityId).
    const finalizeBtn = page.getByRole('button', { name: 'Finalize Assessment' })
    await expect(finalizeBtn, 'the Finalize control exists on an editable step').toBeVisible({
      timeout: 20_000,
    })
    await expect(
      finalizeBtn,
      'and is DISABLED until a likelihood and a severity are both chosen',
    ).toBeDisabled()

    // Step 6 — ONLY THE TEMPLATE'S OWN VALUES. Scoring is done by clicking a
    // matrix CELL, so an out-of-scale value cannot be typed in the first
    // place; the protocol says to confirm the constraint POSITIVELY instead.
    // Enumerate the rendered axes and prove they are exactly the template's.
    const colHeaders = table.locator('thead th')
    const headerCount = await colHeaders.count()
    const renderedSeverity = []
    // nth(0) is the "Likelihood ↓ / Severity →" corner label, not a level.
    for (let i = 1; i < headerCount; i += 1) {
      renderedSeverity.push((await colHeaders.nth(i).innerText()).trim())
    }
    const expectedSeverity = [
      TEMPLATE.severity.minor,
      TEMPLATE.severity.moderate,
      TEMPLATE.severity.severe,
    ]
    expect(
      renderedSeverity.length,
      'exactly the template\'s three severity levels are offered — no more',
    ).toBe(expectedSeverity.length)
    for (let i = 0; i < expectedSeverity.length; i += 1) {
      expect(
        renderedSeverity[i],
        `severity column ${i} is the template's "${expectedSeverity[i].label}", and shows its score`,
      ).toContain(expectedSeverity[i].label)
    }

    const rowHeaders = table.locator('tbody tr td:first-child')
    const rowCount = await rowHeaders.count()
    expect(rowCount, 'exactly the template\'s three likelihood levels are offered').toBe(3)
    const expectedLikelihood = [
      TEMPLATE.likelihood.low,
      TEMPLATE.likelihood.medium,
      TEMPLATE.likelihood.high,
    ]
    for (let i = 0; i < 3; i += 1) {
      expect(
        (await rowHeaders.nth(i).innerText()).trim(),
        `likelihood row ${i} is the template's "${expectedLikelihood[i].label}"`,
      ).toContain(expectedLikelihood[i].label)
    }

    // And there is no free-text entry anywhere on the scoring surface: the
    // only writable control the widget renders besides the cells is the
    // Justification rich-text editor. A likelihood or severity cannot be
    // typed, only clicked.
    const typable = page.locator('.dynamic-form input:visible, .dynamic-form textarea:visible')
    const typableCount = await typable.count()
    for (let i = 0; i < typableCount; i += 1) {
      const blob = (
        (await typable.nth(i).getAttribute('placeholder')) ??
        (await typable.nth(i).getAttribute('aria-label')) ??
        ''
      ).toLowerCase()
      expect(
        /likelihood|severity|risk level|rpn/.test(blob),
        `no free-text entry for a scale value — found an input described as "${blob}"`,
      ).toBe(false)
    }

    await ctxReviewer.close()
  })

  test('TC-08-02 steps 3-5 are N/A for a reason the SCHEMA states, not an absence — the fields the protocol asks for do not exist, and hazard categorisation does', async () => {
    // The protocol is emphatic that these must be recorded as N/A with the
    // right justification, and warns against the wrong one ("do not record
    // that the product has no hazard categories"). An automated check cannot
    // record a justification, but it CAN pin the facts the justification rests
    // on — so a later change that makes them untrue is caught rather than
    // leaving OQ-08's notes quietly wrong.

    // Steps 3: no scope, no process/product, no assessment-team field.
    for (const absent of ['title', 'scope', 'process', 'product', 'assessment_team', 'team_id']) {
      expect(
        sqlValue(
          `SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'risk_assessments'
              AND column_name = ${quote(absent)}`,
        ),
        `risk_assessments has no "${absent}" column — which is WHY step 3 is N/A. What was assessed is identified by the record the assessment hangs off.`,
      ).toBe('0')
    }
    // …and the linkage that carries that identification instead.
    for (const present of ['resource_type', 'resource_id', 'workflow_instance_step_id']) {
      expect(
        sqlValue(
          `SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'risk_assessments'
              AND column_name = ${quote(present)}`,
        ),
        `but it DOES carry "${present}" — the assessed record and the step's assignees are the identification`,
      ).toBe('1')
    }

    // Steps 4-5: one risk per field, no hazard list, no cause and no
    // potential-harm field. The partial unique index is the enforcement.
    for (const absent of ['cause', 'potential_harm', 'harm', 'hazard_description']) {
      expect(
        sqlValue(
          `SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'risk_assessments'
              AND column_name = ${quote(absent)}`,
        ),
        `no "${absent}" column — the system scores ONE risk per Risk Assessment field; several risks means several fields or several records`,
      ).toBe('0')
    }
    const oneRowIndex = sqlValue(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'risk_assessments' AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%workflow_instance_step_id%' AND indexdef ILIKE '%assessment_type%'`,
    )
    expect(
      oneRowIndex,
      'and the one-per-(record, step, type) rule is enforced by a partial unique index, not merely documented',
    ).toBeTruthy()

    // The justification the protocol INSISTS on for hazard categorisation:
    // present in the data model, unavailable at the interface. Both halves.
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'hazard_categories'`,
      ),
      'the hazard-category register EXISTS in the data model — do not record that the product has no hazard categories',
    ).toBe('1')
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'risk_assessments'
            AND column_name = 'hazard_category_id'`,
      ),
      'and the assessment can hold one',
    ).toBe('1')
    // The interface half is asserted where it lives — the widget's
    // HazardCategorySelectMenu is commented out, so no category can be set
    // during execution and every derived row carries NULL. Pinned through the
    // data the product actually produces.
    expect(
      sqlValue(
        `SELECT count(*) FROM risk_assessments
          WHERE company_id = ${quote(COMPANY_ID)} AND hazard_category_id IS NOT NULL`,
      ),
      'KNOWN INTERFACE GAP (TC-08-02 steps 4-5): the control that sets a hazard category is not exposed, so no assessment recorded through the application carries one',
    ).toBe('0')

    // TC-08-04's own N/A justification, by the same discipline: the data model
    // supports INITIAL vs RESIDUAL — do NOT record "the system cannot
    // represent residual risk", which the protocol calls untrue and says would
    // misreport the product to an auditor.
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'risk_assessments'
            AND column_name = 'assessment_type'`,
      ),
      'initial-vs-residual IS supported by the data model (TC-08-04) — the gap is the interface, not the model',
    ).toBe('1')
    expect(
      sqlValue(
        `SELECT count(*) FROM risk_assessments
          WHERE company_id = ${quote(COMPANY_ID)} AND assessment_type <> 'INITIAL'`,
      ),
      'KNOWN INTERFACE GAP (TC-08-04): the INITIAL/RESIDUAL toggle is not exposed, so every assessment recorded through the application is an Initial one',
    ).toBe('0')
  })
})
