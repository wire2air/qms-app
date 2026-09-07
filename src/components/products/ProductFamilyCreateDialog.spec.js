import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { post } from '@/api'
import ProductFamilyCreateDialog from './ProductFamilyCreateDialog.vue'
// Vite's ?raw import — the component's own source text, so the shape assertion
// at the bottom cannot drift from the file it is about.
import SOURCE from './ProductFamilyCreateDialog.vue?raw'

/**
 * Products P1 — "Add New Group" was dead for every user, including owners.
 *
 * The dialog saved through `useLiveMutation` → `db.ProductFamily.create()` →
 * GraphQL. `product_families` is commented
 * `@behavior -insert -update -delete` (20260615000011:48), so PostGraphile
 * emits NO create mutation for it, and `app_user` holds SELECT only. The button
 * could not work, and nothing in the repository could see that: the code is
 * indistinguishable from the dozen syncEngine mutations that do work, and the
 * failure is a runtime GraphQL error on a table whose reads are perfectly fine.
 *
 * These tests pin the two halves of the fix:
 *   • BEHAVIOUR — submitting posts to the REST route the table actually has,
 *     with the payload `createProductFamilySchema` accepts, and unwraps the
 *     `sendSuccess` envelope the same way the sibling menus do.
 *   • SHAPE — the component does not reach for the syncEngine at all. That one
 *     is a source assertion on purpose. A behavioural test cannot distinguish
 *     "does not use db.ProductFamily.create" from "did not happen to reach it on
 *     this path", and the regression being guarded against is a future
 *     refactor tidying the REST call back into a useLiveMutation for
 *     consistency with its neighbours.
 */

vi.mock('@/api', () => ({ post: vi.fn() }))

// The dialog chrome is HeadlessUI/teleport-based and is not what is under test;
// these stubs render both slots inline and expose the props the assertions read.
const DialogStub = {
  name: 'BaseDialog',
  props: ['modelValue', 'title', 'maxWidth'],
  template: '<div><slot /><slot name="footer" :close="() => {}" /></div>',
}
const FormStub = {
  name: 'BaseForm',
  template: '<div><slot /></div>',
}
const FieldStub = {
  name: 'BaseField',
  props: ['label', 'required', 'value', 'rules', 'hint'],
  template: '<div><slot v-bind="{}" /></div>',
}
const TextInputStub = {
  name: 'BaseTextInput',
  props: ['modelValue', 'placeholder', 'disabled'],
  emits: ['update:modelValue', 'input'],
  template: '<input />',
}
const TextareaStub = {
  name: 'BaseTextarea',
  props: ['modelValue', 'rows', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<textarea />',
}
const FooterStub = {
  name: 'BaseDialogFooter',
  props: ['submitLabel', 'loading', 'error'],
  template: '<div />',
}

function mountDialog() {
  return mount(ProductFamilyCreateDialog, {
    props: { modelValue: true },
    global: {
      stubs: {
        BaseDialog: DialogStub,
        BaseForm: FormStub,
        BaseField: FieldStub,
        BaseTextInput: TextInputStub,
        BaseTextarea: TextareaStub,
        BaseDialogFooter: FooterStub,
      },
    },
  })
}

/** Drive the Name input, which the code field auto-derives from. */
async function typeName(wrapper, value) {
  const inputs = wrapper.findAllComponents(TextInputStub)
  await inputs[0].vm.$emit('update:modelValue', value)
  await wrapper.vm.$nextTick()
}

async function submit(wrapper) {
  await wrapper.findComponent(FormStub).vm.$emit('submit')
  await new Promise((r) => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('save path', () => {
  it('posts to the REST route the table actually has', async () => {
    post.mockResolvedValue({ productFamily: { id: 'pf-1', code: 'SKINCARE', name: 'Skincare' } })
    const wrapper = mountDialog()
    await typeName(wrapper, 'Skincare')
    await submit(wrapper)

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/v1/services/productFamilies', {
      code: 'SKINCARE',
      name: 'Skincare',
      description: null,
    })
  })

  it('sends no displayOrder — the schema defaults it and this dialog has no list to rank against', async () => {
    post.mockResolvedValue({ productFamily: { id: 'pf-1' } })
    const wrapper = mountDialog()
    await typeName(wrapper, 'Caps')
    await submit(wrapper)
    expect(post.mock.calls[0][1]).not.toHaveProperty('displayOrder')
  })

  it('trims and upper-cases the code, and trims the name', async () => {
    post.mockResolvedValue({ productFamily: { id: 'pf-1' } })
    const wrapper = mountDialog()
    await typeName(wrapper, '  Body Lotions  ')
    await submit(wrapper)
    expect(post.mock.calls[0][1]).toMatchObject({ code: 'BODY_LOTIONS', name: 'Body Lotions' })
  })

  it('unwraps the sendSuccess envelope and emits the row, not the response', async () => {
    // sendSuccess() spreads the payload at the top level ({ productFamily: … })
    // and the client interceptor strips `meta`. ProductFamilySelectMenu reads
    // `newFamily.id` off whatever this emits, so handing it the envelope would
    // leave the new group unselected with no error anywhere.
    const row = { id: 'pf-42', code: 'CAPS', name: 'Caps' }
    post.mockResolvedValue({ productFamily: row })
    const wrapper = mountDialog()
    await typeName(wrapper, 'Caps')
    await submit(wrapper)

    expect(wrapper.emitted('created')[0][0]).toEqual(row)
  })

  it('falls back to the raw response when it is already the row', async () => {
    const row = { id: 'pf-43' }
    post.mockResolvedValue(row)
    const wrapper = mountDialog()
    await typeName(wrapper, 'Caps')
    await submit(wrapper)
    expect(wrapper.emitted('created')[0][0]).toEqual(row)
  })

  it('closes on success', async () => {
    post.mockResolvedValue({ productFamily: { id: 'pf-1' } })
    const wrapper = mountDialog()
    await typeName(wrapper, 'Caps')
    await submit(wrapper)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})

describe('failure path', () => {
  it('surfaces the API message inline and keeps the dialog open', async () => {
    // A 409 from the duplicate-code branch of createProductFamily is the common
    // case here, and the user has to be able to read it and change the code.
    post.mockRejectedValue(new Error('A product family with code "CAPS" already exists'))
    const wrapper = mountDialog()
    await typeName(wrapper, 'Caps')
    await submit(wrapper)

    expect(wrapper.findComponent(FooterStub).props('error')).toBe(
      'A product family with code "CAPS" already exists',
    )
    expect(wrapper.emitted('created')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).not.toEqual([false])
  })

  it('does not leave the footer stuck in the loading state', async () => {
    post.mockRejectedValue(new Error('boom'))
    const wrapper = mountDialog()
    await typeName(wrapper, 'Caps')
    await submit(wrapper)
    expect(wrapper.findComponent(FooterStub).props('loading')).toBe(false)
  })
})

describe('code validation (new — the GraphQL path validated nothing)', () => {
  /** The Code field is the second BaseField; its rules are [required(), codeValid]. */
  function codeRule(wrapper) {
    const rules = wrapper.findAllComponents(FieldStub)[1].props('rules')
    expect(rules).toHaveLength(2)
    return rules[1]
  }

  it.each(['SKINCARE', 'BODY_LOTIONS', 'A1'])('accepts %s', (code) => {
    expect(codeRule(mountDialog())(code)).toBe(true)
  })

  it('rejects a slug that starts with a digit', () => {
    // slugify('3M Caps') → '3M_CAPS', which createProductFamilySchema's
    // /^[A-Z][A-Z0-9_]*$/ refuses. Without this rule the user sees a raw 400.
    expect(codeRule(mountDialog())('3M_CAPS')).toMatch(/SCREAMING_SNAKE_CASE/)
  })

  it('rejects a one-character code (the schema minimum is 2)', () => {
    expect(codeRule(mountDialog())('A')).toMatch(/2–100/)
  })

  it('rejects punctuation the slugifier cannot produce but a hand edit can', () => {
    // The Code field is editable behind the Edit/Lock toggle, so hand-typed
    // values reach the schema directly.
    expect(codeRule(mountDialog())('CAPS-XL')).toMatch(/SCREAMING_SNAKE_CASE/)
  })
})

describe('P1 regression guard', () => {
  // Comments are stripped first: the component's own docblock quotes the dead
  // code it replaced, and an assertion that tripped on the explanation would
  // force the next author to delete the explanation to make the test pass.
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('does not write through the syncEngine — that mutation does not exist', () => {
    expect(CODE).not.toMatch(/db\.ProductFamily\.create/)
    expect(CODE).not.toMatch(/useLiveMutation/)
  })

  it('uses the REST route, like its two sibling inline-create menus', () => {
    expect(CODE).toContain("post('/v1/services/productFamilies'")
  })
})
