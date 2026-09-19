/**
 * The summary exists to answer "what does THIS book do?" from a form whose
 * controls are individually clear and collectively unreadable. The gaps are the
 * load-bearing half — a setting switched on that silently does nothing is the
 * failure this is designed to catch.
 */
import { describe, it, expect } from 'vitest'
import { describeLogBook } from './logBookSummary.js'

const book = (over = {}) => ({
  statusId: 'ACTIVE',
  recordClassification: 'OPERATIONAL_LOG',
  editWindowMode: 'TIME_WINDOW',
  editWindowMinutes: 15,
  signatureRequired: false,
  reviewRequired: false,
  overTheShoulderReview: false,
  scheduleMode: 'AD_HOC',
  ...over,
})

const linesOf = (summary, title) => summary.sections.find((s) => s.title === title)?.lines ?? []

describe('describeLogBook', () => {
  it('returns null rather than an empty shell when there is no book yet', () => {
    expect(describeLogBook(null)).toBeNull()
  })

  it('names the classification and category in the headline', () => {
    const s = describeLogBook(book({ recordClassification: 'CONTROLLED_RECORD' }), {
      typeName: 'Calibration',
    })
    expect(s.headline).toBe('Controlled record · Calibration')
  })

  it('spells out each edit-window mode in entry terms, not setting terms', () => {
    expect(
      linesOf(describeLogBook(book({ editWindowMode: 'NONE' })), 'How entries behave')[0],
    ).toMatch(/lock the moment they are submitted/)
    expect(
      linesOf(describeLogBook(book({ editWindowMinutes: 1 })), 'How entries behave')[0],
    ).toMatch(/1 minute after/)
    expect(
      linesOf(describeLogBook(book({ editWindowMinutes: 30 })), 'How entries behave')[0],
    ).toMatch(/30 minutes after/)
  })

  it('mentions PIN sign-off only when review is actually required', () => {
    const both = describeLogBook(book({ reviewRequired: true, overTheShoulderReview: true }))
    expect(linesOf(both, 'How entries behave').join(' ')).toMatch(/PIN/)
    // OTS without review is inert — it must not be described as if it applies.
    const inert = describeLogBook(book({ reviewRequired: false, overTheShoulderReview: true }))
    expect(linesOf(inert, 'How entries behave').join(' ')).not.toMatch(/PIN/)
  })

  it('describes the equipment link by what it DOES, not that it exists', () => {
    const syncing = describeLogBook(
      book({
        equipmentId: 'eq-1',
        syncsEquipmentCalibration: true,
        scheduleMode: 'TRIGGER',
        triggerSource: 'CALIBRATION',
      }),
      { equipmentName: 'Balance AB-01' },
    )
    expect(linesOf(syncing, 'What it is attached to')[0]).toMatch(
      /Balance AB-01.*rolls that instrument’s calibration forward/,
    )

    const inert = describeLogBook(book({ equipmentId: 'eq-1' }), { equipmentName: 'Balance AB-01' })
    expect(linesOf(inert, 'What it is attached to')[0]).toMatch(/for reference only/)
  })

  it('says a recurring book is notification-only when it raises no tasks', () => {
    const s = describeLogBook(
      book({ scheduleMode: 'RECURRING', schedule: { cron: '0 8 * * *' }, generateTasks: false }),
      { cronText: 'every day at 08:00' },
    )
    expect(linesOf(s, 'When it is filled')[0]).toMatch(/every day at 08:00.*Notification only/s)
  })
})

describe('gaps — settings that are on but cannot take effect', () => {
  it('flags an ACTIVE book nobody can file against', () => {
    const s = describeLogBook(book({ statusId: 'ACTIVE' }), { assignmentCount: 0 })
    expect(s.gaps.join(' ')).toMatch(/Nobody is assigned/)
  })

  it('does not nag a DRAFT about assignments — that is premature', () => {
    const s = describeLogBook(book({ statusId: 'DRAFT' }), {
      assignmentCount: 0,
      hasWorkflow: true,
    })
    expect(s.gaps.join(' ')).not.toMatch(/Nobody is assigned/)
  })

  it('flags a draft with no approval workflow, which cannot be submitted at all', () => {
    const s = describeLogBook(book({ statusId: 'DRAFT' }), { hasWorkflow: false })
    expect(s.gaps[0]).toMatch(/cannot be submitted for approval/)
  })

  it('flags TRIGGER scheduling with no instrument to trigger on', () => {
    const s = describeLogBook(book({ scheduleMode: 'TRIGGER', triggerSource: 'CALIBRATION' }))
    expect(s.gaps.join(' ')).toMatch(/nothing will ever become due/)
  })

  it('flags sync toggles left on after the equipment was removed', () => {
    const s = describeLogBook(book({ syncsEquipmentCalibration: true, equipmentId: null }))
    expect(s.gaps.join(' ')).toMatch(/no equipment is linked, so it does nothing/)
  })

  it('flags over-the-shoulder review on a book that reviews nothing', () => {
    const s = describeLogBook(book({ overTheShoulderReview: true, reviewRequired: false }))
    expect(s.gaps.join(' ')).toMatch(/never applies/)
  })

  it('flags equipment that nothing depends on — the reported confusion', () => {
    // A linked instrument, ad-hoc filling, no syncing: the field is present and
    // inert, which is exactly what looked broken.
    const s = describeLogBook(book({ equipmentId: 'eq-1', scheduleMode: 'AD_HOC' }), {
      equipmentName: 'Balance AB-01',
      assignmentCount: 1,
    })
    expect(s.gaps.join(' ')).toMatch(/Balance AB-01 is linked but nothing depends on it/)
  })

  it('flags a controlled record whose author may approve their own entry', () => {
    // The classification promises an e-signature AND a second person. Without
    // independent review the author supplies both, which is the thing an
    // auditor asks about first.
    const s = describeLogBook(
      book({
        recordClassification: 'CONTROLLED_RECORD',
        reviewRequired: true,
        requireIndependentReview: false,
      }),
      { assignmentCount: 1, hasWorkflow: true },
    )
    expect(s.gaps.join(' ')).toMatch(/second-person review the classification promises/)
  })

  it('does not flag an operational log for the same thing', () => {
    // Self-review is the right default there — one technician on shift must be
    // able to close their own round.
    const s = describeLogBook(
      book({ recordClassification: 'OPERATIONAL_LOG', reviewRequired: true }),
      { assignmentCount: 1, hasWorkflow: true },
    )
    expect(s.gaps.join(' ')).not.toMatch(/second-person review/)
  })

  it('flags independent review switched on where nothing is reviewed', () => {
    const s = describeLogBook(book({ requireIndependentReview: true, reviewRequired: false }), {
      assignmentCount: 1,
      hasWorkflow: true,
    })
    expect(s.gaps.join(' ')).toMatch(/Independent review is switched on.*never applies/)
  })

  it('stays silent on a coherently configured book', () => {
    const s = describeLogBook(
      book({
        statusId: 'ACTIVE',
        equipmentId: 'eq-1',
        syncsEquipmentCalibration: true,
        scheduleMode: 'TRIGGER',
        triggerSource: 'CALIBRATION',
        reviewRequired: true,
        requireIndependentReview: true,
      }),
      { equipmentName: 'Balance AB-01', assignmentCount: 2, hasWorkflow: true },
    )
    expect(s.gaps).toEqual([])
  })
})
