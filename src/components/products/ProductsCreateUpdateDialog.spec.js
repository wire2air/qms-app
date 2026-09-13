import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
// Vite's ?raw import — the component's own source text, so the shape assertions
// at the bottom cannot drift from the file they are about.
import SOURCE from './ProductsCreateUpdateDialog.vue?raw'

/**
 * ProductsCreateUpdateDialog — the item master's only writer.
 *
 * This one component is the ENTIRE write surface of the Products module. There
 * is no products REST route, no controller and no service layer: every byte
 * that reaches `products` is a GraphQL mutation this dialog (or the CSV import,
 * which reuses the same model) issues through the syncEngine. Whatever it
 * normalises is what the database receives, and whatever it fails to normalise
 * arrives raw.
 *
 * Four things are pinned here, each because nothing else in the repository can
 * see them:
 *
 *  1. THE CRITICALITY OPTION LIST. `products_criticality_chk` (migration
 *     20260907250000) closes the column to CRITICAL | MAJOR | MINOR, and its
 *     header says explicitly that the allowed set was taken FROM THIS
 *     COMPONENT'S LIST rather than from the migration's own prose comment,
 *     because this dialog is repo-wide the only writer of the column. So the
 *     two are one rule stored in two places: add a fourth option here and every
 *     save carrying it fails at the database with a raw 23514 the user cannot
 *     act on.
 *
 *  2. THE EMPTY-STRING → NULL NORMALISATION. `erpItemCode` is under a PARTIAL
 *     unique index (`WHERE erp_item_code IS NOT NULL AND deleted_at IS NULL`).
 *     An empty string is NOT NULL, so if the dialog ever sent `''` the SECOND
 *     item saved without an ERP code would collide with the first — a duplicate
 *     -key error on a field neither user filled in. Same class of trap as the
 *     '' → uuid-column failures recorded elsewhere in this program.
 *
 *  3. THE createdBy / updatedBy STAMP. Both columns are NOT NULL with an FK to
 *     `users`, and NOTHING in the database fills them. The client model's
 *     constructor does, from the session — so attribution on the item master is
 *     a frontend responsibility, which is unusual enough to be worth a test.
 *
 *  4. THE SKU AVAILABILITY CHECK IS PARANOID-BLIND, deliberately pinned as a
 *     LIMITATION rather than as a feature. `db.Product.where().exec()` excludes
 *     tombstones, so the field says "available" for a SKU a tombstone still
 *     holds. That was P3: before migration 20260907240000 the unique index was
 *     TOTAL, so the save then died on a raw 23505 the client could not have
 *     predicted. The client cannot fix this on its own — it cannot see the
 *     tombstone — which is exactly why the INDEX was the layer that changed.
 *     This test pins the blindness so that nobody "fixes" it here and quietly
 *     re-creates the pressure to make the index total again.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

// Every live query in this component runs against the real composables and this
// stub registry, the same shape SiteBadgeById.spec.js uses.
let productRows = []
let supplierLinkRows = []
const savedProducts = []
const createdProducts = []
const createdLinks = []

// Flipped by the failure-path test so a save rejects the way the syncEngine
// does when Postgres refuses the row (23505 duplicate SKU, 23514 criticality,
// an RLS refusal). There is no REST layer between the dialog and any of those,
// so a raw driver message is genuinely what a user would see.
let nextSaveError = null

function makeProductInstance(payload) {
  const instance = {
    ...payload,
    id: payload.id ?? 'new-product-id',
    save: vi.fn(async () => {
      if (nextSaveError) throw new Error(nextSaveError)
      savedProducts.push({ ...instance })
      return instance
    }),
  }
  return instance
}

vi.mock('@models/index', () => ({
  db: {
    Product: {
      where: () => ({ exec: async () => productRows }),
      findByPk: async (id) => productRows.find((p) => p.id === id) ?? null,
      create: (payload) => {
        const row = makeProductInstance(payload)
        createdProducts.push(row)
        return row
      },
    },
    ProductSupplier: {
      where: () => ({ exec: async () => supplierLinkRows }),
      create: (payload) => {
        const row = { ...payload, id: `link-${createdLinks.length}`, save: vi.fn(async () => {}) }
        createdLinks.push(row)
        return row
      },
    },
  },
}))

vi.mock('@/utils/currentSession.js', () => ({
  currentSession: { value: { userId: 'user-1', companyId: 'company-1', isOwner: false } },
  isAllowed: () => false,
}))

// `useLiveMutation` toasts every non-validation failure itself and RETURNS
// UNDEFINED rather than rethrowing (src/composables/useLiveQuery.js:157-178).
// That is the only place a user learns why a save failed on this module, so the
// toast is captured and asserted rather than stubbed away.
const toasts = []
vi.mock('@shared/composables/useToast.js', () => ({
  useToast: () => ({
    notify: (o) => toasts.push(o),
    success: (m) => toasts.push({ type: 'success', message: m }),
    error: (m) => toasts.push({ type: 'error', message: m }),
    warning: (m) => toasts.push({ type: 'warning', message: m }),
    info: (m) => toasts.push({ type: 'info', message: m }),
  }),
}))

const ProductsCreateUpdateDialog = (await import('./ProductsCreateUpdateDialog.vue')).default

// ── Stubs ───────────────────────────────────────────────────────────────────
// The dialog chrome is HeadlessUI/teleport-based and the select menus are
// separate components with their own tests; neither is what this file is about.
const DialogStub = {
  name: 'BaseDialog',
  props: ['modelValue', 'size'],
  template: '<div><slot name="title" /><slot /><slot name="footer" /></div>',
}
const FormStub = { name: 'BaseForm', template: '<div><slot /></div>' }
const FieldStub = {
  name: 'BaseField',
  props: ['label', 'required', 'value', 'rules', 'error'],
  template: '<div :data-field="label"><slot v-bind="{}" /></div>',
}
const TextInputStub = {
  name: 'BaseTextInput',
  props: ['modelValue', 'placeholder', 'disabled', 'type', 'min'],
  emits: ['update:modelValue'],
  template: '<input :disabled="disabled" />',
}
const TextareaStub = {
  name: 'BaseTextarea',
  props: ['modelValue', 'label', 'placeholder', 'maxlength', 'rows'],
  emits: ['update:modelValue'],
  template: '<textarea />',
}
const CheckboxStub = {
  name: 'BaseCheckbox',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input type="checkbox" />',
}
const InlineSelectStub = {
  name: 'BaseInlineSelect',
  props: ['modelValue', 'items', 'clearable', 'nullLabel'],
  emits: ['update:modelValue'],
  template: '<div class="inline-select" />',
}
const SelectMenuStub = {
  name: 'SelectMenu',
  props: ['modelValue', 'required', 'multiple', 'allStatuses', 'nullLabel'],
  emits: ['update:modelValue'],
  template: '<div class="select-menu" />',
}
const FooterStub = {
  name: 'BaseDialogFooter',
  props: ['submitLabel', 'loading', 'error'],
  emits: ['cancel', 'submit'],
  template: '<div class="footer" />',
}

function mountDialog(props = {}) {
  return mount(ProductsCreateUpdateDialog, {
    props: { modelValue: true, ...props },
    global: {
      stubs: {
        BaseDialog: DialogStub,
        BaseForm: FormStub,
        BaseField: FieldStub,
        BaseTextInput: TextInputStub,
        BaseTextarea: TextareaStub,
        BaseCheckbox: CheckboxStub,
        BaseInlineSelect: InlineSelectStub,
        BaseDialogFooter: FooterStub,
        ProductTypeSelectMenu: SelectMenuStub,
        ProductStatusSelectMenu: SelectMenuStub,
        ProductFamilySelectMenu: SelectMenuStub,
        ItemCategorySelectMenu: SelectMenuStub,
        UomSelectMenu: SelectMenuStub,
        SupplierSelectMenu: SelectMenuStub,
        IconPackage: true,
        IconCheck: true,
        IconX: true,
      },
    },
  })
}

/** Set form state directly; the form object is what onSubmit reads. */
function fill(wrapper, patch) {
  Object.assign(wrapper.vm.form, patch)
}

async function submit(wrapper) {
  await wrapper.findComponent(FormStub).vm.$emit('submit')
  await flushPromises()
}

beforeEach(() => {
  productRows = []
  supplierLinkRows = []
  savedProducts.length = 0
  createdProducts.length = 0
  createdLinks.length = 0
  nextSaveError = null
  toasts.length = 0
  vi.clearAllMocks()
})

describe('the criticality option list mirrors the database CHECK', () => {
  it('offers exactly CRITICAL, MAJOR and MINOR', async () => {
    // products_criticality_chk allows exactly these three plus NULL. Migration
    // 20260907250000's header records that it took the set FROM THIS LIST.
    const w = mountDialog()
    await flushPromises()
    // The Criticality select lives inside the "Additional details" panel, which
    // is collapsed by default — a real user has to open it, and so does this.
    w.vm.showAdvanced = true
    await flushPromises()
    const select = w.findComponent(InlineSelectStub)
    expect(select.props('items').map((o) => o.id)).toEqual(['CRITICAL', 'MAJOR', 'MINOR'])
  })

  it('keeps the field clearable, because the column is nullable with no default', async () => {
    const w = mountDialog()
    await flushPromises()
    // Advanced details are collapsed by default; the select is still rendered
    // once opened, and the props are what matter.
    w.vm.showAdvanced = true
    await flushPromises()
    const select = w.findComponent(InlineSelectStub)
    expect(select.props('clearable')).toBe(true)
  })
})

describe('the create payload', () => {
  it('stamps createdBy and updatedBy from the session — nothing in the database does', async () => {
    const w = mountDialog()
    await flushPromises()
    fill(w, { name: 'Bolt', sku: 'BOLT-1', productTypeId: 'COMPONENT' })
    await submit(w)

    expect(createdProducts).toHaveLength(1)
    expect(createdProducts[0].createdBy).toBe('user-1')
    expect(createdProducts[0].updatedBy).toBe('user-1')
  })

  it('sends NULL, not an empty string, for every optional text column', async () => {
    // erpItemCode is the one that bites: it is under a PARTIAL unique index
    // (WHERE erp_item_code IS NOT NULL), so '' would make the second
    // no-ERP-code item collide with the first.
    const w = mountDialog()
    await flushPromises()
    fill(w, {
      name: 'Bolt',
      sku: 'BOLT-1',
      productTypeId: 'COMPONENT',
      erpItemCode: '   ',
      revision: '  ',
      defaultAql: '',
      countryOfOrigin: '  ',
      storageConditions: '',
      shelfLifeDays: null,
      criticality: null,
    })
    await submit(w)

    const payload = createdProducts[0]
    expect(payload.erpItemCode, 'erp_item_code is under a partial unique index').toBeNull()
    expect(payload.revision).toBeNull()
    expect(payload.defaultAql).toBeNull()
    expect(payload.countryOfOrigin).toBeNull()
    expect(payload.storageConditions).toBeNull()
    expect(payload.shelfLifeDays).toBeNull()
    expect(payload.criticality, 'NULL stays legal — the CHECK allows it').toBeNull()
  })

  it('defaults the status to ACTIVE and every flag to false', async () => {
    const w = mountDialog()
    await flushPromises()
    fill(w, { name: 'Bolt', sku: 'BOLT-1', productTypeId: 'COMPONENT' })
    await submit(w)

    const payload = createdProducts[0]
    expect(payload.statusId).toBe('ACTIVE')
    expect(payload.lotControlled).toBe(false)
    expect(payload.serialControlled).toBe(false)
    expect(payload.inspectionRequired).toBe(false)
    expect(payload.isHazardous).toBe(false)
  })

  it('creates an Item↔Supplier link for each selected supplier', async () => {
    const w = mountDialog()
    await flushPromises()
    fill(w, {
      name: 'Bolt',
      sku: 'BOLT-1',
      productTypeId: 'COMPONENT',
      supplierIds: ['sup-1', 'sup-2'],
    })
    await submit(w)

    expect(createdLinks.map((l) => l.supplierId)).toEqual(['sup-1', 'sup-2'])
    expect(createdLinks.every((l) => l.productId === 'new-product-id')).toBe(true)
  })

  it('closes on success', async () => {
    const w = mountDialog()
    await flushPromises()
    fill(w, { name: 'Bolt', sku: 'BOLT-1', productTypeId: 'COMPONENT' })
    await submit(w)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})

describe('the failure path (and a defect it pins)', () => {
  // `products` has no REST layer, so every save error a user can ever see on
  // this module is a raw GraphQL/Postgres message: a duplicate SKU (23505), a
  // criticality CHECK violation (23514), an RLS refusal. Where that message
  // ends up is therefore the module's entire error-reporting surface, and it is
  // not where the dialog thinks it is.
  it('reports the real cause in the TOAST, not in the dialog', async () => {
    nextSaveError = 'duplicate key value violates unique constraint'
    const w = mountDialog()
    await flushPromises()
    fill(w, { name: 'Bolt', sku: 'BOLT-1', productTypeId: 'COMPONENT' })
    await submit(w)

    // `useLiveMutation` catches everything that is not a ValidationError,
    // toasts `friendlyMutationError(err)` and returns undefined. A duplicate key
    // is rewritten to a human sentence on the way out.
    expect(toasts.at(-1)).toMatchObject({
      type: 'error',
      message: 'That already exists. Please use a different value.',
    })
  })

  it('🔴 the INLINE error is a TypeError, not the cause — createProduct returns undefined', async () => {
    // OBSERVED, not desired. `onSubmit` does:
    //
    //     const newProduct = await createProduct({ ...payload, createdBy, updatedBy })
    //     await saveSuppliers(newProduct.id)
    //
    // and `createProduct` is a `useLiveMutation`, which SWALLOWS the failure and
    // returns undefined. So the very next line throws
    // "Cannot read properties of undefined (reading 'id')", and THAT is what
    // lands in `saveError` and renders under the footer. The user gets two
    // messages: a correct toast and an inline JavaScript error.
    //
    // Pinned rather than fixed here because the fix belongs in the component
    // (guard the undefined return, or let the mutation rethrow), and this file
    // is a test pass. If someone fixes it this test FAILS, which is the point:
    // it stops being true and whoever changed it comes here to say so.
    nextSaveError = 'duplicate key value violates unique constraint'
    const w = mountDialog()
    await flushPromises()
    fill(w, { name: 'Bolt', sku: 'BOLT-1', productTypeId: 'COMPONENT' })
    await submit(w)

    const inline = w.findComponent(FooterStub).props('error')
    expect(inline, 'the inline message is a JS TypeError from the next line').toMatch(
      /Cannot read propert(y|ies).*(of )?undefined/i,
    )
    expect(inline, 'and it does NOT carry the database cause').not.toMatch(/duplicate key/i)
  })

  it('keeps the dialog open and does not leave the footer stuck loading', async () => {
    nextSaveError = 'duplicate key value violates unique constraint'
    const w = mountDialog()
    await flushPromises()
    fill(w, { name: 'Bolt', sku: 'BOLT-1', productTypeId: 'COMPONENT' })
    await submit(w)

    expect(w.emitted('update:modelValue')?.at(-1)).not.toEqual([false])
    expect(w.findComponent(FooterStub).props('loading'), 'not stuck loading').toBe(false)
    expect(
      w.findComponent(FooterStub).props('error'),
      'something is shown inline — see the test above for what',
    ).toBeTruthy()
  })
})

describe('edit mode', () => {
  beforeEach(() => {
    productRows = [
      {
        id: 'p-1',
        name: 'Existing Bolt',
        sku: 'BOLT-EXISTING',
        productTypeId: 'COMPONENT',
        statusId: 'ACTIVE',
        revision: 'A',
        criticality: 'MAJOR',
        productFamilyId: null,
        itemCategoryId: null,
        erpItemCode: null,
        uomId: null,
        description: '',
        lotControlled: false,
        serialControlled: false,
        shelfLifeDays: null,
        inspectionRequired: false,
        defaultAql: null,
        countryOfOrigin: null,
        storageConditions: null,
        isHazardous: false,
        save: vi.fn(async () => {}),
      },
    ]
  })

  it('locks the SKU field — the key every other record refers to the item by', async () => {
    const w = mountDialog({ id: 'p-1' })
    await flushPromises()
    const skuField = w.findAll('[data-field="SKU"]')
    expect(skuField).toHaveLength(1)
    expect(skuField[0].find('input').attributes('disabled')).toBeDefined()
  })

  it('writes updatedBy but never re-stamps createdBy', async () => {
    const w = mountDialog({ id: 'p-1' })
    await flushPromises()
    fill(w, { revision: 'B' })
    await submit(w)

    const row = productRows[0]
    expect(row.save).toHaveBeenCalled()
    expect(row.updatedBy).toBe('user-1')
    expect(row).not.toHaveProperty('createdBy')
  })
})

describe('the SKU availability check is paranoid-blind (P3, pinned as a limitation)', () => {
  it('reports a SKU as available when only a TOMBSTONE holds it', async () => {
    // `db.Product.where().exec()` excludes soft-deleted rows, so this is what
    // the user is told. Until migration 20260907240000 made the unique index
    // partial, the save then failed with a raw 23505 on a field the dialog had
    // just ticked green. The index is the layer that fixed it — the client
    // genuinely cannot see the tombstone — and this test exists so that stays
    // true rather than being "fixed" back into the client.
    productRows = [] // the tombstone is invisible to a paranoid query, by design
    const w = mountDialog()
    await flushPromises()
    fill(w, { sku: 'BOLT-TOMBSTONED' })
    await flushPromises()

    expect(w.vm.skuAvailable, 'the client cannot see tombstones').toBe(true)
  })

  it('does report a collision with a LIVE item', async () => {
    productRows = [{ id: 'p-9', sku: 'BOLT-LIVE', name: 'Live Bolt' }]
    const w = mountDialog()
    await flushPromises()
    fill(w, { sku: 'BOLT-LIVE' })
    await flushPromises()

    expect(w.vm.skuAvailable).toBe(false)
    expect(w.vm.skuUnique()).toMatch(/already in use/i)
  })

  it('does not flag the item against itself in edit mode', async () => {
    productRows = [{ id: 'p-1', sku: 'BOLT-EXISTING', name: 'Existing' }]
    const w = mountDialog({ id: 'p-1' })
    await flushPromises()
    fill(w, { sku: 'BOLT-EXISTING' })
    await flushPromises()
    expect(w.vm.skuAvailable).toBe(true)
  })
})

describe('write-path shape guard', () => {
  // Comments are stripped first, so an explanation of the rule cannot trip the
  // assertion about the rule.
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('writes through the syncEngine and issues no REST call', () => {
    // The mirror image of ProductFamilyCreateDialog's guard, and for the
    // opposite reason: `product_families` has ONLY a REST write path, while
    // `products` has ONLY a GraphQL one. There is no products route to call, so
    // an `@/api` import appearing here would be a call to an endpoint that does
    // not exist — a 404 surfacing as "failed to save item".
    expect(CODE).not.toMatch(/from '@\/api'/)
    expect(CODE).toMatch(/useLiveMutation/)
  })

  it('keeps the criticality list and the CHECK constraint in step', () => {
    // Belt and braces on the first describe block: a future author adding a
    // value would have to touch this string, and the failure message points at
    // the migration.
    const values = [...CODE.matchAll(/id:\s*'([A-Z]+)'/g)].map((m) => m[1])
    expect(
      values,
      'products_criticality_chk (migration 20260907250000) allows exactly these three',
    ).toEqual(['CRITICAL', 'MAJOR', 'MINOR'])
  })
})
