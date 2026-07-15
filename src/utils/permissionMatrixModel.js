// Pure transforms between the API's per-action grants and the UI's per-module
// model. Kept UI-free so the logic is unit-testable.
//
//   API grant  = { module, action, scope }
//   UI state   = { [moduleId]: { readScope, writeScope, caps } }
//
// Model: a module has a READ reach (how many records the role can see) and a
// WRITE reach (how far its capabilities — create/update/approve/… — apply).
// Write can be narrower than read (e.g. read = Site, approve = Own) but never
// wider (you can't act on records you can't see). The engine derives a user's
// read reach as the widest granted scope, so we only store an explicit read row
// when read is strictly wider than the writes (otherwise read is implied).

// Rank of a scope, higher = wider. Falls back to 0 for unknown.
function rank(scopeRank, scope) {
  return scopeRank?.[scope] ?? 0
}

// Grants → UI state. readScope = explicit read grant, else the widest capability
// scope (implied read). writeScope = the widest capability scope (or readScope
// when read-only). Divergent per-action scopes (possible via API) collapse to
// their widest for this uniform-write UI.
export function projectGrantsToState(modules, grants, scopeRank, readActionId) {
  const state = {}
  for (const m of modules) state[m.id] = { readScope: null, writeScope: null, caps: {} }

  const byModule = new Map()
  for (const g of grants || []) {
    if (!byModule.has(g.module)) byModule.set(g.module, [])
    byModule.get(g.module).push(g)
  }

  for (const [moduleId, gs] of byModule) {
    if (!state[moduleId]) state[moduleId] = { readScope: null, writeScope: null, caps: {} }
    let explicitRead = null
    let widestWrite = null
    for (const g of gs) {
      if (g.action === readActionId) {
        explicitRead = g.scope
      } else {
        state[moduleId].caps[g.action] = true
        if (widestWrite === null || rank(scopeRank, g.scope) > rank(scopeRank, widestWrite)) {
          widestWrite = g.scope
        }
      }
    }
    const readScope =
      explicitRead && rank(scopeRank, explicitRead) >= rank(scopeRank, widestWrite)
        ? explicitRead
        : widestWrite || explicitRead
    state[moduleId].readScope = readScope
    state[moduleId].writeScope = widestWrite || readScope
  }
  return state
}

// Does this module carry a real read action? 17 of 62 don't — they gate reads on
// their own verb (`manage`, `write`, `upload`, …), so `<module>:read` is not
// grantable and the engine rejects it. Read is still IMPLIED there by holding
// any of the module's actions.
export function supportsRead(m, readActionId) {
  return (m.actions || []).includes(readActionId)
}

// UI state → desired-state grants for PUT. Each granted capability is written at
// writeScope; read is written explicitly only when strictly wider than the
// writes (else implied), or as a read-only grant when no capability is set.
// Never emits an action the module doesn't subscribe to — the engine RAISEs on
// those, which surfaces as a bare 500.
export function buildDesiredPermissions(modules, state, readActionId, scopeRank) {
  const out = []
  for (const m of modules) {
    const s = state[m.id]
    if (!s || !s.readScope) continue // No access → send nothing (server revokes existing)

    // Write can never exceed read.
    let writeScope = s.writeScope || s.readScope
    if (rank(scopeRank, writeScope) > rank(scopeRank, s.readScope)) writeScope = s.readScope

    const caps = (m.actions || []).filter((a) => a !== readActionId && s.caps[a])
    for (const a of caps) out.push({ module: m.id, action: a, scope: writeScope })

    if (!supportsRead(m, readActionId)) continue // read isn't grantable here

    // Store read explicitly only when it reaches wider than the writes; with no
    // capability at all, the read row IS the grant.
    if (!caps.length || rank(scopeRank, s.readScope) > rank(scopeRank, writeScope)) {
      out.push({ module: m.id, action: readActionId, scope: s.readScope })
    }
  }
  return out
}

export function isModuleModified(a, b) {
  if ((a?.readScope ?? null) !== (b?.readScope ?? null)) return true
  if ((a?.writeScope ?? null) !== (b?.writeScope ?? null)) return true
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

// The write-scope options a module offers given its current read reach: the
// module's supported scopes, never wider than readScope.
export function writeScopeOptionsFor(moduleScopes, readScope, scopeRank) {
  if (!readScope) return []
  const cap = rank(scopeRank, readScope)
  return (moduleScopes || []).filter((s) => rank(scopeRank, s) <= cap)
}
