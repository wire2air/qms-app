/**
 * Pins the RECORD-vs-APPROVAL split that now drives three separate surfaces:
 *   - which step types the builder offers (allowedStepTypes)
 *   - which rows land in the merged Templates list
 *   - which rows land in Approval Flows
 *
 * The RECORD side is the closed list and everything else is an approval flow,
 * so the case worth pinning is the DEFAULT: an unclassified module must land in
 * Approval Flows. The first cut had this backwards and INSPECTIONS_LOGS — a
 * module in the shared reference table that nobody remembered to classify —
 * showed up under Templates offering Task steps that capture nothing (reported
 * twice, 2026-08-15).
 *
 * The id list below is every row in the `modules` table (see the migrations
 * that INSERT INTO public.modules). When a module ships, it goes here.
 */
import { describe, it, expect } from 'vitest'
import {
  allowedStepTypes,
  isApprovalOnlyModule,
  isSystemAuthoredModule,
} from '../components/workflow/workflowModule.js'

const SEEDED_RECORD_MODULE_IDS = [
  'NON_CONFORMANCE',
  'CAPA',
  'CHANGE_CONTROL',
  'COMPLAINT',
  'CUSTOMER_COMPLAINT',
  'FORM', // every admin-defined / promoted module runs under this one id
]
const SEEDED_APPROVAL_MODULE_IDS = [
  'APPROVAL', // Document Control
  'LOG_BOOK',
  'INSPECTIONS_LOGS',
  'AUDIT_STANDARD',
  'AUDIT_INSTANCE',
  'QC_INSPECTION',
]

describe('workflow module kind', () => {
  it('classifies every seeded approval flow as approval-only', () => {
    for (const id of SEEDED_APPROVAL_MODULE_IDS) {
      expect(isApprovalOnlyModule(id), id).toBe(true)
      expect(allowedStepTypes(id), id).toEqual(['APPROVAL'])
    }
  })

  it('classifies every seeded record module as a full workflow', () => {
    for (const id of SEEDED_RECORD_MODULE_IDS) {
      expect(isApprovalOnlyModule(id), id).toBe(false)
      expect(allowedStepTypes(id), id).toEqual(['ACTION', 'APPROVAL', 'DELAY'])
    }
  })

  it('defaults an unclassified module to approval-only', () => {
    // A module added to the shared `modules` table without being classified
    // must NOT inherit Task steps — that was the INSPECTIONS_LOGS bug.
    for (const id of ['SOME_NEW_MODULE', undefined, null, '']) {
      expect(isApprovalOnlyModule(id)).toBe(true)
      expect(allowedStepTypes(id)).toEqual(['APPROVAL'])
    }
  })

  it('puts every seeded module on exactly one side of the split', () => {
    const all = [...SEEDED_RECORD_MODULE_IDS, ...SEEDED_APPROVAL_MODULE_IDS]
    const approval = all.filter(isApprovalOnlyModule)
    const record = all.filter((id) => !isApprovalOnlyModule(id))
    expect(approval.length + record.length).toBe(all.length)
    expect(approval.sort()).toEqual([...SEEDED_APPROVAL_MODULE_IDS].sort())
  })
})

describe('which modules you can author a workflow for', () => {
  // The create wizard offered every row of the shared `modules` table,
  // including two whose workflows the system mints. Picking either produced a
  // workflow nothing would ever reach: Document Control's flow comes from a
  // Document Template, and every promoted module runs under the single 'FORM'
  // id with its workflow created by moduleRecordService.
  it('excludes the system-minted modules', () => {
    expect(isSystemAuthoredModule('APPROVAL')).toBe(true)
    expect(isSystemAuthoredModule('FORM')).toBe(true)
  })

  it('leaves every hand-authored module offerable', () => {
    for (const id of [
      'NON_CONFORMANCE',
      'CAPA',
      'CHANGE_CONTROL',
      'COMPLAINT',
      'CUSTOMER_COMPLAINT',
      'LOG_BOOK',
      'INSPECTIONS_LOGS',
      'AUDIT_STANDARD',
      'AUDIT_INSTANCE',
      'QC_INSPECTION',
    ]) {
      expect(isSystemAuthoredModule(id), id).toBe(false)
    }
  })

  it('is narrower than the approval/record split, not a duplicate of it', () => {
    // FORM is a RECORD module — its workflows carry task forms and belong in
    // the Templates list. It just isn't creatable from scratch.
    expect(isApprovalOnlyModule('FORM')).toBe(false)
    expect(allowedStepTypes('FORM')).toEqual(['ACTION', 'APPROVAL', 'DELAY'])
    expect(isSystemAuthoredModule('FORM')).toBe(true)
  })
})
