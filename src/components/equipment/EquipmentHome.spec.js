import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { DateTime } from 'luxon'

/**
 * EquipmentHome — the module's ONLY screen, and until now the only module in
 * this program with literally zero frontend tests of any kind.
 *
 * What is pinned here is everything the register decides for itself, none of
 * which any other layer can see:
 *
 *   • THE THREE `isAllowed()` CALLS. `canCreate` / `canUpdate` / `canDelete`
 *     ask for `calibration_equipment:create|update|delete`. `canDelete` is the
 *     one that matters: E1 was a live REST privilege escalation in which the
 *     DELETE route asked for `:update` while this button, the RLS policy and
 *     the soft-delete trigger all asked for `:delete`. The button was RIGHT and
 *     the route was wrong — so a test that lets the button drift back onto
 *     `:update` would erase the only correct copy of that rule in the frontend.
 *
 *   • THE DUE / OVERDUE / DUE-SOON CLASSIFICATION. `dueClass()` is the module's
 *     entire calibration-status surface: there is no detail page, no print
 *     module and no dashboard widget, so amber-at-30-days and red-when-past are
 *     the only thing that tells anyone an instrument has lapsed. The boundary
 *     is exclusive (`diff < 30 days`), which no E2E assertion can pin without
 *     seeding a date to the second.
 *
 *   • THE TWO ACTION RPCs. record-calibration and record-PM are the only writes
 *     on this page that do NOT go through the syncEngine; they POST to REST and
 *     rely on the sync broadcast to refresh the row. The `recordingId` guard
 *     that stops a double-click issuing two calibrations is asserted too.
 *
 * The register's DataTable is stubbed to render the cell slots directly. The
 * real one is a 900-line component with an export manager and virtual
 * pagination, none of which is what this file is about; the stub keeps the
 * assertions on EquipmentHome's own templates and handlers.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────
let equipmentRows = []
let siteRows = []
vi.mock('@models/index', () => ({
  db: {
    Equipment: { where: () => ({ exec: async () => equipmentRows }) },
    Site: { where: () => ({ exec: async () => siteRows }) },
  },
}))

// The permission gate. Recorded rather than hard-coded so each test can assert
// the exact permission STRING the component asked for, not just the outcome.
let grants = new Set()
const isAllowedCalls = []
vi.mock('@/utils/currentSession.js', () => ({
  isAllowed: (perms) => {
    isAllowedCalls.push(perms)
    return (Array.isArray(perms) ? perms : [perms]).some((p) => grants.has(p))
  },
  currentSession: { value: { companyId: 'c1' } },
}))

const post = vi.fn(async () => ({}))
vi.mock('@/api', () => ({ post: (...a) => post(...a) }))

// useConfirm's real `confirm()` resolves only when <ConfirmDialogHost> answers,
// and nothing mounts that host under test — the promise would never settle and
// onDelete would hang forever. Mocked to a controllable answer.
let confirmAnswer = true
const confirmCalls = []
vi.mock('@shared/composables/useConfirm.js', () => ({
  useConfirm: () => ({
    confirm: async (opts) => {
      confirmCalls.push(opts)
      return confirmAnswer
    },
  }),
}))

const toastCalls = []
vi.mock('@shared/composables/useToast.js', () => ({
  useToast: () => ({
    success: (m) => toastCalls.push(['success', m]),
    error: (m) => toastCalls.push(['error', m]),
    info: (m) => toastCalls.push(['info', m]),
    warning: (m) => toastCalls.push(['warning', m]),
  }),
}))

const EquipmentHome = (await import('./EquipmentHome.vue')).default

// ── Stubs ───────────────────────────────────────────────────────────────────
const BaseListLayoutStub = {
  name: 'BaseListLayout',
  props: ['title', 'icon', 'subtitle', 'state', 'emptyIcon', 'emptyTitle'],
  template: `<div class="layout" :data-state="state" :data-empty-title="emptyTitle">
    <slot name="title" /><slot name="actions" /><slot name="filters" />
    <slot name="empty-action" /><slot />
  </div>`,
}

// Renders the register's own cell slots. Column order mirrors the component's
// `columns` computed so a td index in a test means what it means on screen.
const DataTableStub = {
  name: 'DataTable',
  props: ['pagination', 'sort', 'rows', 'columns', 'rowKey', 'mobileCards', 'filterable', 'exportManager', 'exportFilename'],
  emits: ['rowClick', 'update:pagination', 'update:sort'],
  template: `<table><tbody>
    <tr v-for="row in rows" :key="row.id" :data-row="row.code" @click="$emit('rowClick', row)">
      <td class="c-name"><slot name="body-cell-name" :row="row" /></td>
      <td class="c-status"><slot name="body-cell-status" :row="row" /></td>
      <td class="c-cal"><slot name="body-cell-nextCalibrationDue" :row="row" /></td>
      <td class="c-pm"><slot name="body-cell-nextPmDue" :row="row" /></td>
      <td class="c-actions"><slot name="body-cell-actions" :row="row" /></td>
    </tr>
  </tbody></table>`,
}

const ButtonStub = {
  name: 'BaseButton',
  props: ['variant', 'size'],
  template: '<button class="base-button"><slot /></button>',
}
const InertStub = { template: '<div />' }
// Named + prop-carrying: the edit dialog is the SAME component as the create
// dialog, distinguished only by whether it was handed an `equipment` row. That
// prop is therefore the only observable difference between "edit opened" and
// "the row click was refused".
const RecordCalibrationDialogStub = {
  name: 'RecordCalibrationDialog',
  props: ['modelValue', 'equipment'],
  template: '<div class="record-cal" :data-open="String(modelValue)" :data-subject="equipment?.code ?? \'\'" />',
}
const EquipmentDialogStub = {
  name: 'CreateEquipmentDialog',
  props: ['modelValue', 'equipment'],
  template: '<div class="equipment-dialog" :data-open="String(modelValue)" :data-subject="equipment?.code ?? \'\'" />',
}

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  return router
}

async function mountRegister() {
  const router = makeRouter()
  router.push('/equipment')
  await router.isReady()
  const w = mount(EquipmentHome, {
    global: {
      plugins: [router],
      stubs: {
        BaseListLayout: BaseListLayoutStub,
        DataTable: DataTableStub,
        BaseButton: ButtonStub,
        HelpButton: InertStub,
        EquipmentFilterToolbar: InertStub,
        CreateEquipmentDialog: EquipmentDialogStub,
        CreateLogBookDialog: InertStub,
        RecordCalibrationDialog: RecordCalibrationDialogStub,
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  })
  await flushPromises()
  return w
}

/** Days from now, as the luxon DateTime the syncEngine model actually holds. */
function inDays(n) {
  return DateTime.now().plus({ days: n })
}

function makeEquipment(overrides = {}) {
  return {
    id: overrides.code ?? 'eq-1',
    code: 'EQ-1',
    name: 'Vernier Calipers',
    serialNumber: 'SN-1',
    category: 'INSTRUMENT',
    siteId: 'site-1',
    statusId: 'IN_SERVICE',
    requiresCalibration: false,
    requiresPm: false,
    nextCalibrationDue: null,
    nextPmDue: null,
    delete: vi.fn(async () => {}),
    ...overrides,
  }
}

beforeEach(() => {
  equipmentRows = []
  siteRows = [{ id: 'site-1', name: 'Primary Site' }]
  grants = new Set()
  isAllowedCalls.length = 0
  confirmCalls.length = 0
  toastCalls.length = 0
  post.mockClear()
  post.mockImplementation(async () => ({}))
  confirmAnswer = true
})

describe('EquipmentHome — the permission gates (E1 regression surface)', () => {
  it('asks for calibration_equipment:create|update|delete, and nothing else', async () => {
    // A row must be present: `canUpdate` and `canDelete` are computeds, and a
    // computed nothing reads is never evaluated — with an empty register only
    // `canCreate` (read by the header action) would be asked for, and the two
    // permissions that actually gate writes would go unasserted.
    equipmentRows = [makeEquipment({ requiresCalibration: true, requiresPm: true })]
    await mountRegister()
    const asked = isAllowedCalls.flat()
    expect(asked).toContain('calibration_equipment:create')
    expect(asked).toContain('calibration_equipment:update')
    // The one that matters. E1 was the DELETE route asking `:update` while this
    // button asked `:delete`; the button was the correct copy of the rule.
    expect(asked).toContain('calibration_equipment:delete')
    expect(
      asked.filter((p) => !p.startsWith('calibration_equipment:')),
      'the register must not gate on a module it does not own',
    ).toEqual([])
  })

  it('hides New Equipment without :create', async () => {
    const w = await mountRegister()
    expect(w.text()).not.toContain('New Equipment')
  })

  it('shows New Equipment with :create', async () => {
    grants = new Set(['calibration_equipment:create'])
    const w = await mountRegister()
    expect(w.text()).toContain('New Equipment')
  })

  it('a row click does not open the edit dialog without :update', async () => {
    equipmentRows = [makeEquipment()]
    const w = await mountRegister()
    await w.find('tr[data-row="EQ-1"]').trigger('click')
    await flushPromises()
    // openEdit early-returns on !canUpdate, so no editing row is ever seeded
    // and the second dialog instance never receives a subject.
    const dialogs = w.findAllComponents({ name: 'CreateEquipmentDialog' })
    expect(dialogs, 'create dialog + edit dialog, same component').toHaveLength(2)
    expect(dialogs.map((d) => d.props('equipment'))).toEqual([undefined, null])
    expect(dialogs[1].attributes('data-open')).toBe('false')
  })

  it('a row click DOES open the edit dialog on that row with :update', async () => {
    grants = new Set(['calibration_equipment:update'])
    equipmentRows = [makeEquipment()]
    const w = await mountRegister()
    await w.find('tr[data-row="EQ-1"]').trigger('click')
    await flushPromises()

    const edit = w.findAllComponents({ name: 'CreateEquipmentDialog' })[1]
    expect(edit.attributes('data-open')).toBe('true')
    expect(edit.attributes('data-subject'), 'the clicked row is the subject').toBe('EQ-1')
  })

  it('the delete control appears only with :delete — NOT with :update', async () => {
    equipmentRows = [makeEquipment()]

    grants = new Set(['calibration_equipment:update'])
    const withUpdate = await mountRegister()
    expect(
      withUpdate.find('[aria-label="Delete equipment"]').exists(),
      'update alone must never expose delete — this is E1',
    ).toBe(false)

    grants = new Set(['calibration_equipment:delete'])
    const withDelete = await mountRegister()
    expect(withDelete.find('[aria-label="Delete equipment"]').exists()).toBe(true)
  })
})

describe('EquipmentHome — the calibration status surface', () => {
  it('paints overdue red, due-soon amber and comfortable neutral', async () => {
    equipmentRows = [
      makeEquipment({ code: 'OVERDUE', name: 'Lapsed', nextCalibrationDue: inDays(-45) }),
      makeEquipment({ code: 'SOON', name: 'Due soon', nextCalibrationDue: inDays(20) }),
      makeEquipment({ code: 'FINE', name: 'Comfortable', nextCalibrationDue: inDays(200) }),
    ]
    const w = await mountRegister()

    const cell = (code) => w.find(`tr[data-row="${code}"] td.c-cal span`)
    expect(cell('OVERDUE').classes().join(' ')).toContain('tw:text-red-700')
    expect(cell('SOON').classes().join(' ')).toContain('tw:text-amber-700')
    expect(cell('FINE').classes().join(' ')).toContain('tw:text-secondary')
    // Amber is a warning, not a breach: it must not also read as overdue.
    expect(cell('SOON').classes().join(' ')).not.toContain('tw:text-red-700')
  })

  it('the due-soon window is 30 days and its edges are exclusive', async () => {
    // The only place this boundary is decidable. `dueSoon` is `diff < 30 days`,
    // so 29 days out is amber and 31 is not — an E2E fixture cannot seed either
    // side of that line reliably, and a month-long window that quietly became a
    // week (or a year) would look identical in every browser journey.
    equipmentRows = [
      makeEquipment({ code: 'IN', name: 'Inside', nextCalibrationDue: inDays(29) }),
      makeEquipment({ code: 'OUT', name: 'Outside', nextCalibrationDue: inDays(31) }),
    ]
    const w = await mountRegister()
    const cls = (code) => w.find(`tr[data-row="${code}"] td.c-cal span`).classes().join(' ')
    expect(cls('IN')).toContain('tw:text-amber-700')
    expect(cls('OUT')).toContain('tw:text-secondary')
  })

  it('an instrument with no due date shows an em dash, not a false "in calibration"', async () => {
    equipmentRows = [makeEquipment({ code: 'NONE', nextCalibrationDue: null })]
    const w = await mountRegister()
    expect(w.find('tr[data-row="NONE"] td.c-cal').text()).toBe('—')
  })

  it('the PM column is classified by the same rules, independently of calibration', async () => {
    equipmentRows = [
      makeEquipment({ code: 'PM', nextCalibrationDue: inDays(200), nextPmDue: inDays(-10) }),
    ]
    const w = await mountRegister()
    expect(w.find('tr[data-row="PM"] td.c-cal span').classes().join(' ')).toContain('tw:text-secondary')
    expect(w.find('tr[data-row="PM"] td.c-pm span').classes().join(' ')).toContain('tw:text-red-700')
  })

  it('renders the status badge from the row, un-underscored', async () => {
    equipmentRows = [makeEquipment({ code: 'IS', statusId: 'IN_SERVICE' })]
    const w = await mountRegister()
    expect(w.find('tr[data-row="IS"] td.c-status').text()).toBe('IN SERVICE')
  })

  it('the default filter keeps retired and out-of-service gear out of the register', async () => {
    // `filters.status` defaults to ['IN_SERVICE'], which is the product rule
    // that keeps decommissioned gear out of the way — and the reason EQ-J1's
    // retire journey asserts the row LEAVES the default view.
    equipmentRows = [
      makeEquipment({ code: 'LIVE', statusId: 'IN_SERVICE' }),
      makeEquipment({ code: 'OOS', statusId: 'OUT_OF_SERVICE' }),
      makeEquipment({ code: 'GONE', statusId: 'RETIRED' }),
    ]
    const w = await mountRegister()
    expect(w.find('tr[data-row="LIVE"]').exists()).toBe(true)
    expect(w.find('tr[data-row="OOS"]').exists()).toBe(false)
    expect(w.find('tr[data-row="GONE"]').exists()).toBe(false)
  })
})

describe('EquipmentHome — the calibration and PM quick actions', () => {
  it('offers Record calibration only for a calibration-tracked instrument the user may update', async () => {
    equipmentRows = [
      makeEquipment({ code: 'TRACKED', requiresCalibration: true }),
      makeEquipment({ code: 'UNTRACKED', requiresCalibration: false }),
    ]

    grants = new Set(['calibration_equipment:update'])
    const w = await mountRegister()
    expect(w.find('tr[data-row="TRACKED"] td.c-actions').text()).toContain('Record calibration')
    expect(
      w.find('tr[data-row="UNTRACKED"] td.c-actions').text(),
      'requires_calibration=false is what makes the gate a gate',
    ).not.toContain('Record calibration')

    grants = new Set()
    const readOnly = await mountRegister()
    expect(readOnly.find('tr[data-row="TRACKED"] td.c-actions').text()).not.toContain(
      'Record calibration',
    )
  })

  it('Record calibration opens the e-signed dialog on that row — it no longer POSTs by itself', async () => {
    // This assertion is the whole point of the 2026-09-08 change. The action
    // used to be `post('/…/record-calibration', {})` fired straight off the row:
    // one click, empty body, no signer, no certificate, no vendor — on the one
    // call in the module that clears the QC capture gate. A click must now do
    // nothing but open the dialog that collects the evidence.
    grants = new Set(['calibration_equipment:update'])
    equipmentRows = [makeEquipment({ code: 'TRACKED', id: 'eq-7', requiresCalibration: true })]
    const w = await mountRegister()

    await w.find('tr[data-row="TRACKED"] td.c-actions button').trigger('click')
    await flushPromises()

    expect(
      post,
      'a bare click must not be able to re-open an instrument for production use',
    ).not.toHaveBeenCalled()

    const dialog = w.findComponent({ name: 'RecordCalibrationDialog' })
    expect(dialog.attributes('data-open')).toBe('true')
    expect(dialog.attributes('data-subject'), 'the clicked row is the subject').toBe('TRACKED')
  })

  it('the calibration dialog is mounted before any row is clicked, with no subject', async () => {
    // It lives outside BaseListLayout so it survives the empty state, and it
    // must not adopt a stale subject between clicks.
    grants = new Set(['calibration_equipment:update'])
    const w = await mountRegister()
    const dialog = w.findComponent({ name: 'RecordCalibrationDialog' })
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-open')).toBe('false')
    expect(dialog.attributes('data-subject')).toBe('')
  })

  it('Record PM is a separate control on a separate flag, and posts its own route', async () => {
    grants = new Set(['calibration_equipment:update'])
    equipmentRows = [
      makeEquipment({ code: 'PMONLY', id: 'eq-9', requiresCalibration: false, requiresPm: true }),
    ]
    const w = await mountRegister()

    const actions = w.find('tr[data-row="PMONLY"] td.c-actions')
    expect(actions.text()).toContain('Record PM')
    expect(actions.text()).not.toContain('Record calibration')

    await actions.find('button').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/v1/services/equipment/eq-9/record-pm', {})
  })
})

describe('EquipmentHome — delete', () => {
  it('confirms before deleting, and the delete is the model soft-delete', async () => {
    grants = new Set(['calibration_equipment:delete'])
    const row = makeEquipment({ code: 'DOOMED', name: 'Old Gauge' })
    equipmentRows = [row]
    const w = await mountRegister()

    await w.find('[aria-label="Delete equipment"]').trigger('click')
    await flushPromises()

    expect(confirmCalls[0]).toMatchObject({ title: 'Delete Equipment', danger: true })
    expect(confirmCalls[0].message).toContain('Old Gauge')
    // Equipment is paranoid: BaseModel.delete() issues an UPDATE setting
    // deleted_at, never a DELETE, and never touches REST.
    expect(row.delete).toHaveBeenCalledTimes(1)
    expect(post).not.toHaveBeenCalled()
  })

  it('declining the confirm deletes nothing', async () => {
    grants = new Set(['calibration_equipment:delete'])
    confirmAnswer = false
    const row = makeEquipment({ code: 'SPARED' })
    equipmentRows = [row]
    const w = await mountRegister()

    await w.find('[aria-label="Delete equipment"]').trigger('click')
    await flushPromises()

    expect(row.delete).not.toHaveBeenCalled()
    expect(toastCalls).toEqual([])
  })

  it('a refused delete surfaces the error rather than a success toast', async () => {
    // The register cannot distinguish "the button was visible" from "the write
    // was allowed": `equipment_del` and the soft-delete guard both re-check
    // `calibration_equipment:delete` at the database, and REST is not the path
    // here — the syncEngine's paranoid UPDATE is.
    grants = new Set(['calibration_equipment:delete'])
    const row = makeEquipment({ code: 'DENIED' })
    row.delete = vi.fn(async () => {
      throw new Error('permission denied for table equipment')
    })
    equipmentRows = [row]
    const w = await mountRegister()

    await w.find('[aria-label="Delete equipment"]').trigger('click')
    await flushPromises()

    expect(toastCalls).toEqual([['error', 'permission denied for table equipment']])
  })
})

describe('EquipmentHome — the empty state', () => {
  // EQ-FE-1 (found writing this file, not fixed here — the fix is a product
  // decision about whether a default filter counts as "active").
  //
  // `list.hasActiveFilters` is TRUE the moment the page mounts, because
  // `status: ['IN_SERVICE']` is a non-empty DEFAULT filter and useTableFilters
  // counts a non-empty array as active. Two things follow, and both are wrong
  // for a tenant that has never added an instrument:
  //
  //   • the empty state reads "No equipment matches your filters" — blaming a
  //     filter the user never set — instead of "No equipment yet";
  //   • the empty-state CTA is `v-if="canCreate && !list.hasActiveFilters"`,
  //     so the "Add the first one" button is HIDDEN from the exact user who
  //     needs it. The header's "New Equipment" button is unaffected, so the
  //     module is still reachable; the onboarding affordance is not.
  //
  // Pinned as observed rather than as intended: a test asserting the intended
  // string would fail today and be silenced, and one asserting nothing would
  // let the CTA quietly stay dead.
  it('shows the FILTERED empty title on a virgin register, because the default status filter counts as active', async () => {
    const w = await mountRegister()
    expect(w.find('.layout').attributes('data-empty-title')).toBe(
      'No equipment matches your filters',
    )
  })

  it('and therefore hides the empty-state CTA from a user who holds :create', async () => {
    grants = new Set(['calibration_equipment:create'])
    const w = await mountRegister()
    expect(w.text(), 'the header action still offers it').toContain('New Equipment')
    expect(w.text(), 'but the empty-state CTA is suppressed by the default filter').not.toContain(
      'Add the first one',
    )
  })
})
