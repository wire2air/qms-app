import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
// The three components' own source text. Two of these assertions are
// source-level on purpose — see the "F-16 regression guard" block.
import FAMILY_SOURCE from '../menus/ProductFamilySelectMenu.vue?raw'
import CATEGORY_SOURCE from '../menus/ItemCategorySelectMenu.vue?raw'
import UOM_SOURCE from '../menus/UomSelectMenu.vue?raw'

/**
 * The three inline "quick-add" gates inside the Item Master dialog.
 *
 * ── THE DEFECT (F-16 / Products finding #2), fixed 2026-09-07 ──────────────
 * All three call sites read
 *
 *     isAllowed(['company_settings:manage', 'owner'])
 *
 * and `isAllowed` ANDs its list — `neededPermissions.every(p =>
 * userPermissions.includes(p))`. `'owner'` is not a `module:action` pair, so it
 * is never in the session's permission strings and the expression could never
 * be true for anyone except through the `isOwner` short-circuit one line above
 * it. The author meant OR. The effect was that a documented capability
 * (`company_settings:manage`) was owner-only in practice, on the exact
 * affordance its holders needed — while all three REST routes
 * (/v1/services/{productFamilies,itemCategories,uoms}) admit that grant alone.
 *
 * The bug is invisible to every other kind of test. It is not a typo, it
 * type-checks, it reads like a permissive check, and a persona test written with
 * an owner (the obvious admin persona to reach for) passes.
 *
 * ── WHY THREE CALL SITES AND NOT ONE ──────────────────────────────────────
 * They live in three separate components, so a fix applied to one proves nothing
 * about the other two — which is precisely how the defect survived: the
 * `ProductFamilySelectMenu` half is the one everybody looks at, because it is the
 * one attached to the dialog's most-used field.
 *
 * Each is asserted three ways: a NON-OWNER settings admin sees the control, a
 * non-owner WITHOUT the grant does not (the negative that makes the first mean
 * something), and an owner-with-no-grants does — because the `isOwner`
 * short-circuit is the other half of the rule and a "fix" that dropped it would
 * lock owners out of their own tenant's lookups.
 */

// ── The gate, mocked to the REAL isAllowed semantics ────────────────────────
// Reimplemented rather than stubbed to a boolean, because the whole defect was
// about HOW the list is combined. A mock that answered `true` for any list would
// have passed against the broken code.
let session = { isOwner: false }
let grants = []
const isAllowedCalls = []

vi.mock('@/utils/currentSession.js', () => ({
  currentSession: { get value() { return session } },
  isAllowed: (needed) => {
    isAllowedCalls.push(needed)
    if (!session) return false
    if (session.isOwner) return true
    return needed.every((p) => grants.includes(p))
  },
}))

vi.mock('@/api', () => ({ post: vi.fn(async () => ({})) }))

vi.mock('@models/index', () => ({
  db: {
    ProductFamily: { where: () => ({ orderBy: () => ({ exec: async () => [] }) }) },
    ItemCategory: { where: () => ({ orderBy: () => ({ exec: async () => [] }) }) },
    Uom: { where: () => ({ orderBy: () => ({ exec: async () => [] }) }) },
  },
}))

vi.mock('@shared/composables/useToast.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), notify: vi.fn() }),
}))

const ProductFamilySelectMenu = (await import('../menus/ProductFamilySelectMenu.vue')).default
const ItemCategorySelectMenu = (await import('../menus/ItemCategorySelectMenu.vue')).default
const UomSelectMenu = (await import('../menus/UomSelectMenu.vue')).default

// BaseSelect renders its #footer slot inside a popover that only mounts when
// open. The stub renders it unconditionally so the gate — `v-if="canCreate"` on
// the slot — is what decides whether the button exists, which is the thing under
// test rather than the popover machinery.
const SelectStub = {
  name: 'BaseSelect',
  props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'required', 'multiple', 'clearable', 'nullLabel', 'placeholder'],
  template: '<div class="select"><slot name="footer" :close="() => {}" /></div>',
}
const InertStub = { template: '<div><slot /></div>' }

const STUBS = {
  BaseSelect: SelectStub,
  BaseDialog: InertStub,
  BaseDialogFooter: InertStub,
  BaseTextInput: InertStub,
  BaseText: InertStub,
  ProductFamilyBadgeById: InertStub,
  ProductFamilyCreateDialog: InertStub,
  IconPlus: true,
}

const CASES = [
  { label: 'Item Group', component: () => ProductFamilySelectMenu, button: 'Add New Group' },
  { label: 'Item Category', component: () => ItemCategorySelectMenu, button: 'Add New Category' },
  { label: 'Unit of Measure', component: () => UomSelectMenu, button: 'Add New Unit' },
]

async function mountMenu(component, props = {}) {
  const w = mount(component, { props, global: { stubs: STUBS } })
  await flushPromises()
  return w
}

function quickAddButton(wrapper, label) {
  return wrapper.findAll('button').filter((b) => b.text().includes(label))
}

beforeEach(() => {
  session = { isOwner: false }
  grants = []
  isAllowedCalls.length = 0
})

describe.each(CASES)('$label quick-add', ({ component, button }) => {
  it('is offered to a NON-OWNER holding company_settings:manage', async () => {
    // The case F-16 broke. Before the fix, `.every()` over
    // ['company_settings:manage', 'owner'] was false for this exact session.
    grants = ['company_settings:manage']
    const w = await mountMenu(component())
    expect(quickAddButton(w, button)).toHaveLength(1)
  })

  it('asks for company_settings:manage ALONE — no stray token', async () => {
    // The assertion that would have caught the original bug on the day it was
    // written. The outcome above can be produced by a broken check plus a
    // permissive mock; the ARGUMENT cannot.
    grants = ['company_settings:manage']
    await mountMenu(component())
    expect(
      isAllowedCalls,
      "'owner' is not a module:action pair and can never appear in the session's permission strings",
    ).toContainEqual(['company_settings:manage'])
    expect(isAllowedCalls.flat()).not.toContain('owner')
  })

  it('is NOT offered to a non-owner without the grant', async () => {
    // The negative that makes the positive mean something: without it, "visible"
    // is equally consistent with the gate having been deleted.
    grants = ['products:create', 'products:update']
    const w = await mountMenu(component())
    expect(quickAddButton(w, button)).toHaveLength(0)
  })

  it('is offered to the company owner holding no grants at all', async () => {
    // The other half of the rule. `isAllowed` short-circuits on isOwner, and a
    // "fix" that dropped that would lock owners out of their own lookups.
    session = { isOwner: true }
    grants = []
    const w = await mountMenu(component())
    expect(quickAddButton(w, button)).toHaveLength(1)
  })

  it('respects allowCreate=false even for a settings admin', async () => {
    // The prop exists so a consumer can render a read-only picker; the gate is
    // `allowCreate && isAllowed(...)`, and dropping the first half would put an
    // authoring control into every read-only embed of these menus.
    grants = ['company_settings:manage']
    const w = await mountMenu(component(), { allowCreate: false })
    expect(quickAddButton(w, button)).toHaveLength(0)
  })
})

describe('F-16 regression guard (source-level, on purpose)', () => {
  // A behavioural test cannot distinguish "the list has one element" from "the
  // list has two and the mock happened to satisfy both". The literal is the
  // rule, so the literal is what is asserted — and comments are stripped first
  // so each component's own explanation of the fix cannot trip it.
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it.each([
    ['ProductFamilySelectMenu', FAMILY_SOURCE],
    ['ItemCategorySelectMenu', CATEGORY_SOURCE],
    ['UomSelectMenu', UOM_SOURCE],
  ])('%s no longer ANDs a bare "owner" token into the check', (_name, source) => {
    const code = strip(source)
    expect(code).not.toMatch(/isAllowed\(\[[^\]]*'owner'/)
    expect(code).toMatch(/isAllowed\(\['company_settings:manage'\]\)/)
  })

  it('the same broken shape does not exist anywhere in these three files', () => {
    // The pack asked for an app-wide grep of the `['<perm>', 'owner']` pattern.
    // This is the products-owned slice of that: any list whose members are not
    // all module:action pairs is the same bug wearing a different permission.
    for (const source of [FAMILY_SOURCE, CATEGORY_SOURCE, UOM_SOURCE]) {
      const lists = [...strip(source).matchAll(/isAllowed\(\[([^\]]*)\]\)/g)].map((m) => m[1])
      for (const list of lists) {
        const tokens = list.split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
        for (const token of tokens) {
          expect(token, `"${token}" is not a module:action pair — isAllowed ANDs the list`).toMatch(
            /^[a-z_]+:[a-z_]+$/,
          )
        }
      }
    }
  })
})
