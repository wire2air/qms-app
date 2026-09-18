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

// ─── Level model ─────────────────────────────────────────────────────────────
// The simple-mode layer over the raw state: each module row is presented as a
// LEVEL (what the role can do — a capability bundle) at a SCOPE (how far that
// reach extends, read = write). 'custom' is a DERIVED display state for rows
// the ladder can't express (split read/write reach, off-bundle capability
// sets) — it is never picked into; editing those rows happens in the
// Customize expander with the raw controls.

// Ascending capability ladder. 'custom' is derived, not a member.
export const LEVEL_IDS = ['none', 'viewer', 'editor', 'approver', 'full']

// Editor deliberately excludes delete (mirrors the old Contributor preset);
// delete arrives only at Full control.
const EDITOR_CAPS = ['create', 'update', 'export']
const APPROVER_CAPS = [...EDITOR_CAPS, 'approve', 'reject']

// The exact capability set (sorted) a level grants on module `m`, intersected
// with what the module actually subscribes to. 'full' = every non-read action.
export function levelBundle(levelId, m, readActionId) {
  const actions = m.actions || []
  if (levelId === 'none' || levelId === 'viewer') return []
  if (levelId === 'editor') return EDITOR_CAPS.filter((a) => actions.includes(a)).sort()
  if (levelId === 'approver') return APPROVER_CAPS.filter((a) => actions.includes(a)).sort()
  if (levelId === 'full') return actions.filter((a) => a !== readActionId).sort()
  return []
}

// Levels the module can offer: 'none' plus every achievable ladder level,
// deduped — a level whose bundle equals an already-offered LOWER level's
// bundle adds nothing and is dropped (e.g. 'full' collapses into 'editor' on
// a create/update/export module). 'viewer' needs a grantable read action;
// 'approver' needs approve; 'editor'/'full' need a non-empty bundle. A
// manage-only module therefore offers just ['none', 'full'].
export function availableLevels(m, readActionId) {
  const offered = ['none']
  const seenBundles = []
  for (const id of LEVEL_IDS) {
    if (id === 'none') continue
    if (id === 'viewer') {
      if (supportsRead(m, readActionId)) offered.push('viewer')
      continue
    }
    if (id === 'approver' && !(m.actions || []).includes('approve')) continue
    const bundle = levelBundle(id, m, readActionId)
    if (!bundle.length) continue
    const key = bundle.join('|')
    if (seenBundles.includes(key)) continue
    seenBundles.push(key)
    offered.push(id)
  }
  return offered
}

// UI row state → level id or 'custom'. 'none' when no access; 'custom' when
// the write reach differs from read (split reach) or the enabled capabilities
// match no offered bundle. Otherwise the first exact bundle match walking the
// ladder ascending — consistent with the dedupe in availableLevels, so a
// picked level always re-derives as itself.
export function levelForState(m, state, readActionId) {
  if (!state?.readScope) return 'none'
  const write = state.writeScope || state.readScope
  if (write !== state.readScope) return 'custom'
  const caps = (m.actions || []).filter((a) => a !== readActionId && state.caps?.[a]).sort()
  const key = caps.join('|')
  for (const id of availableLevels(m, readActionId)) {
    if (id === 'none') continue
    if (levelBundle(id, m, readActionId).join('|') === key) {
      // Empty caps match 'viewer' — but only a module with a grantable read
      // action can store a read-only row; elsewhere the state is unstorable
      // (the needsCapability transient) and reads as custom.
      if (id === 'viewer' && !supportsRead(m, readActionId)) return 'custom'
      return id
    }
  }
  return 'custom'
}

// level + scope → full row state (read = write = scope, caps = the bundle).
// Degrades gracefully so presets can sweep all modules: an empty-bundle
// action level falls to 'viewer' where read is grantable and 'none' where it
// isn't; 'viewer' without a read action falls to 'none'.
export function stateForLevel(m, levelId, scope, readActionId) {
  let level = levelId
  if (level !== 'none') {
    if (level === 'viewer') {
      if (!supportsRead(m, readActionId)) level = 'none'
    } else if (!levelBundle(level, m, readActionId).length) {
      level = supportsRead(m, readActionId) ? 'viewer' : 'none'
    }
  }
  if (level === 'none') return { readScope: null, writeScope: null, caps: {} }
  const clamped = clampScope(scope, m.scopes)
  if (!clamped) return { readScope: null, writeScope: null, caps: {} }
  const caps = {}
  for (const a of levelBundle(level, m, readActionId)) caps[a] = true
  return { readScope: clamped, writeScope: clamped, caps }
}
