// F-03 — every name permissionSync listens for must be a name something emits.
//
// `PERMISSION_MODELS` began as ['Role', 'RoleOnUser', 'PermissionOnRole',
// 'Permission']. Two of those four model classes had been retired. Nothing
// noticed, because a `syncBus.on(name)` subscription for a name nobody ever
// emits does not throw — it just never fires. Half the list was dead and the
// symptom was silence: an admin changed a role's grants and the affected user's
// browser kept every affordance it had until a hard reload.
//
// That is the whole shape of this module's defects. Not a missing check — a
// check pointing at something that had moved. This test makes the list
// self-verifying: a name is legitimate only if it is a real model, or an
// explicitly declared record-less signal.
import { describe, it, expect, vi } from 'vitest'

// permissionSync imports the app router, which resolves `vue-router/auto-routes`
// — a Vite virtual module that does not exist under vitest. Only the constant is
// under test here, so stub the router and its guard rather than build one.
vi.mock('@/router', () => ({ default: { currentRoute: { value: {} }, replace: vi.fn() } }))
vi.mock('@/router/permissionGuard', () => ({ evaluateRoute: vi.fn(() => true) }))
vi.mock('@/utils/currentSession', () => ({ refreshPermissions: vi.fn() }))

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PERMISSION_MODELS } from './permissionSync.js'
import { SIGNAL_ONLY_TABLES } from '../../syncEngine/sync/socketSubscriber.js'

const signalNames = Object.values(SIGNAL_ONLY_TABLES)

// The model classes cannot be imported here: they use legacy decorators, which
// vite-plugin-babel transforms in the app build but which vitest.config.js
// deliberately does not load. Read the declarations off disk instead — for a
// "does this name exist" check that is not a weaker test, and it stays honest
// if a model is ever declared without being re-exported from index.js.
// `import.meta.url` is not a file: URL under vitest's transform pipeline, so
// resolve from the project root instead — vitest runs with cwd there.
const MODELS_DIR = join(process.cwd(), 'models')

function declaredModelNames() {
  const names = new Set()
  for (const file of readdirSync(MODELS_DIR)) {
    if (!file.endsWith('.js')) continue
    const src = readFileSync(join(MODELS_DIR, file), 'utf8')
    for (const m of src.matchAll(/export\s+class\s+([A-Za-z0-9_]+)\s+extends\s+BaseModel/g)) {
      names.add(m[1])
    }
  }
  return names
}

const MODEL_NAMES = declaredModelNames()

describe('permissionSync — the watch list cannot silently rot', () => {
  it('the model scan itself works — guards against a silently empty allowlist', () => {
    // If this were empty, the test below would pass for every possible input.
    expect(MODEL_NAMES.size).toBeGreaterThan(100)
    expect(MODEL_NAMES.has('Role')).toBe(true)
    expect(MODEL_NAMES.has('RoleOnUser')).toBe(true)
  })

  it('🔴 every watched name is either a real model class or a declared signal', () => {
    const unresolvable = PERMISSION_MODELS.filter(
      (name) => !MODEL_NAMES.has(name) && !signalNames.includes(name),
    )
    expect(
      unresolvable,
      'these names are subscribed to but nothing can ever emit them — a retired ' +
        'model, or a signal missing from SIGNAL_ONLY_TABLES',
    ).toEqual([])
  })

  // Controls — the guard above passes trivially on an empty list, and would
  // pass on a list that had lost the entry each finding turned on.
  it('✅ watches the role row itself (rename, status, lock, soft-delete)', () => {
    expect(PERMISSION_MODELS).toContain('Role')
  })

  it('✅ watches who holds a role', () => {
    expect(PERMISSION_MODELS).toContain('RoleOnUser')
  })

  it('✅ watches the grants themselves — the gap F-03 closed', () => {
    expect(PERMISSION_MODELS).toContain('RoleModulePermission')
  })

  it('the grants entry is a signal, deliberately, and NOT a model', () => {
    // authz.role_module_permissions lives outside PostGraphile's `public`
    // schema, so it has no GraphQL type and can never be fetched into IDB.
    // If someone later adds a model of this name, this test should be revisited
    // rather than deleted — the signal path and a real model would both fire.
    expect(signalNames).toContain('RoleModulePermission')
    expect(MODEL_NAMES.has('RoleModulePermission')).toBe(false)
  })
})

describe('SIGNAL_ONLY_TABLES — keyed on the raw postgres table name', () => {
  it('🔴 keys are raw snake_case postgres names, not camelCase model names', () => {
    // socketSubscriber looks this up with the name straight off the socket
    // payload, BEFORE `toCamelCase`. A camelCase key here would never match and
    // the event would fall through to `if (!meta) return` — the exact silent
    // drop this map exists to prevent.
    for (const key of Object.keys(SIGNAL_ONLY_TABLES)) {
      expect(key, `"${key}" should be snake_case`).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(key).not.toMatch(/[A-Z]/)
    }
  })

  it('carries the grants table', () => {
    expect(SIGNAL_ONLY_TABLES.role_module_permissions).toBe('RoleModulePermission')
  })
})
