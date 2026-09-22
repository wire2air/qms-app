import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
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
]

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
  it('asks the six business questions', async () => {
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()
    const text = w.text()
    expect(text).toContain('What are you measuring?')
    expect(text).toContain('Which records should we measure?')
    expect(text).toContain('Which records should be included?')
    expect(text).toContain('When should a record count?')
    expect(text).toContain('How should the results be broken down?')
    expect(text).toContain('How should performance be interpreted?')
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
      { name: 'select_2', type: 'select', label: 'Lead Status', reporting: { enabled: true, key: 'lead_status' } },
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
    expect(w.vm.keyOptions.map((o) => o.value)).toEqual(['deal_value', 'lead_status'])
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
