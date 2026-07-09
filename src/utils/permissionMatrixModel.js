// Pure transforms between the API's per-action grants and the UI's per-module
// { scope, caps } model. Kept UI-free so the logic is unit-testable.
//
//   API grant  = { module, action, scope }        (read stored only if sole grant)
//   UI state   = { [moduleId]: { scope, caps } }   (scope = read reach; caps = binary set)

// Grants → UI state. A module's scope is the widest scope across its grants
// (this UI writes one uniform scope per module, so round-trips are stable).
export function projectGrantsToState(modules, grants, scopeRank, readActionId) {
  const state = {}
  for (const m of modules) state[m.id] = { scope: null, caps: {} }

  const byModule = new Map()
  for (const g of grants || []) {
    if (!byModule.has(g.module)) byModule.set(g.module, [])
    byModule.get(g.module).push(g)
  }

  for (const [moduleId, gs] of byModule) {
    if (!state[moduleId]) state[moduleId] = { scope: null, caps: {} }
    let scope = null
    let best = -1
    for (const g of gs) {
      const r = scopeRank[g.scope] ?? 0
      if (r > best) {
        best = r
        scope = g.scope
      }
    }
    state[moduleId].scope = scope
    for (const g of gs) if (g.action !== readActionId) state[moduleId].caps[g.action] = true
  }
  return state
}

// UI state → desired-state grants for PUT. Read is implicit when any capability
// is granted; a module with a scope but no capabilities is a read-only grant.
export function buildDesiredPermissions(modules, state, readActionId) {
  const out = []
  for (const m of modules) {
    const s = state[m.id]
    if (!s || !s.scope) continue // No access → send nothing (server revokes existing)
    const caps = (m.actions || []).filter((a) => a !== readActionId && s.caps[a])
    if (caps.length) {
      for (const a of caps) out.push({ module: m.id, action: a, scope: s.scope })
    } else {
      out.push({ module: m.id, action: readActionId, scope: s.scope })
    }
  }
  return out
}

export function isModuleModified(a, b) {
  if ((a?.scope ?? null) !== (b?.scope ?? null)) return true
  const ak = Object.keys(a?.caps || {}).filter((k) => a.caps[k])
  const bk = Object.keys(b?.caps || {}).filter((k) => b.caps[k])
  if (ak.length !== bk.length) return true
  return ak.some((k) => !b?.caps?.[k])
}

// Clamp a preset's scope to what a module supports (widest available fallback).
export function clampScope(desiredScope, moduleScopes) {
  if (!moduleScopes || !moduleScopes.length) return null
  if (moduleScopes.includes(desiredScope)) return desiredScope
  return moduleScopes[moduleScopes.length - 1]
}
