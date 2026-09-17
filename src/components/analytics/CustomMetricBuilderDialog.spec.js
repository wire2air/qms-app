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
  it('offers templates when creating', () => {
    const w = mountDialog()
    expect(w.text()).toContain('Start with a template')
    expect(w.text()).toContain(OPEN_CAPAS.name)
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
    expect(w.text()).not.toContain('Start with a template')
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
    expect(w.text()).not.toContain('What this metric will measure')
  })

  it('describes the metric once it is complete', async () => {
    const w = mountDialog()
    w.vm.applyTemplate(OPEN_CAPAS)
    await nextTick()
    await nextTick()
    expect(w.text()).toContain('What this metric will measure')
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

    const panel = w.text().split('What this metric will measure')[1] ?? ''
    expect(panel).not.toMatch(/\d/)
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
