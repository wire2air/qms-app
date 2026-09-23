import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import CustomMetricBuilderDialog from './CustomMetricBuilderDialog.vue'
import { METRIC_TEMPLATES } from '@/utils/analyticsMetricTemplates.js'

/**
 * ── WHAT THIS FILE IS FOR ───────────────────────────────────────────────────
 * One behaviour above all: applying a template must SURVIVE. The dialog has two
 * watchers that wipe dependent fields when the module or the source table
 * changes, which is right when a person changes them and wrong when the form is
 * written to programmatically. The edit path already carries a `seeding` flag
 * for exactly this, and the bug it was added for — filters and groupBy silently
 * emptied, the form still looking plausible — was invisible enough to survive a
 * build, four lints and a full unit run.
 *
 * A template is the second non-user write to those fields, so it is the second
 * chance to reintroduce that bug. These tests would fail if someone removed the
 * flag from applyTemplate().
 *
 * The other invariant pinned here is that no figure is ever rendered. The panel
 * describes a metric that does not exist yet; a number in it would be invented.
 */

/** Registry rows as the parent's live query supplies them. */
const FIELDS = [
  { moduleId: 'capa', sourceTable: 'capas', columnName: 'status_id', label: 'Status', kind: 'enum', filterable: true, groupable: true, displayOrder: 0 },
  { moduleId: 'capa', sourceTable: 'capas', columnName: 'priority_id', label: 'Priority', kind: 'enum', filterable: true, groupable: true, displayOrder: 1 },
  { moduleId: 'capa', sourceTable: 'capas', columnName: 'department_id', label: 'Department', kind: 'uuid', filterable: true, groupable: true, displayOrder: 2 },
  { moduleId: 'capa', sourceTable: 'capas', columnName: 'created_at', label: 'Raised', kind: 'date', filterable: true, groupable: false, displayOrder: 3 },
  { moduleId: 'capa', sourceTable: 'capas', columnName: 'closed_at', label: 'Closed', kind: 'date', filterable: true, groupable: false, displayOrder: 4 },
  { moduleId: 'ncr', sourceTable: 'nonconformances', columnName: 'status_id', label: 'Status', kind: 'enum', filterable: true, groupable: true, displayOrder: 0 },
  { moduleId: 'ncr', sourceTable: 'nonconformances', columnName: 'created_at', label: 'Raised', kind: 'date', filterable: true, groupable: false, displayOrder: 1 },
  // A custom module: its answers live in the shared EAV projection, so the
  // vocabulary is the same six-plus-one columns for every one of them.
  { moduleId: 'lead_crm', sourceTable: 'analytics_field_values', columnName: 'reporting_key', label: 'Field', kind: 'text', filterable: true, groupable: true, displayOrder: 30 },
  { moduleId: 'lead_crm', sourceTable: 'analytics_field_values', columnName: 'text_value', label: 'Answer', kind: 'text', filterable: true, groupable: true, displayOrder: 35 },
  { moduleId: 'lead_crm', sourceTable: 'analytics_field_values', columnName: 'occurred_at', label: 'Occurred', kind: 'date', filterable: true, groupable: false, displayOrder: 20 },
]

/** The form behind that module — where a dropdown's legal answers live. */
const LEAD_CRM_TEMPLATE = {
  isModule: true,
  internalName: 'lead_crm',
  schema: [
    {
      name: 'select_1',
      type: 'select',
      label: 'Lead Source',
      options: ['EMAIL', 'SMS', 'WEB', 'MANUAL'],
      reporting: { enabled: true, key: 'lead_source' },
    },
    {
      name: 'select_2',
      type: 'select',
      label: 'Lead Status',
      options: ['OPEN', 'PROGRESS', 'CLOSED'],
      reporting: { enabled: true, key: 'lead_status' },
    },
  ],
}

// The dialog renders its body inside BaseDialog and its actions inside
// BaseDialogFooter, both of which teleport. Render slots inline so assertions
// are about THIS component's markup.
const DialogStub = {
  name: 'BaseDialog',
  props: ['title', 'subtitle', 'size', 'persistent', 'showClose'],
  template: '<div><slot /><slot name="footer" :close="() => {}" /></div>',
}
const FooterStub = {
  name: 'BaseDialogFooter',
  props: ['loading', 'disabled', 'submitLabel', 'submitTitle', 'error'],
  template: '<div class="footer" :data-error="error" :data-disabled="disabled" />',
}

vi.mock('@/composables/useLiveQuery.js', () => ({
  useLiveMutation: (fn) => fn,
  // The dialog loads filter-value pickers from the mirrored lookup tables. These
  // tests assert the FORM, not the vocabulary, so the query resolves to nothing
  // and every filter row falls back to the typed input — which is exactly the
  // path this suite was written against. The value pickers have their own tests
  // in analyticsLookupOptions.spec.js.
  useLiveQueryWithDeps: (_deps, _fn, { initial } = {}) => ref(initial),
}))

function mountDialog(props = {}) {
  return mount(CustomMetricBuilderDialog, {
    props: { open: true, fields: FIELDS, dimensionCap: 3, ...props },
    global: {
      stubs: {
        BaseDialog: DialogStub,
        BaseDialogFooter: FooterStub,
        BaseBanner: { props: ['title', 'message', 'tone'], template: '<div class="banner">{{ message }}</div>' },
      },
      mocks: { useToast: () => ({ success: vi.fn(), error: vi.fn() }) },
    },
  })
}

/** The CAPA template that carries both a filter and no breakdown. */
const OPEN_CAPAS = METRIC_TEMPLATES.find((t) => t.id === 'capa-open')
/** One that carries a breakdown, so groupBy survival is covered too. */
const BY_DEPARTMENT = METRIC_TEMPLATES.find((t) => t.id === 'capa-by-department')

describe('CustomMetricBuilderDialog — templates', () => {
  it('opens on the chooser, not the form', () => {
    // Template-first: the cards ARE the dialog, so the common case finishes in
    // two clicks and the blank form is the escape hatch rather than the default.
    const w = mountDialog()
    expect(w.vm.choosing).toBe(true)
    expect(w.text()).toContain(OPEN_CAPAS.name)
    expect(w.text()).toContain('Create your own')
    // None of the form's questions are on screen yet.
    expect(w.text()).not.toContain('What are you measuring?')
  })

  it('shows the form once "Create your own" is taken', async () => {
    const w = mountDialog()
    w.vm.startFromScratch()
    await nextTick()
    expect(w.vm.choosing).toBe(false)
    expect(w.text()).toContain('What are you measuring?')
  })

  it('offers none when editing an existing metric', async () => {
    // Applying one here would silently replace a definition that dashboards,
    // reports and alerts may already be built on.
    const w = mountDialog({
      metric: {
        id: 'm1',
        name: 'Existing',
        moduleId: 'capa',
        direction: 'neutral',
        grain: 'month',
        definition: {
          sourceTable: 'capas',
          timeField: 'created_at',
          measure: { type: 'count' },
          filters: [],
          groupBy: [],
        },
      },
    })
    await nextTick()
    expect(w.vm.choosing).toBe(false)
    expect(w.text()).not.toContain('Create your own')
  })

  it('keeps the filters it applied — the reset watchers must not fire', async () => {
    // ⚠ THE REGRESSION TEST. Without `seeding` in applyTemplate(), assigning
    // moduleId resets the whole definition and assigning sourceTable clears
    // timeField/filters/groupBy, so this assertion fails with an empty array.
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()

    const def = w.vm.form.definition
    expect(def.sourceTable).toBe('capas')
    expect(def.timeField).toBe('created_at')
    expect(def.filters).toHaveLength(1)
    expect(def.filters[0].field).toBe('status_id')
    expect(def.filters[0].values).toEqual(['OPEN'])
  })

  it('keeps the breakdown it applied', async () => {
    const w = mountDialog()
    w.vm.applyTemplate(BY_DEPARTMENT)
    await nextTick()
    await nextTick()
    expect(w.vm.form.definition.groupBy).toEqual(['department_id'])
  })

  it('copies the template’s name, direction and grain onto the form', async () => {
    const w = mountDialog()
    w.vm.applyTemplate(BY_DEPARTMENT)
    await nextTick()
    expect(w.vm.form.name).toBe(BY_DEPARTMENT.name)
    expect(w.vm.form.moduleId).toBe('capa')
    expect(w.vm.form.grain).toBe(BY_DEPARTMENT.grain)
    expect(w.vm.form.direction).toBe(BY_DEPARTMENT.direction)
  })

  it('leaves an applied template immediately saveable', async () => {
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()
    expect(w.vm.problem).toBeNull()
    expect(w.vm.canSave).toBe(true)
  })

  it('still resets when a PERSON changes the module', async () => {
    // The flag must not disable the watchers permanently — a real module change
    // has to keep clearing fields that belong to the old module, or the
    // definition compiles against a column the user can no longer see.
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()
    expect(w.vm.form.definition.filters).toHaveLength(1)

    w.vm.form.moduleId = 'ncr'
    await nextTick()
    // The CAPA filter is gone, which is the point: status_id belongs to capas,
    // and carrying it to nonconformances would compile against a column the
    // user can no longer see in any picker.
    expect(w.vm.form.definition.filters).toEqual([])
    expect(w.vm.form.definition.groupBy).toEqual([])
    // sourceTable is NOT asserted null: BaseSelect autoFills a required single
    // select with its first option, so the reset immediately re-picks the one
    // NCR source table. That is the documented autoFill behaviour rather than a
    // failure to reset — and it is exactly what made the original wipe bug so
    // hard to see, since the form looked populated afterwards.
    expect(w.vm.form.definition.sourceTable).not.toBe('capas')
  })
})

describe('CustomMetricBuilderDialog — the definition panel', () => {
  it('says nothing until the definition can be described', () => {
    const w = mountDialog()
    expect(w.text()).not.toContain("What you'll see")
  })

  it('describes the metric once it is complete', async () => {
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()
    expect(w.text()).toContain("What you'll see")
    expect(w.text()).toContain('Counts records where Status is Open, counted by Raised')
  })

  it('updates when the configuration changes', async () => {
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()
    expect(w.text()).toContain('counted by Raised')

    w.vm.form.definition.timeField = 'closed_at'
    await nextTick()
    expect(w.text()).toContain('counted by Closed')
    expect(w.text()).not.toContain('counted by Raised')
  })

  it('renders no figure anywhere', async () => {
    // The metric does not exist until it is saved and the rollup has run, so
    // any number here would be fabricated — unacceptable in a product where
    // every tile prints the timestamp its figure was computed at.
    const w = mountDialog()
    w.vm.applyTemplate(BY_DEPARTMENT)
    await nextTick()
    await nextTick()

    const panel = w.text().split("What you'll see")[1] ?? ''
    // No figure, no delta, no percentage — the three shapes a fabricated result
    // would take. Asserted as shapes rather than "contains no digit", because a
    // filter value legitimately may contain one (a grade, a class, a revision)
    // and banning digits outright would fail for a reason that is not the rule.
    expect(panel).not.toMatch(/\b\d+(\.\d+)?%/) // a percentage
    expect(panel).not.toMatch(/[↑↓]\s*\d/) // a trend delta
    expect(panel).not.toMatch(/\b\d{2,}\b/) // a record count
    expect(panel).toContain('Figures appear once the metric is saved')
  })
})

describe('CustomMetricBuilderDialog — guidance and limits', () => {
  it('asks the business questions, as named sections', async () => {
    // Every question is a section header, so all of them are on screen even
    // while only one panel is expanded — the form's shape is visible from the
    // start rather than appearing a piece at a time.
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()
    const text = w.text()
    expect(text).toContain('What are you measuring?')
    expect(text).toContain('Which records, and what about them?')
    expect(text).toContain('Which records should be included?')
    expect(text).toContain('When should a record count?')
    expect(text).toContain('Breakdown and reporting')
  })

  it('opens on the first section and leaves the rest collapsed', async () => {
    // The point of the accordion: six stacked blocks were ~1,200px of scroll,
    // which is how the footer's save error ended up naming a field that was
    // off screen.
    const w = mountDialog()
    w.vm.startFromScratch()
    await nextTick()
    expect(w.vm.openSections).toEqual(['what'])
  })

  it('places a blocked save on the section that owns it', async () => {
    // What makes the error reachable: the footer message can now open the
    // section it refers to, which it could not do as a bare string.
    const w = mountDialog()
    w.vm.startFromScratch()
    await nextTick()
    expect(w.vm.problem).toBe('Give the metric a name.')
    expect(w.vm.blockedSection).toBe('what')
  })

  it('summarises a finished section by its VALUE, not a tick', async () => {
    // A collapsed section still has to be auditable. Which date a record counts
    // by is the choice most often got wrong, so "When ✓" would hide exactly the
    // thing worth checking.
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()
    expect(w.vm.summaries.when).toBe('Counted by Raised')
    expect(w.vm.summaries.what).toContain(OPEN_CAPAS.name)
  })

  it('sets the source table itself when a module offers only one', async () => {
    // Asking would be a required field with a single option — a gate that
    // confirms something the author never chose. Every module in the registry
    // currently has exactly one source table.
    const w = mountDialog()
    w.vm.startFromScratch()
    w.vm.form.moduleId = 'capa'
    await nextTick()
    await nextTick()
    expect(w.vm.form.definition.sourceTable).toBe('capas')
  })

  it('says filters combine with AND, and never offers OR', async () => {
    // The compiler joins predicates with AND and cannot express anything else.
    // A user who assumes OR builds a filter that silently matches nothing.
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()
    expect(w.text()).toContain('must match')
    expect(w.text()).not.toMatch(/\bOR\b/)
  })

  it('surfaces a compile error above everything else', async () => {
    const w = mountDialog({
      metric: {
        id: 'm1',
        name: 'Broken',
        moduleId: 'capa',
        direction: 'neutral',
        grain: 'month',
        compileError: 'status_nope cannot be filtered on.',
        definition: {
          sourceTable: 'capas',
          timeField: 'created_at',
          measure: { type: 'count' },
          filters: [],
          groupBy: [],
        },
      },
    })
    await nextTick()
    expect(w.text()).toContain('status_nope cannot be filtered on.')
  })

  it('blocks saving with a human reason', () => {
    const w = mountDialog()
    // Nothing filled in: the message names the next thing to do rather than
    // reporting an invalid configuration.
    expect(w.vm.problem).toBe('Give the metric a name.')
    expect(w.vm.canSave).toBe(false)
  })
})

/** A custom module's registry rows — every one of them on the EAV source. */
const LEAD_FIELDS = [
  { moduleId: 'lead_crm', sourceTable: 'analytics_field_values', columnName: 'numeric_value', label: 'Value', kind: 'number', filterable: true, groupable: false, displayOrder: 10 },
  { moduleId: 'lead_crm', sourceTable: 'analytics_field_values', columnName: 'occurred_at', label: 'Occurred', kind: 'date', filterable: true, groupable: false, displayOrder: 20 },
  { moduleId: 'lead_crm', sourceTable: 'analytics_field_values', columnName: 'reporting_key', label: 'Field', kind: 'text', filterable: true, groupable: true, displayOrder: 30 },
  { moduleId: 'lead_crm', sourceTable: 'analytics_field_values', columnName: 'site_id', label: 'Site', kind: 'uuid', filterable: true, groupable: true, displayOrder: 40 },
]

const LEAD_TEMPLATES = [
  {
    isModule: true,
    internalName: 'lead_crm',
    schema: [
      { name: 'number_1', type: 'number', label: 'Deal Value', reporting: { enabled: true, key: 'deal_value' } },
      {
        name: 'select_2',
        type: 'select',
        label: 'Lead Status',
        options: ['OPEN', 'PROGRESS', 'CLOSED'],
        reporting: { enabled: true, key: 'lead_status' },
      },
      {
        name: 'select_1',
        type: 'select',
        label: 'Lead Source',
        options: ['WEB', 'EMAIL'],
        reporting: { enabled: true, key: 'lead_source' },
      },
    ],
  },
]

/**
 * The reporting-key picker.
 *
 * A metric on analytics_field_values is WRONG without a reporting_key filter —
 * the table holds one row per (record, reportable field), so an unfiltered one
 * mixes every field together. The key is therefore not optional detail, and a
 * mistyped one compiles cleanly and renders an empty series, which is the
 * failure nobody investigates.
 */
describe('CustomMetricBuilderDialog — reporting-key picker', () => {
  function openOnLeadCrm() {
    const w = mountDialog({ fields: LEAD_FIELDS, templates: LEAD_TEMPLATES })
    w.vm.startFromScratch()
    w.vm.form.moduleId = 'lead_crm'
    w.vm.form.definition.sourceTable = 'analytics_field_values'
    return w
  }

  it('offers the module\'s declared keys', async () => {
    const w = openOnLeadCrm()
    await nextTick()
    expect(w.vm.keyOptions.map((o) => o.value)).toEqual([
      'deal_value',
      'lead_source',
      'lead_status',
    ])
  })

  it('picks for reporting_key and types for everything else', async () => {
    const w = openOnLeadCrm()
    await nextTick()
    expect(w.vm.picksFromKeys({ field: 'reporting_key' })).toBe(true)
    // Site's values live in a lookup table the client does not mirror, so an
    // empty dropdown would be worse than the typed input.
    expect(w.vm.picksFromKeys({ field: 'site_id' })).toBe(false)
  })

  // A built-in module has no FormTemplate claiming it — the typed input must
  // stay rather than a dropdown with nothing in it.
  it('falls back to typing on a built-in module', async () => {
    const w = mountDialog({ templates: LEAD_TEMPLATES })
    w.vm.startFromScratch()
    w.vm.form.moduleId = 'capa'
    await nextTick()
    expect(w.vm.keyOptions).toEqual([])
    expect(w.vm.picksFromKeys({ field: 'reporting_key' })).toBe(false)
  })

  it('clears values when the filter field changes', async () => {
    const w = openOnLeadCrm()
    await nextTick()
    // Values picked for one field are meaningless on another, and a dropdown
    // cannot display them, so the row would look blank while still saving them.
    const f = { field: 'site_id', op: 'in', values: ['deal_value'] }
    w.vm.onFilterFieldChange(f)
    expect(f.values).toEqual([])
  })
})

/**
 * "Which answer?" — the control that keeps a sum from mixing every numeric
 * answer on the module together. It is stored as an ordinary reporting_key
 * filter, so the two views of the same fact must stay in step.
 */
describe('CustomMetricBuilderDialog — which answer to measure', () => {
  function openSum() {
    const w = mountDialog({ fields: LEAD_FIELDS, templates: LEAD_TEMPLATES })
    w.vm.startFromScratch()
    w.vm.form.moduleId = 'lead_crm'
    w.vm.form.definition.sourceTable = 'analytics_field_values'
    return w
  }

  /**
   * Set the measure AFTER the sourceTable watcher has flushed.
   *
   * Changing the source resets `measure` (it clears dependent fields, which is
   * right when a person switches sources). Assigning both in the same tick
   * means the reset lands last and silently undoes the measure — which is the
   * same class of bug the `seeding` flag exists for.
   */
  async function setMeasure(w, measure) {
    await nextTick()
    w.vm.form.definition.measure = measure
    await nextTick()
  }

  it('asks only when summing or averaging the EAV source', async () => {
    const w = openSum()
    await setMeasure(w, { type: 'sum', field: 'numeric_value' })
    expect(w.vm.measuresEav).toBe(true)

    await setMeasure(w, { type: 'count' })
    // A count is already per-record, so it has nothing to pin.
    expect(w.vm.measuresEav).toBe(false)
  })

  it('writes the choice as a reporting_key filter', async () => {
    const w = openSum()
    await setMeasure(w, { type: 'sum', field: 'numeric_value' })
    w.vm.measuredKey = 'deal_value'
    expect(w.vm.form.definition.filters).toEqual([
      { field: 'reporting_key', op: 'in', values: ['deal_value'] },
    ])
  })

  it('replaces rather than stacks when the choice changes', async () => {
    const w = openSum()
    await setMeasure(w, { type: 'sum', field: 'numeric_value' })
    w.vm.measuredKey = 'deal_value'
    w.vm.measuredKey = 'lead_status'
    expect(w.vm.form.definition.filters).toEqual([
      { field: 'reporting_key', op: 'in', values: ['lead_status'] },
    ])
  })

  it('reads back a choice made in the filter list', async () => {
    const w = openSum()
    await setMeasure(w, { type: 'sum', field: 'numeric_value' })
    w.vm.form.definition.filters = [
      { field: 'reporting_key', op: 'in', values: ['deal_value'] },
    ]
    expect(w.vm.measuredKey).toBe('deal_value')
  })

  // An empty filter row fails compilation with a different and more confusing
  // message, so clearing removes the row outright.
  it('removes the filter when cleared rather than leaving it empty', async () => {
    const w = openSum()
    await setMeasure(w, { type: 'sum', field: 'numeric_value' })
    w.vm.measuredKey = 'deal_value'
    w.vm.measuredKey = null
    expect(w.vm.form.definition.filters).toEqual([])
  })

  it('leaves other filters untouched', async () => {
    const w = openSum()
    await setMeasure(w, { type: 'sum', field: 'numeric_value' })
    w.vm.form.definition.filters = [{ field: 'site_id', op: 'in', values: ['s1'] }]
    w.vm.measuredKey = 'deal_value'
    expect(w.vm.form.definition.filters).toEqual([
      { field: 'site_id', op: 'in', values: ['s1'] },
      { field: 'reporting_key', op: 'in', values: ['deal_value'] },
    ])
  })
})

describe('CustomMetricBuilderDialog — a custom module’s answers', () => {
  /** The dialog with the EAV module chosen and one filter row ready. */
  async function mountEav(filters) {
    const w = mountDialog({ templates: [LEAD_CRM_TEMPLATE] })
    w.vm.startFromScratch()
    w.vm.form.moduleId = 'lead_crm'
    // Setting the module blanks the definition (the reset watcher), and the
    // single-source-table watcher then fills sourceTable in. Both are flush
    // 'pre', so the filters have to be written after they have run — writing
    // them in the same tick is how they end up silently discarded.
    await nextTick()
    await nextTick()
    w.vm.form.definition.filters = filters
    await nextTick()
    return w
  }

  it('offers the answers of the field the metric is pinned to', async () => {
    // The shape that compiles: one row names the field, the next its answer.
    // Both predicates land on the same row, which is why the pair counts.
    const w = await mountEav([
      { field: 'reporting_key', op: 'in', values: ['lead_source'] },
      { field: 'text_value', op: 'in', values: [] },
    ])
    await nextTick()
    const opts = w.vm.eavAnswerOptions(w.vm.form.definition.filters[1])
    expect(opts.map((o) => o.value)).toEqual(['EMAIL', 'SMS', 'WEB', 'MANUAL'])
  })

  it('follows the pin when it names a different field', async () => {
    const w = await mountEav([
      { field: 'reporting_key', op: 'in', values: ['lead_status'] },
      { field: 'text_value', op: 'in', values: [] },
    ])
    await nextTick()
    const opts = w.vm.eavAnswerOptions(w.vm.form.definition.filters[1])
    expect(opts.map((o) => o.value)).toEqual(['OPEN', 'PROGRESS', 'CLOSED'])
  })

  it('offers nothing while no field is pinned', async () => {
    // ⚠ The load-bearing case. Without a pin the answer set is ambiguous, and a
    // dropdown built from every field's options would offer answers belonging
    // to a field this metric is not measuring.
    const w = await mountEav([{ field: 'text_value', op: 'in', values: [] }])
    await nextTick()
    expect(w.vm.eavAnswerOptions(w.vm.form.definition.filters[0])).toEqual([])
  })

  it('offers nothing when the pin names several fields', async () => {
    const w = await mountEav([
      { field: 'reporting_key', op: 'in', values: ['lead_source', 'lead_status'] },
      { field: 'text_value', op: 'in', values: [] },
    ])
    await nextTick()
    expect(w.vm.eavAnswerOptions(w.vm.form.definition.filters[1])).toEqual([])
  })

  it('explains the missing pin instead of showing a bare text box', async () => {
    // An author who adds "Answer is …" first has no way to know it depends on a
    // row they have not written yet.
    const w = await mountEav([{ field: 'text_value', op: 'in', values: [] }])
    await nextTick()
    expect(w.vm.answerHint(w.vm.form.definition.filters[0])).toContain('Field is')
  })

  it('warns when two different fields are filtered at once', async () => {
    // Each answer is its own row, so this asks one row to be two fields. It
    // compiles, it publishes, and it counts nothing.
    const w = await mountEav([
      { field: 'reporting_key', op: 'in', values: ['lead_source'] },
      { field: 'reporting_key', op: 'in', values: ['lead_status'] },
    ])
    await nextTick()
    expect(w.vm.eavConflict).toContain('will count nothing')
  })
})

/**
 * The custom-field row, end to end through the dialog.
 *
 * The helpers are unit-tested next door; what matters here is that the dialog
 * shows ONE row for a custom field, and that everything downstream — the save
 * payload, the validators, the conflict warning — sees the EXPANDED pair.
 */
describe('CustomMetricBuilderDialog — custom fields as one row', () => {
  function openLeadCrm() {
    const w = mountDialog({ fields: LEAD_FIELDS, templates: LEAD_TEMPLATES })
    w.vm.startFromScratch()
    w.vm.form.moduleId = 'lead_crm'
    w.vm.form.definition.sourceTable = 'analytics_field_values'
    return w
  }

  it('offers the form\'s fields instead of Field and Answer', async () => {
    const w = openLeadCrm()
    await nextTick()
    const labels = w.vm.filterFields.map((o) => o.label)
    expect(labels).toContain('Deal Value')
    expect(labels).toContain('Lead Status')
    expect(labels).not.toContain('Field')
    expect(labels).not.toContain('Answer')
  })

  it('leaves a built-in module on the registry list', async () => {
    const w = mountDialog({ templates: LEAD_TEMPLATES })
    w.vm.startFromScratch()
    w.vm.form.moduleId = 'capa'
    w.vm.form.definition.sourceTable = 'capas'
    await nextTick()
    expect(w.vm.filterFields.map((o) => o.value)).toContain('status_id')
  })

  it('offers a custom field\'s own answers with no second row', async () => {
    const w = openLeadCrm()
    await nextTick()
    const opts = w.vm.customFieldAnswerOptions({ field: 'custom:lead_status' })
    expect(opts.map((o) => o.value)).toEqual(['OPEN', 'PROGRESS', 'CLOSED'])
  })

  it('stores the expanded pair, not the virtual row', async () => {
    const w = openLeadCrm()
    await nextTick()
    w.vm.form.definition.filters = [
      { field: 'custom:lead_status', op: 'in', values: ['OPEN'] },
    ]
    await nextTick()
    expect(w.vm.storedDefinition.filters).toEqual([
      { field: 'reporting_key', op: 'in', values: ['lead_status'] },
      { field: 'text_value', op: 'in', values: ['OPEN'] },
    ])
  })

  // ⚠ The warning reasons about reporting_key rows. Reading the unexpanded
  // form would silence it exactly when two custom fields are filtered at once —
  // the case that compiles, publishes and counts nothing.
  it('still warns when two custom fields are filtered at once', async () => {
    const w = openLeadCrm()
    await nextTick()
    w.vm.form.definition.filters = [
      { field: 'custom:lead_status', op: 'in', values: ['OPEN'] },
      { field: 'custom:lead_source', op: 'in', values: ['WEB'] },
    ]
    await nextTick()
    expect(w.vm.eavConflict).toMatch(/count nothing/i)
  })

  // The sum/avg guard demands a single-key pin. A virtual row supplies one once
  // expanded, so choosing the field is all the author has to do.
  it('satisfies the sum guard with a virtual row alone', async () => {
    const w = openLeadCrm()
    // The sourceTable watcher resets `measure`, so set it on a later tick —
    // same reason setMeasure exists in the block above.
    await nextTick()
    w.vm.form.definition.measure = { type: 'sum', field: 'numeric_value' }
    await nextTick()
    w.vm.form.definition.filters = [
      { field: 'custom:deal_value', op: 'in', values: [] },
    ]
    w.vm.form.name = 'Total deal value'
    await nextTick()
    expect(w.vm.problem).toBeNull()
  })
})

/** The breakdown half, through the dialog. */
describe('CustomMetricBuilderDialog — custom fields as a breakdown', () => {
  function openLeadCrm() {
    const w = mountDialog({ fields: LEAD_FIELDS, templates: LEAD_TEMPLATES })
    w.vm.startFromScratch()
    w.vm.form.moduleId = 'lead_crm'
    w.vm.form.definition.sourceTable = 'analytics_field_values'
    return w
  }

  it('offers the form\'s fields instead of the raw Answer column', async () => {
    const w = openLeadCrm()
    await nextTick()
    const labels = w.vm.groupFields.map((o) => o.label)
    expect(labels).toContain('Lead Source')
    expect(labels).not.toContain('Answer')
    // "One series per reportable field" stays available.
    expect(w.vm.groupFields.map((o) => o.value)).toContain('reporting_key')
  })

  it('stores the breakdown as text_value plus its pin', async () => {
    const w = openLeadCrm()
    await nextTick()
    w.vm.form.definition.groupBy = ['custom:lead_source']
    await nextTick()
    expect(w.vm.storedDefinition.groupBy).toEqual(['text_value'])
    expect(w.vm.storedDefinition.filters).toEqual([
      { field: 'reporting_key', op: 'in', values: ['lead_source'] },
    ])
  })

  // ⚠ The pin is a filter, so breaking down by a field the author ALSO filtered
  // must not add it twice — a duplicate pin reads as "two fields at once" to
  // the conflict warning and would fire it on a perfectly good metric.
  it('does not double-pin a field that is also filtered', async () => {
    const w = openLeadCrm()
    await nextTick()
    w.vm.form.definition.filters = [
      { field: 'custom:lead_source', op: 'in', values: ['WEB'] },
    ]
    w.vm.form.definition.groupBy = ['custom:lead_source']
    await nextTick()
    expect(w.vm.storedDefinition.filters).toEqual([
      { field: 'reporting_key', op: 'in', values: ['lead_source'] },
      { field: 'text_value', op: 'in', values: ['WEB'] },
    ])
    expect(w.vm.eavConflict).toBeNull()
  })

  it('warns when the breakdown pins a different field than the filter', async () => {
    const w = openLeadCrm()
    await nextTick()
    w.vm.form.definition.filters = [
      { field: 'custom:lead_status', op: 'in', values: ['OPEN'] },
    ]
    w.vm.form.definition.groupBy = ['custom:lead_source']
    await nextTick()
    expect(w.vm.eavConflict).toMatch(/count nothing/i)
  })

  it('leaves a built-in module\'s breakdown list alone', async () => {
    const w = mountDialog({ templates: LEAD_TEMPLATES })
    w.vm.startFromScratch()
    w.vm.form.moduleId = 'capa'
    w.vm.form.definition.sourceTable = 'capas'
    await nextTick()
    expect(w.vm.groupFields.map((o) => o.value)).toContain('status_id')
  })
})
