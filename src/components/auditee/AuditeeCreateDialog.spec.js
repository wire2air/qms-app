import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// AuditeeCreateDialog — the only create path for a certification audit. What
// matters is the payload: programTypeId EXTERNAL (the one type the backend lets
// through without a standard), blanks sent as null rather than '' (a '' in a
// UUID column is a 400), and the auditing body trimmed. The zod schema strips
// undeclared keys silently, so a renamed field here would vanish without error.

const post = vi.fn()
vi.mock('@/api', () => ({ post: (...a) => post(...a) }))

const push = vi.fn()
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => ({ push }),
}))

const toasts = []
vi.mock('@shared/composables/useToast.js', () => ({
  useToast: () => ({
    success: (m) => toasts.push(['success', m]),
    error: (m) => toasts.push(['error', m]),
    warning: (m) => toasts.push(['warning', m]),
    info: (m) => toasts.push(['info', m]),
  }),
}))

// The auto-imported pickers (stubbed below) still IMPORT useLiveQuery, which
// pulls in the decorator-based model graph that this lighter vitest config does
// not transform — so the model registry is stubbed out.
vi.mock('@models/index', () => ({ db: {} }))

const AuditeeCreateDialog = (await import('./AuditeeCreateDialog.vue')).default

const FormStub = {
  name: 'BaseForm',
  emits: ['submit'],
  methods: {
    submit() {
      this.$emit('submit')
    },
  },
  template: '<div><slot /></div>',
}
const FieldStub = {
  name: 'BaseField',
  props: ['label', 'required', 'value', 'rules'],
  template: '<div class="field" :data-label="label"><slot v-bind="{}" /></div>',
}
const TextInputStub = {
  name: 'BaseTextInput',
  props: ['modelValue', 'placeholder', 'type'],
  emits: ['update:modelValue'],
  template:
    '<input :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}
function pickerStub(name) {
  return {
    name,
    props: ['modelValue', 'multiple', 'siteId'],
    emits: ['update:modelValue'],
    template: `<div class="picker" data-picker="${name}" />`,
  }
}

async function mountOpen() {
  const w = mount(AuditeeCreateDialog, {
    props: { modelValue: false },
    global: {
      stubs: {
        BaseDialog: {
          name: 'BaseDialog',
          props: ['modelValue', 'title', 'maxWidth'],
          template: '<div class="dialog"><slot /><slot name="footer" /></div>',
        },
        BaseForm: FormStub,
        BaseField: FieldStub,
        BaseTextInput: TextInputStub,
        BaseText: { template: '<span><slot /></span>' },
        BaseRichTextEditor: {
          name: 'BaseRichTextEditor',
          props: ['modelValue', 'placeholder'],
          emits: ['update:modelValue'],
          template: '<div class="rte" :data-placeholder="placeholder" />',
        },
        BaseButton: {
          name: 'BaseButton',
          props: ['variant', 'disabled', 'isLoading'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        AuditStandardSelectMenu: pickerStub('AuditStandardSelectMenu'),
        SiteSelectMenu: pickerStub('SiteSelectMenu'),
        DepartmentSelectMenu: pickerStub('DepartmentSelectMenu'),
        UserSelectMenu: pickerStub('UserSelectMenu'),
      },
    },
  })
  // Open AFTER mount — the form resets inside watch(modelValue), exactly as the
  // real page drives it (v-model starts false).
  await w.setProps({ modelValue: true })
  await flushPromises()
  return w
}

function input(w, placeholder) {
  return w.find(`input[placeholder="${placeholder}"]`)
}
function button(w, label) {
  return w.findAll('button').find((b) => b.text() === label)
}

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ auditInstance: { id: 'new-audit', auditNumber: 'AUD-0042' } })
  push.mockClear()
  toasts.length = 0
})

describe('AuditeeCreateDialog — the certification-audit payload', () => {
  it('posts programTypeId EXTERNAL with no standard, and blanks as null', async () => {
    const w = await mountOpen()
    await w.findAllComponents({ name: 'BaseTextInput' })[0].vm.$emit('update:modelValue', '2026-10-01')
    await button(w, 'Create').trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]
    expect(url).toBe('/v1/services/auditInstances')
    expect(body).toMatchObject({
      programTypeId: 'EXTERNAL',
      auditStandardId: null,
      scheduledDate: '2026-10-01',
      siteId: null,
      departmentId: null,
      leadAuditorUserId: null,
      teamUserIds: [],
      externalAuditFirm: null,
      externalAuditorName: null,
      externalAuditorEmail: null,
      externalAuditorPhone: null,
      scope: null,
      objectives: null,
    })
  })

  it('trims the auditing-body contact and carries the people pickers', async () => {
    const w = await mountOpen()
    await input(w, 'e.g. BSI, TÜV SÜD, NSF').setValue('  BSI  ')
    await input(w, "Lead auditor's name").setValue(' Rhoda Registrar ')
    await input(w, 'name@registrar.com').setValue(' rhoda@bsi.test ')
    await input(w, '+1 …').setValue(' +1 555 0100 ')
    const users = w.findAllComponents({ name: 'UserSelectMenu' })
    users[0].vm.$emit('update:modelValue', 'lead-1')
    users[1].vm.$emit('update:modelValue', ['u-2', 'u-3'])
    w.findComponent({ name: 'AuditStandardSelectMenu' }).vm.$emit('update:modelValue', 'std-1')
    await flushPromises()
    await button(w, 'Create').trigger('click')
    await flushPromises()

    const body = post.mock.calls[0][1]
    expect(body.externalAuditFirm).toBe('BSI')
    expect(body.externalAuditorName).toBe('Rhoda Registrar')
    expect(body.externalAuditorEmail).toBe('rhoda@bsi.test')
    expect(body.externalAuditorPhone).toBe('+1 555 0100')
    expect(body.leadAuditorUserId).toBe('lead-1')
    expect(body.teamUserIds).toEqual(['u-2', 'u-3'])
    expect(body.auditStandardId, 'the optional standard is still sent when picked').toBe('std-1')
  })

  it('"Create & open" routes to the new audit; "Create" stays on the list', async () => {
    let w = await mountOpen()
    await button(w, 'Create').trigger('click')
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(toasts).toContainEqual(['success', 'External audit AUD-0042 created'])

    w = await mountOpen()
    await button(w, 'Create & open').trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/auditee/new-audit')
  })

  it('a refused create keeps the dialog open and shows the server message', async () => {
    post.mockRejectedValue(new Error('Lead auditor must belong to this company'))
    const w = await mountOpen()
    await button(w, 'Create & open').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Lead auditor must belong to this company')
    expect(w.emitted('update:modelValue')).toBeFalsy()
    expect(push).not.toHaveBeenCalled()
  })

  it('offers the standard as optional and asks for OUR side of the table', async () => {
    const w = await mountOpen()
    const labels = w.findAll('.field').map((f) => f.attributes('data-label'))
    expect(labels).toEqual(
      expect.arrayContaining([
        'Scheduled Date',
        'Standard (optional)',
        'Lead POC (our company)',
        'Involved people',
        'Audit firm / registrar',
      ]),
    )
  })
})
