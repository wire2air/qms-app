import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { DateTime } from 'luxon'

/**
 * CreateEquipmentDialog — one component, TWO write paths, and that is the whole
 * reason this file exists.
 *
 *   create → REST      `POST /v1/services/equipment` → equipmentService, which
 *                      owns the unique-code check, the category/status enums and
 *                      the interval-unit check.
 *   edit   → SYNCENGINE `useLiveMutation` → `eq.save()` → GraphQL → equipment_upd.
 *                      equipmentService is NOT on this path, so none of those
 *                      validations run — and the RETIRED → retiredAt stamp had to
 *                      be re-implemented here in `buildModelFields()`.
 *
 * Two implementations of one rule is the shape that drifts, and the server copy
 * is the one covered by backend tests. This file covers the other copy.
 *
 * It also pins the `supplierId` control. `supplier_id` has been a column, a
 * model @Property and an `UPDATABLE_FIELDS` entry since the module shipped, and
 * BOTH payload builders have always sent it — but no control ever rendered it,
 * so every equipment row's supplier was NULL by construction and the payload
 * carried a field no user could set. That was the 19-production-readiness
 * deduction "supplierId fully wired in code and unreachable from the UI".
 */

// ── Mocks ───────────────────────────────────────────────────────────────────
const post = vi.fn(async () => ({ equipment: { id: 'new-id' } }))
vi.mock('@/api', () => ({ post: (...a) => post(...a) }))

const toastCalls = []
vi.mock('@shared/composables/useToast.js', () => ({
  useToast: () => ({
    success: (m) => toastCalls.push(['success', m]),
    error: (m) => toastCalls.push(['error', m]),
    info: (m) => toastCalls.push(['info', m]),
    warning: (m) => toastCalls.push(['warning', m]),
    notify: (o) => toastCalls.push([o.type, o.message]),
  }),
}))

// The syncEngine half. `useLiveMutation` is left REAL and handed this db, so
// the assertions are against what the dialog actually did to an Equipment
// instance — not against a stubbed-out mutation that could not fail.
let logBookRows = []
let equipmentRows = []
const saved = { instance: null, fields: null }
function makeInstance(id) {
  const inst = {
    id,
    save: vi.fn(async () => {
      // Snapshot at save time: the component mutates the instance in place.
      saved.fields = { ...inst }
      delete saved.fields.save
      saved.instance = inst
    }),
  }
  return inst
}
let equipmentInstance = null
vi.mock('@models/index', () => ({
  db: {
    Equipment: {
      findByPk: async () => equipmentInstance,
      where: () => ({ exec: async () => equipmentRows }),
    },
    LogBook: { where: () => ({ exec: async () => logBookRows }) },
  },
}))

const CreateEquipmentDialog = (await import('./CreateEquipmentDialog.vue')).default

// ── Stubs ───────────────────────────────────────────────────────────────────
// BaseDialog teleports; BaseForm owns validation. Neither is under test, and
// both would otherwise decide whether onSubmit ever runs.
const DialogStub = {
  name: 'BaseDialog',
  props: ['modelValue', 'maxWidth', 'persistent'],
  template: '<div><slot /><slot name="footer" /></div>',
}
const FormStub = { name: 'BaseForm', emits: ['submit'], template: '<div><slot /></div>' }
const FieldStub = {
  name: 'BaseField',
  props: ['label', 'required', 'optional', 'value', 'rules'],
  template: '<div class="field" :data-label="label"><slot v-bind="{ id: \'x\' }" /></div>',
}
const TextInputStub = {
  name: 'BaseTextInput',
  props: ['modelValue', 'placeholder', 'disabled', 'type', 'min'],
  emits: ['update:modelValue'],
  template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}
const TextareaStub = {
  name: 'BaseTextarea',
  props: ['modelValue', 'rows', 'placeholder'],
  template: '<textarea />',
}
const CheckboxStub = {
  name: 'BaseCheckbox',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
}
const SegmentedStub = { name: 'SegmentedControl', props: ['modelValue', 'options'], template: '<div />' }
const FooterStub = {
  name: 'BaseDialogFooter',
  props: ['submitLabel', 'loading', 'error'],
  emits: ['cancel', 'submit'],
  template: '<div class="footer" :data-label="submitLabel" :data-error="error" />',
}
const ButtonStub = { name: 'BaseButton', props: ['size', 'variant'], template: '<button><slot /></button>' }

/** A select-menu stub that records which entity picker was rendered, and where. */
function selectMenuStub(name) {
  return {
    name,
    props: ['modelValue', 'required', 'multiple', 'allStatuses'],
    emits: ['update:modelValue'],
    template: `<div class="picker" data-picker="${name}" :data-value="modelValue ?? ''" />`,
  }
}

/**
 * Mount CLOSED, then open.
 *
 * The dialog seeds every field from `props.equipment` inside `watch(open, …)`,
 * so a dialog mounted already-open never seeds: the watcher has no transition
 * to observe. That is how the real page uses it (`v-model` starts false and the
 * row click flips it), and a spec that mounted it open would silently be
 * testing a blank form while claiming to test an edit.
 */
async function mountDialog(equipment = null) {
  const w = mount(CreateEquipmentDialog, {
    props: { modelValue: false, equipment },
    global: {
      stubs: {
        BaseDialog: DialogStub,
        BaseForm: FormStub,
        BaseField: FieldStub,
        BaseTextInput: TextInputStub,
        BaseTextarea: TextareaStub,
        BaseCheckbox: CheckboxStub,
        SegmentedControl: SegmentedStub,
        BaseDialogFooter: FooterStub,
        BaseButton: ButtonStub,
        SiteSelectMenu: selectMenuStub('SiteSelectMenu'),
        DepartmentSelectMenu: selectMenuStub('DepartmentSelectMenu'),
        UserSelectMenu: selectMenuStub('UserSelectMenu'),
        SupplierSelectMenu: selectMenuStub('SupplierSelectMenu'),
        LogBookStatusBadge: { template: '<span />' },
        SupplierBadgeById: {
          name: 'SupplierBadgeById',
          props: ['supplierId'],
          template: '<span class="vendor-badge" :data-supplier="supplierId" />',
        },
        RouterLink: { props: ['to'], template: '<a><slot /></a>' },
      },
    },
  })
  await w.setProps({ modelValue: true })
  await flushPromises()
  return w
}

/** Fire the form's submit the way BaseDialogFooter's button does. */
async function submit(w) {
  w.findComponent({ name: 'BaseForm' }).vm.$emit('submit')
  await flushPromises()
}

function seedRow(overrides = {}) {
  return {
    id: 'eq-1',
    code: 'EQ-1',
    name: 'pH Meter',
    category: 'INSTRUMENT',
    siteId: 'site-1',
    departmentId: 'dept-1',
    supplierId: null,
    ownerUserId: 'user-1',
    statusId: 'IN_SERVICE',
    requiresCalibration: true,
    calibrationInterval: 6,
    calibrationIntervalUnit: 'MONTH',
    requiresPm: false,
    retiredAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  post.mockClear()
  post.mockImplementation(async () => ({ equipment: { id: 'new-id' } }))
  toastCalls.length = 0
  logBookRows = []
  equipmentRows = []
  saved.instance = null
  saved.fields = null
  equipmentInstance = makeInstance('eq-1')
})

describe('CreateEquipmentDialog — the supplier control (the wired-but-unreachable field)', () => {
  it('renders a supplier picker in create mode', async () => {
    const w = await mountDialog()
    await flushPromises()
    const picker = w.find('[data-picker="SupplierSelectMenu"]')
    expect(picker.exists(), 'supplierId must be settable by a human, not only by the payload').toBe(
      true,
    )
    expect(w.find('.field[data-label="Supplier / calibration vendor"]').exists()).toBe(true)
  })

  it('seeds the picker from the row in edit mode', async () => {
    const w = await mountDialog(seedRow({ supplierId: 'sup-9' }))
    await flushPromises()
    expect(w.find('[data-picker="SupplierSelectMenu"]').attributes('data-value')).toBe('sup-9')
  })

  it('sends the chosen supplier on the CREATE payload', async () => {
    const w = await mountDialog()
    await flushPromises()
    w.findComponent({ name: 'SupplierSelectMenu' }).vm.$emit('update:modelValue', 'sup-9')
    await flushPromises()
    await submit(w)

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]
    expect(url).toBe('/v1/services/equipment')
    expect(body.supplierId).toBe('sup-9')
  })

  it('sends the chosen supplier on the EDIT (syncEngine) path too', async () => {
    const w = await mountDialog(seedRow())
    await flushPromises()
    w.findComponent({ name: 'SupplierSelectMenu' }).vm.$emit('update:modelValue', 'sup-9')
    await flushPromises()
    await submit(w)

    expect(saved.fields, 'the edit path saved through the syncEngine').not.toBeNull()
    expect(saved.fields.supplierId).toBe('sup-9')
  })

  it('an unset supplier is sent as null, not as an empty string', async () => {
    // `''` in a UUID column is a 400 from Postgres, and the same class of bug
    // has bitten other syncEngine write paths in this repo.
    const w = await mountDialog()
    await flushPromises()
    await submit(w)
    expect(post.mock.calls[0][1].supplierId).toBeNull()
  })
})

describe('CreateEquipmentDialog — the two write paths do not converge', () => {
  it('create POSTs to the REST service, code included', async () => {
    const w = await mountDialog()
    await flushPromises()
    const inputs = w.findAllComponents({ name: 'BaseTextInput' })
    // Field order: Name, Code, then Manufacturer/Model/Serial.
    inputs[0].vm.$emit('update:modelValue', 'Torque Wrench')
    inputs[1].vm.$emit('update:modelValue', 'EQ-TW-1')
    await flushPromises()
    await submit(w)

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]
    expect(url, 'create must reach equipmentService — it owns the unique-code and enum checks').toBe(
      '/v1/services/equipment',
    )
    expect(body.code).toBe('EQ-TW-1')
    expect(body.name).toBe('Torque Wrench')
    expect(toastCalls).toContainEqual(['success', 'Equipment added'])
  })

  it('edit does NOT touch REST — it saves the model instance', async () => {
    const w = await mountDialog(seedRow())
    await flushPromises()
    await submit(w)

    expect(
      post.mock.calls.filter(([u]) => u === '/v1/services/equipment'),
      'an edit that reached REST would silently change which validations apply',
    ).toEqual([])
    expect(equipmentInstance.save).toHaveBeenCalledTimes(1)
    expect(toastCalls).toContainEqual(['success', 'Equipment updated'])
  })

  it('code is not sent on edit and the input is locked', async () => {
    const w = await mountDialog(seedRow())
    await flushPromises()
    // Locked in the UI because `code` is not in the service's UPDATABLE_FIELDS
    // and log-entry record_number continuity depends on it.
    const codeInput = w.findAllComponents({ name: 'BaseTextInput' })[1]
    expect(codeInput.props('disabled')).toBe(true)

    await submit(w)
    expect(Object.keys(saved.fields)).not.toContain('code')
  })
})

describe('CreateEquipmentDialog — the RETIRED → retiredAt stamp (the copy with no service behind it)', () => {
  it('stamps retiredAt when the status flips to RETIRED on the syncEngine path', async () => {
    const w = await mountDialog(seedRow({ statusId: 'IN_SERVICE', retiredAt: null }))
    await flushPromises()

    const statusSelect = w.findAll('select')[1] // Category, then Status
    await statusSelect.setValue('RETIRED')
    await submit(w)

    expect(saved.fields.statusId).toBe('RETIRED')
    expect(
      saved.fields.retiredAt,
      'retiring an instrument records WHEN — auditors ask, and updateEquipment is not on this path',
    ).toBeInstanceOf(DateTime)
  })

  it('does not overwrite a retiredAt the user set by hand', async () => {
    const w = await mountDialog(seedRow({ statusId: 'RETIRED', retiredAt: DateTime.fromISO('2020-01-15') }))
    await flushPromises()
    await submit(w)

    expect(saved.fields.retiredAt.toFormat('yyyy-LL-dd')).toBe('2020-01-15')
  })

  it('leaves retiredAt null for a status that is not RETIRED', async () => {
    const w = await mountDialog(seedRow({ statusId: 'IN_SERVICE' }))
    await flushPromises()
    const statusSelect = w.findAll('select')[1]
    await statusSelect.setValue('OUT_OF_SERVICE')
    await submit(w)

    expect(saved.fields.statusId).toBe('OUT_OF_SERVICE')
    expect(saved.fields.retiredAt).toBeNull()
  })
})

describe('CreateEquipmentDialog — the calibration programme fields', () => {
  it('clears the interval when the instrument stops being calibration-tracked', async () => {
    // `requiresCalibration=false` with a stale interval left behind would keep
    // the row inside the calibration-due cron's WHERE clause on the next flip.
    const w = await mountDialog(seedRow({ requiresCalibration: true, calibrationInterval: 6 }))
    await flushPromises()
    w.findAllComponents({ name: 'BaseCheckbox' })[0].vm.$emit('update:modelValue', false)
    await flushPromises()
    await submit(w)

    expect(saved.fields.requiresCalibration).toBe(false)
    expect(saved.fields.calibrationInterval).toBeNull()
  })

  it('keeps the interval unit alongside the interval', async () => {
    const w = await mountDialog(seedRow({ calibrationIntervalUnit: 'WEEK' }))
    await flushPromises()
    await submit(w)
    expect(saved.fields.calibrationInterval).toBe(6)
    expect(saved.fields.calibrationIntervalUnit).toBe('WEEK')
  })
})

describe('CreateEquipmentDialog — the custodian mirror', () => {
  it('realigns linked log book supervisors when the custodian changes', async () => {
    // Equipment is the SOURCE OF TRUTH for a linked book's supervisor (decision
    // 2026-08-06), and the edit path is GraphQL — so updateEquipment's own
    // server-side mirror never runs and the dialog must call the RPC itself.
    logBookRows = [{ id: 'lb-1', title: 'Calibration Log', statusId: 'ACTIVE' }]
    const w = await mountDialog(seedRow({ ownerUserId: 'user-1' }))
    await flushPromises()
    w.findComponent({ name: 'UserSelectMenu' }).vm.$emit('update:modelValue', 'user-2')
    await flushPromises()
    await submit(w)

    expect(post).toHaveBeenCalledWith('/v1/services/equipment/eq-1/sync-logbook-supervisors', {
      toUserId: 'user-2',
    })
    expect(toastCalls.some(([t, m]) => t === 'info' && m.includes('linked log book'))).toBe(true)
  })

  it('does not call the mirror when the custodian is unchanged', async () => {
    logBookRows = [{ id: 'lb-1', title: 'Calibration Log', statusId: 'ACTIVE' }]
    const w = await mountDialog(seedRow({ ownerUserId: 'user-1' }))
    await flushPromises()
    await submit(w)
    expect(post).not.toHaveBeenCalled()
  })

  it('does not call the mirror when no book is linked', async () => {
    logBookRows = []
    const w = await mountDialog(seedRow({ ownerUserId: 'user-1' }))
    await flushPromises()
    w.findComponent({ name: 'UserSelectMenu' }).vm.$emit('update:modelValue', 'user-2')
    await flushPromises()
    await submit(w)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('CreateEquipmentDialog — failure surfaces', () => {
  it('a refused create leaves the dialog open with the server message', async () => {
    post.mockRejectedValue(new Error('Equipment code EQ-1 already exists'))
    const w = await mountDialog()
    await flushPromises()
    await submit(w)

    expect(w.find('.footer').attributes('data-error')).toBe('Equipment code EQ-1 already exists')
    expect(w.emitted('update:modelValue')).toBeFalsy()
    expect(toastCalls.some(([t]) => t === 'success')).toBe(false)
  })
})

describe('CreateEquipmentDialog — the calibration evidence block (read-only)', () => {
  // The certificate and vendor `record-calibration` now demands have nowhere
  // else to be seen: this module has no detail page and no print module, so
  // without this block the product would require evidence it could not display.
  // It is READ-ONLY on purpose — migration 20260911150000 refuses any change to
  // those four columns on the connection this dialog saves over, and the model
  // marks them `excludeFromGraphQL`.
  it('is absent in create mode and on an instrument that has never been calibrated', async () => {
    expect((await mountDialog()).text()).not.toContain('Last calibration evidence')
    expect((await mountDialog(seedRow())).text()).not.toContain('Last calibration evidence')
  })

  it('shows the certificate number and a free-text vendor', async () => {
    const w = await mountDialog(
      seedRow({
        lastCalibrationCertificateNumber: 'CAL-2026-00417',
        lastCalibrationVendorName: 'In-house metrology bench',
      }),
    )
    expect(w.text()).toContain('Last calibration evidence')
    expect(w.text()).toContain('CAL-2026-00417')
    expect(w.text()).toContain('In-house metrology bench')
  })

  it('links the certificate when a URL was recorded, and does not when it was not', async () => {
    const linked = await mountDialog(
      seedRow({
        lastCalibrationCertificateNumber: 'CAL-1',
        lastCalibrationCertificateUrl: 'https://certs.example.com/CAL-1.pdf',
        lastCalibrationVendorName: 'Bench',
      }),
    )
    const a = linked.find('a[href="https://certs.example.com/CAL-1.pdf"]')
    expect(a.exists()).toBe(true)
    expect(a.attributes('rel'), 'an external certificate link must not leak the opener').toContain(
      'noopener',
    )

    const plain = await mountDialog(
      seedRow({ lastCalibrationCertificateNumber: 'CAL-2', lastCalibrationVendorName: 'Bench' }),
    )
    expect(plain.find('a').exists()).toBe(false)
    expect(plain.text()).toContain('CAL-2')
  })

  it('resolves a registered supplier through the badge rather than printing a uuid', async () => {
    const w = await mountDialog(
      seedRow({
        lastCalibrationCertificateNumber: 'CAL-3',
        lastCalibrationVendorId: 'sup-9',
      }),
    )
    expect(w.find('.vendor-badge').attributes('data-supplier')).toBe('sup-9')
    expect(w.text(), 'the raw id is never shown').not.toContain('sup-9')
  })

  it('never sends the evidence fields back on a save', async () => {
    // Belt and braces over `excludeFromGraphQL`: even if the generated mutation
    // changed, `buildModelFields()` must not carry them, because the DB trigger
    // refuses a CHANGE and the whole edit would fail on an unrelated rename.
    const w = await mountDialog(
      seedRow({ lastCalibrationCertificateNumber: 'CAL-4', lastCalibrationVendorId: 'sup-9' }),
    )
    await submit(w)
    for (const f of [
      'lastCalibrationCertificateNumber',
      'lastCalibrationCertificateUrl',
      'lastCalibrationVendorId',
      'lastCalibrationVendorName',
    ]) {
      expect(Object.keys(saved.fields)).not.toContain(f)
    }
  })
})
