import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { DateTime } from 'luxon'

/**
 * RecordCalibrationDialog — the frontend half of the Part 11 package.
 *
 * `POST /v1/services/equipment/:id/record-calibration` is the one call in this
 * module that clears an ENFORCED production control: `inspectionResultService`
 * refuses a QC measurement taken with a lapsed instrument, and this call is what
 * un-lapses it. It used to be a one-click, empty-body POST. The server now
 * demands an e-signature, a certificate number and a vendor — this dialog is
 * what makes that reachable, and every assertion below is about a rule the
 * server would otherwise reject the request for.
 *
 * The value of testing the CLIENT-side copy of each rule is that a server 400 is
 * the worst possible way to discover a missing field: the user has already typed
 * the evidence and clicked Sign, and the failure arrives after the PIN prompt.
 */
const post = vi.fn(async () => ({ equipment: {} }))
vi.mock('@/api', () => ({ post: (...a) => post(...a), get: vi.fn() }))

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

vi.mock('@models/index', () => ({ db: {} }))

const RecordCalibrationDialog = (await import('./RecordCalibrationDialog.vue')).default

const DialogStub = {
  name: 'BaseDialog',
  props: ['modelValue', 'maxWidth', 'persistent'],
  template: '<div><slot /><slot name="footer" :close="() => {}" /></div>',
}
const FieldStub = {
  name: 'BaseField',
  props: ['label', 'required', 'optional'],
  template: '<div class="field" :data-label="label"><slot v-bind="{ id: \'x\' }" /></div>',
}
const TextInputStub = {
  name: 'BaseTextInput',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}
const TextareaStub = {
  name: 'BaseTextarea',
  props: ['modelValue', 'rows', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<textarea />',
}
const FooterStub = {
  name: 'BaseDialogFooter',
  props: ['submitLabel', 'loading', 'disabled', 'error'],
  emits: ['cancel', 'submit'],
  template: '<div class="footer" :data-disabled="String(disabled)" :data-error="error ?? \'\'" />',
}
const SupplierStub = {
  name: 'SupplierSelectMenu',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div data-picker="supplier" :data-value="modelValue ?? \'\'" />',
}
const EsignStub = {
  name: 'workflowInstanceEsignAuthDialog',
  props: ['modelValue'],
  emits: ['verified', 'update:modelValue'],
  template: '<div class="esign" :data-open="String(modelValue)" />',
}

function instrument(overrides = {}) {
  return {
    id: 'eq-1',
    code: 'E2E-CAL-DUE',
    name: 'Vernier Calipers',
    supplierId: null,
    calibrationInterval: 6,
    calibrationIntervalUnit: 'MONTH',
    ...overrides,
  }
}

async function mountDialog(equipment = instrument()) {
  // Mount CLOSED then open: the form seeds inside `watch(show, …)`, exactly as
  // the register drives it.
  const w = mount(RecordCalibrationDialog, {
    props: { modelValue: false, equipment },
    global: {
      stubs: {
        BaseDialog: DialogStub,
        BaseField: FieldStub,
        BaseTextInput: TextInputStub,
        BaseTextarea: TextareaStub,
        BaseDialogFooter: FooterStub,
        SupplierSelectMenu: SupplierStub,
        workflowInstanceEsignAuthDialog: EsignStub,
      },
    },
  })
  await w.setProps({ modelValue: true })
  await flushPromises()
  return w
}

const footer = (w) => w.findComponent({ name: 'BaseDialogFooter' })
const esign = (w) => w.findComponent({ name: 'workflowInstanceEsignAuthDialog' })

/** Fill the two fields the server requires, leaving everything else default. */
async function fillMinimum(w, { certificate = 'CAL-2026-00417', vendor = 'In-house bench' } = {}) {
  const inputs = w.findAllComponents({ name: 'BaseTextInput' })
  inputs[0].vm.$emit('update:modelValue', certificate) // certificate number
  if (vendor !== null) inputs[2].vm.$emit('update:modelValue', vendor) // vendor name
  await flushPromises()
}

async function submit(w) {
  footer(w).vm.$emit('submit')
  await flushPromises()
}

beforeEach(() => {
  post.mockClear()
  post.mockImplementation(async () => ({ equipment: {} }))
  toastCalls.length = 0
})

describe('RecordCalibrationDialog — the evidence the server requires', () => {
  it('will not submit without a certificate number', async () => {
    const w = await mountDialog()
    await fillMinimum(w, { certificate: '' })
    expect(footer(w).attributes('data-disabled')).toBe('true')
    await submit(w)
    expect(esign(w).attributes('data-open'), 'no PIN prompt for a request that cannot succeed').toBe(
      'false',
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('will not submit without a vendor in either form', async () => {
    const w = await mountDialog()
    await fillMinimum(w, { vendor: null })
    expect(footer(w).attributes('data-disabled')).toBe('true')
  })

  it('accepts a registered supplier as the vendor', async () => {
    const w = await mountDialog()
    await fillMinimum(w, { vendor: null })
    w.findComponent({ name: 'SupplierSelectMenu' }).vm.$emit('update:modelValue', 'sup-9')
    await flushPromises()
    expect(footer(w).attributes('data-disabled')).toBe('false')

    await submit(w)
    esign(w).vm.$emit('verified', { method: 'PIN', token: '12345678' })
    await flushPromises()

    expect(post.mock.calls[0][1].calibrationVendorId).toBe('sup-9')
    expect(post.mock.calls[0][1].calibrationVendorName).toBeNull()
  })

  it('accepts a free-text vendor for an in-house bench', async () => {
    const w = await mountDialog()
    await fillMinimum(w)
    expect(footer(w).attributes('data-disabled')).toBe('false')

    await submit(w)
    esign(w).vm.$emit('verified', { method: 'PIN', token: '12345678' })
    await flushPromises()

    expect(post.mock.calls[0][1].calibrationVendorName).toBe('In-house bench')
    expect(post.mock.calls[0][1].calibrationVendorId).toBeNull()
  })

  it('refuses to submit an instrument with no calibration interval, and says why', async () => {
    // The server's message is "Set a calibration interval or provide an explicit
    // next-due date". Reaching it costs the user a PIN prompt first.
    const w = await mountDialog(instrument({ calibrationInterval: null }))
    await fillMinimum(w)
    expect(footer(w).attributes('data-disabled')).toBe('true')
    expect(w.text()).toContain('no calibration interval')
  })

  it('previews the cadence the next-due date will be measured by', async () => {
    const w = await mountDialog(instrument({ calibrationInterval: 1, calibrationIntervalUnit: 'DAY' }))
    expect(w.text()).toContain('1 day')
    const w6 = await mountDialog(instrument({ calibrationInterval: 6, calibrationIntervalUnit: 'MONTH' }))
    expect(w6.text()).toContain('6 months')
  })
})

describe('RecordCalibrationDialog — the signature', () => {
  it('collects the evidence FIRST, then prompts for the PIN', async () => {
    const w = await mountDialog()
    expect(esign(w).attributes('data-open')).toBe('false')
    await fillMinimum(w)
    await submit(w)
    expect(esign(w).attributes('data-open')).toBe('true')
    expect(post, 'nothing is written until the signature comes back').not.toHaveBeenCalled()
  })

  it('forwards the signature credentials on the same request as the evidence', async () => {
    // One request, one transaction: the signature is manifested against the
    // instrument inside it, so a refused PIN rolls the calibration back with it.
    const w = await mountDialog()
    await fillMinimum(w)
    await submit(w)
    esign(w).vm.$emit('verified', { method: 'PIN', token: '12345678', provider: null })
    await flushPromises()

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]
    expect(url).toBe('/v1/services/equipment/eq-1/record-calibration')
    expect(body).toMatchObject({
      certificateNumber: 'CAL-2026-00417',
      calibrationVendorName: 'In-house bench',
      method: 'PIN',
      token: '12345678',
    })
    expect(toastCalls).toContainEqual(['success', 'Calibration recorded for Vernier Calipers'])
    expect(w.props('modelValue') === false || w.emitted('update:modelValue')).toBeTruthy()
    expect(w.emitted('recorded')).toBeTruthy()
  })

  it('omits `provider` entirely rather than sending null', async () => {
    // Found on the live stack: `schemas/equipment.js`'s esignFields types
    // `provider` as an optional STRING, so `provider: null` — the idiom every
    // other e-sign consumer in this repo uses (`esignData.provider || null`) —
    // is refused with `{ fields: { provider: ['Invalid value'] } }` before a
    // single line of calibration logic runs. The PIN dialog never sets one, so
    // this is the ordinary path, not an edge case, and it took two full E2E
    // runs to see because the symptom is "the next-due date never moved".
    const w = await mountDialog()
    await fillMinimum(w)
    await submit(w)
    esign(w).vm.$emit('verified', { method: 'PIN', token: '12345678', provider: null })
    await flushPromises()

    expect(Object.keys(post.mock.calls[0][1])).not.toContain('provider')
  })

  it('forwards a real provider when one is present', async () => {
    const w = await mountDialog()
    await fillMinimum(w)
    await submit(w)
    esign(w).vm.$emit('verified', { method: 'OAUTH', token: 'tk', provider: 'okta' })
    await flushPromises()

    expect(post.mock.calls[0][1].provider).toBe('okta')
  })

  it('a refused request keeps the dialog open with the typed evidence intact', async () => {
    post.mockRejectedValue(new Error('E-signature verification failed'))
    const w = await mountDialog()
    await fillMinimum(w)
    await submit(w)
    esign(w).vm.$emit('verified', { method: 'PIN', token: 'wrong' })
    await flushPromises()

    expect(footer(w).attributes('data-error')).toBe('E-signature verification failed')
    expect(w.emitted('recorded')).toBeFalsy()
    // The certificate the user typed is still there — closing on failure would
    // throw away the expensive part of the form.
    expect(w.findAllComponents({ name: 'BaseTextInput' })[0].props('modelValue')).toBe(
      'CAL-2026-00417',
    )
  })
})

describe('RecordCalibrationDialog — the calibration date', () => {
  it('omits calibratedAt when the date is today, so the server stamps its own clock', async () => {
    // `<input type="date">` yields yyyy-MM-dd, which the server reads as MIDNIGHT
    // UTC. In a timezone ahead of UTC that instant is in the FUTURE for the first
    // hours of the local day, and parseEventDate refuses a future event with five
    // minutes of tolerance — so sending "today" would fail overnight in Asia and
    // Australia. Sending nothing means "now", which is what today means.
    const w = await mountDialog()
    await fillMinimum(w)
    await submit(w)
    esign(w).vm.$emit('verified', { method: 'PIN', token: '12345678' })
    await flushPromises()

    expect(Object.keys(post.mock.calls[0][1])).not.toContain('calibratedAt')
  })

  it('sends an explicitly backdated certificate date', async () => {
    const w = await mountDialog()
    await fillMinimum(w)
    const backdate = DateTime.now().minus({ days: 9 }).toFormat('yyyy-LL-dd')
    await w.find('input[type="date"]').setValue(backdate)
    await submit(w)
    esign(w).vm.$emit('verified', { method: 'PIN', token: '12345678' })
    await flushPromises()

    expect(post.mock.calls[0][1].calibratedAt).toBe(backdate)
  })
})

describe('RecordCalibrationDialog — reopening', () => {
  it('clears the previous instrument’s evidence when reopened', async () => {
    // The register reuses one dialog instance for every row. A certificate
    // number carried over from the last instrument would be attached to the
    // wrong calibration record — and the server has no way to notice.
    const w = await mountDialog()
    await fillMinimum(w, { certificate: 'CAL-OLD-1' })
    await w.setProps({ modelValue: false })
    await w.setProps({ modelValue: true, equipment: instrument({ id: 'eq-2', name: 'pH Meter' }) })
    await flushPromises()

    expect(w.findAllComponents({ name: 'BaseTextInput' })[0].props('modelValue')).toBe('')
    expect(footer(w).attributes('data-disabled')).toBe('true')
  })

  it('seeds the vendor from the instrument’s own supplier, when it has one', async () => {
    const w = await mountDialog(instrument({ supplierId: 'sup-7' }))
    expect(w.find('[data-picker="supplier"]').attributes('data-value')).toBe('sup-7')
  })
})
