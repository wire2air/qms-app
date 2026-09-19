import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'

/**
 * /profile → Personal Profile tab. Everything on it is the signed-in user's own
 * `users` row, edited inline and autosaved through the syncEngine
 * (`useAutoSave` → `user.save()` → GraphQL updateUser, where the
 * users_security_field_guard trigger decides which columns a member may touch
 * — pinned end to end by e2e/users/j1-self-escalation-guard.spec.js).
 *
 * Pinned here: the email (the login identifier) is shown but never offered as
 * a field; an edit autosaves after the debounce; a refused save is surfaced;
 * suppliers get free-text job titles instead of the internal title lookup.
 */

vi.mock('@models/index', () => ({ db: {} }))

const h = vi.hoisted(() => ({ user: null, toast: null }))
vi.mock('@/composables/useLiveQuery.js', async () => {
  const { ref } = await import('vue')
  h.user = ref(undefined)
  return { useLiveQueryWithDeps: () => h.user, useLiveQuery: () => ref([]), useLiveMutation: (fn) => fn }
})
vi.mock('@/utils/currentSession.js', async () => {
  const { ref } = await import('vue')
  return { currentSession: ref({ userId: 'u1' }), isAllowed: () => true }
})
vi.mock('@/utils/uploadService.js', () => ({ uploadFile: vi.fn() }))
vi.mock('@shared/composables/useToast.js', () => {
  h.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), notify: vi.fn() }
  return { useToast: () => h.toast }
})

const PersonalProfile = (await import('./PersonalProfile.vue')).default

const stubs = {
  ThemeToggle: true,
  EmployeeTitleSelectMenu: { template: '<div class="stub-title-menu" />' },
  LanguageSelectMenu: true,
  TimezoneDropdown: true,
  UserAvatar: true,
  ImageCropDialog: true,
  BaseColorPicker: true,
}

function makeUser(overrides = {}, save = vi.fn(async () => {})) {
  return reactive({
    id: 'u1',
    firstName: 'Pat',
    lastName: 'SelfService',
    email: 'selfservice@e2e.test',
    jobTitle: 'Self-Service Persona',
    kind: 'INTERNAL',
    color: '#7c3aed',
    save,
    ...overrides,
  })
}

// Every mount shares the one mocked live-query ref; unmount between tests so an
// earlier component cannot autosave into the next test's user.
const mounted = []

async function mountWith(user) {
  const w = mount(PersonalProfile, { global: { stubs } })
  mounted.push(w)
  h.user.value = user // land after mount, as the live query does
  await nextTick()
  await flushPromises()
  return w
}

function inputByLabel(w, text) {
  const label = w.findAll('label').find((l) => l.text().trim() === text)
  if (!label) throw new Error(`no <label> "${text}"`)
  return w.find(`[id="${label.attributes('for')}"]`)
}

beforeEach(() => {
  h.user.value = undefined
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.useRealTimers()
})

describe('PersonalProfile', () => {
  it('shows the email as read-only text — never as an editable field', async () => {
    const w = await mountWith(makeUser())
    expect(w.text()).toContain('selfservice@e2e.test')
    const inputs = w.findAll('input').map((i) => i.element.value)
    expect(inputs).not.toContain('selfservice@e2e.test')
    expect(w.text()).toContain('Contact an administrator to change the email you sign in with.')
  })

  it('autosaves a name edit once, after the debounce', async () => {
    vi.useFakeTimers()
    const user = makeUser()
    const w = await mountWith(user)
    await inputByLabel(w, 'First name').setValue('Patricia')
    expect(user.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)
    expect(user.save).toHaveBeenCalledTimes(1)
    expect(user.firstName).toBe('Patricia')
  })

  it('surfaces a refused save to the user', async () => {
    vi.useFakeTimers()
    const user = makeUser({}, vi.fn(async () => Promise.reject(new Error('permission denied for column is_owner'))))
    const w = await mountWith(user)
    await inputByLabel(w, 'Last name').setValue('Changed')
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()
    expect(w.text()).toContain('permission denied for column is_owner')
  })

  it('offers internal staff the title lookup, and suppliers free text', async () => {
    const internal = await mountWith(makeUser({ kind: 'INTERNAL' }))
    expect(internal.find('.stub-title-menu').exists()).toBe(true)

    h.user.value = undefined
    const supplier = await mountWith(makeUser({ kind: 'EXTERNAL_SUPPLIER' }))
    expect(supplier.find('.stub-title-menu').exists()).toBe(false)
    expect(supplier.findAll('input').some((i) => i.element.value === 'Self-Service Persona')).toBe(true)
  })
})
