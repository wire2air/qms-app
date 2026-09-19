/**
 * Plain-English summary of ONE log book's configuration.
 *
 * Not module help. The Help Center already explains what a log book IS; this
 * answers the different question a person actually has in front of the form —
 * "what does THIS book, as currently configured, do?"
 *
 * A log book's behaviour is spread across ~15 controls on three tabs
 * (classification, edit window, signature, review, over-the-shoulder, schedule
 * mode, cron, grace, trigger source, equipment + its two sync toggles,
 * assignments, linked documents, site scope). Each control is individually
 * labelled and collectively unreadable: nothing on the page says "entries in
 * this book lock after 15 minutes and nobody can file one yet".
 *
 * ── GAPS ARE THE POINT ────────────────────────────────────────────────────
 * The `gaps` list is the half that earns this feature. Every entry is a
 * configuration that is silently inert — a setting switched on that does
 * nothing because a second setting is missing. Those are invisible on a form
 * made of independent fields, and they are what people actually get wrong:
 * a book with no assignees accepts no entries, a TRIGGER book with no equipment
 * never fires, a draft with no workflow cannot be submitted at all.
 *
 * Pure and data-only: takes resolved values, returns strings. No IDB, no Vue —
 * so the wording is unit-testable and cannot drift from a component's render.
 */

const CLASSIFICATION_TEXT = {
  CONTROLLED_RECORD: 'Controlled record',
  OPERATIONAL_LOG: 'Operational log',
}

/** How an entry stops being editable. */
function editWindowSentence(book) {
  switch (book.editWindowMode) {
    case 'NONE':
      return 'Entries lock the moment they are submitted.'
    case 'UNTIL_NEXT_ENTRY':
      return 'An entry stays editable until the next entry is logged.'
    case 'UNTIL_REVIEW':
      return 'An entry stays editable until a reviewer signs it off.'
    case 'TIME_WINDOW':
    default: {
      const mins = book.editWindowMinutes ?? 15
      return `An entry stays editable for ${mins} minute${mins === 1 ? '' : 's'} after submission, then locks.`
    }
  }
}

/** Who has to sign or review, in the order a person meets them. */
function attestationSentences(book) {
  const out = []
  out.push(
    book.signatureRequired
      ? 'Submitting an entry requires the author’s e-signature.'
      : 'No e-signature is required to submit an entry.',
  )
  if (book.reviewRequired) {
    out.push(
      book.overTheShoulderReview
        ? 'A second person must approve each entry before it locks, and may do so at the operator’s own workstation with their PIN.'
        : 'A second person must approve each entry before it locks.',
    )
    out.push(
      book.requireIndependentReview
        ? 'The reviewer cannot be the person who filed the entry.'
        : 'The person who filed an entry may also approve it.',
    )
  } else {
    out.push('Entries are not reviewed — they lock on their own.')
  }
  return out
}

/** When the book is meant to be filled. */
function scheduleSentence(book, { cronText } = {}) {
  if (book.scheduleMode === 'RECURRING') {
    const when = cronText || 'on a repeating schedule'
    const grace = book.graceMinutes ?? 60
    const tasks = book.generateTasks === false ? ' Notification only — no tasks are raised.' : ''
    return `Due ${when}, with ${grace} minutes’ grace before an occurrence counts as missed.${tasks}`
  }
  if (book.scheduleMode === 'TRIGGER') {
    return book.triggerSource === 'PM'
      ? 'Due whenever the linked instrument’s preventive maintenance falls due.'
      : 'Due whenever the linked instrument’s calibration falls due.'
  }
  return 'Filled on demand — there is no schedule.'
}

/** What the book is attached to in the rest of the system. */
function linkSentences(book, { equipmentName, departmentName, siteCount, documentCount }) {
  const out = []
  if (equipmentName) {
    const syncs = []
    if (book.syncsEquipmentCalibration) syncs.push('calibration')
    if (book.syncsEquipmentPm) syncs.push('preventive maintenance')
    out.push(
      syncs.length
        ? `Linked to ${equipmentName}, and each completed entry rolls that instrument’s ${syncs.join(' and ')} forward.`
        : `Linked to ${equipmentName}, for reference only — entries do not update the instrument’s dates.`,
    )
  }
  if (departmentName) out.push(`Owned by ${departmentName}.`)
  if (book.location) out.push(`Carried out at ${book.location}.`)
  if (siteCount > 0) {
    out.push(`Available at ${siteCount} site${siteCount === 1 ? '' : 's'}.`)
  }
  if (documentCount > 0) {
    out.push(
      `Follows ${documentCount} controlled document${documentCount === 1 ? '' : 's'} — only people trained on ${documentCount === 1 ? 'it' : 'them'} may file an entry.`,
    )
  }
  return out
}

/**
 * Settings that are switched on but cannot take effect, and prerequisites the
 * book is missing. Ordered hardest-blocker first.
 */
function findGaps(book, { equipmentName, assignmentCount, hasWorkflow }) {
  const gaps = []
  const status = book.statusId ?? 'DRAFT'

  if (!hasWorkflow && ['DRAFT', 'REJECTED'].includes(status)) {
    gaps.push('No approval workflow is attached, so this book cannot be submitted for approval.')
  }
  if (status === 'ACTIVE' && assignmentCount === 0) {
    gaps.push('Nobody is assigned to this book, so no entries can be filed against it.')
  }
  if (book.scheduleMode === 'TRIGGER' && !book.equipmentId) {
    gaps.push(
      'Scheduling is set to follow an instrument’s due dates, but no equipment is linked — nothing will ever become due.',
    )
  }
  if (book.scheduleMode === 'RECURRING' && !book.schedule?.cron) {
    gaps.push('Scheduling is set to recurring, but no repeat pattern has been chosen.')
  }
  if ((book.syncsEquipmentCalibration || book.syncsEquipmentPm) && !book.equipmentId) {
    gaps.push(
      'Instrument date syncing is switched on, but no equipment is linked, so it does nothing.',
    )
  }
  if (book.requireIndependentReview && !book.reviewRequired) {
    gaps.push(
      'Independent review is switched on, but entries are not reviewed at all, so it never applies.',
    )
  }
  if (
    book.recordClassification === 'CONTROLLED_RECORD' &&
    book.reviewRequired &&
    !book.requireIndependentReview
  ) {
    gaps.push(
      'This is a controlled record, but the person who files an entry may also approve it — the second-person review the classification promises is not enforced.',
    )
  }
  if (book.overTheShoulderReview && !book.reviewRequired) {
    gaps.push(
      'Over-the-shoulder review is switched on, but entries are not reviewed at all, so it never applies.',
    )
  }
  if (
    equipmentName &&
    book.scheduleMode === 'AD_HOC' &&
    !book.syncsEquipmentCalibration &&
    !book.syncsEquipmentPm
  ) {
    gaps.push(
      `${equipmentName} is linked but nothing depends on it — no syncing, and the book is filled on demand rather than on the instrument’s due dates.`,
    )
  }
  return gaps
}

/**
 * @param {object} book                       the log book row (or the edit draft)
 * @param {object} [context]                  resolved display values
 * @param {string} [context.equipmentName]
 * @param {string} [context.departmentName]
 * @param {string} [context.typeName]         log book category
 * @param {string} [context.cronText]         humanized recurrence
 * @param {number} [context.siteCount]
 * @param {number} [context.documentCount]
 * @param {number} [context.assignmentCount]
 * @param {boolean}[context.hasWorkflow]
 * @returns {{headline: string, sections: {title: string, lines: string[]}[], gaps: string[]}|null}
 */
export function describeLogBook(book, context = {}) {
  if (!book) return null
  const {
    equipmentName = '',
    departmentName = '',
    typeName = '',
    cronText = '',
    siteCount = 0,
    documentCount = 0,
    assignmentCount = 0,
    hasWorkflow = false,
  } = context

  const kind = CLASSIFICATION_TEXT[book.recordClassification] ?? 'Log book'
  const headline = typeName ? `${kind} · ${typeName}` : kind

  const sections = [
    {
      title: 'How entries behave',
      lines: [editWindowSentence(book), ...attestationSentences(book)],
    },
    { title: 'When it is filled', lines: [scheduleSentence(book, { cronText })] },
  ]

  const links = linkSentences(book, { equipmentName, departmentName, siteCount, documentCount })
  if (links.length) sections.push({ title: 'What it is attached to', lines: links })

  const who =
    assignmentCount > 0
      ? [
          `${assignmentCount} assignment${assignmentCount === 1 ? '' : 's'} decide${assignmentCount === 1 ? 's' : ''} who fills it.`,
        ]
      : ['No one is assigned yet.']
  sections.push({ title: 'Who fills it', lines: who })

  return {
    headline,
    sections,
    gaps: findGaps(book, { equipmentName, assignmentCount, hasWorkflow }),
  }
}
