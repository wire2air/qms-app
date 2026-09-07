import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Docs/modules/dashboard 2026-09-07 addendum, finding 2: OnboardingDialog used
// to query db.User.where().exec() with NO isAllowed() check at all — the only
// defense was users_sel RLS one layer down. Gated here on
// user_management:read, matching the Users module's own list-page requirement.
let userRows = []
vi.mock('@models/index', () => ({
  db: { User: { where: () => ({ exec: async () => userRows }) } },
}))

const currentSession = { value: { userId: 'me' } }
let grantedPermissions = []
vi.mock('@/utils/currentSession', () => ({
  currentSession,
  isAllowed: (needed) => needed.every((p) => grantedPermissions.includes(p)),
}))

// BaseDialog is HeadlessUI/teleport chrome, not what's under test — stub it
// inline (same approach as ProductFamilyCreateDialog.spec.js). Stub the
// nested create-user dialog too so its own (unrelated) data needs don't leak
// into this file's db mock.
const BaseDialogStub = {
  name: 'BaseDialog',
  props: ['modelValue', 'persistent', 'maxWidth'],
  template: '<div><slot /></div>',
}

const OnboardingDialog = (await import('./OnboardingDialog.vue')).default

function mountDialog() {
  return mount(OnboardingDialog, {
    props: { modelValue: true },
    global: {
      stubs: { BaseDialog: BaseDialogStub, UsersCreateUserDialog: true },
    },
  })
}

const USERS = [
  { id: 'me', firstName: 'Me', lastName: 'Self', email: 'me@co.test', inviteSent: true },
  { id: 'u2', firstName: 'Ann', lastName: 'Other', email: 'ann@co.test', inviteSent: false },
]

describe('OnboardingDialog — gated on user_management:read (finding 2)', () => {
  beforeEach(() => {
    userRows = [...USERS]
    grantedPermissions = []
  })

  it('does NOT query or render the roster when the permission is absent', async () => {
    const w = mountDialog()
    await flushPromises()

    expect(w.text()).not.toContain('ann@co.test')
    expect(w.text()).not.toContain('me@co.test')
    expect(w.text()).toContain("don't have permission")
  })

  it('renders the full roster once user_management:read is held', async () => {
    grantedPermissions = ['user_management:read']
    const w = mountDialog()
    await flushPromises()

    expect(w.text()).toContain('ann@co.test')
    expect(w.text()).toContain('me@co.test')
    expect(w.text()).toContain('Team Members (2)')
  })

  it('"Skip for now" is always available even without the permission', async () => {
    const w = mountDialog()
    await flushPromises()
    expect(w.text()).toContain('Skip for now')
  })
})
