<script setup>
import {
  IconShieldCheck,
  IconEraser,
  IconChevronRight,
  IconInfoCircle,
  IconCheck,
  IconAdjustmentsHorizontal,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception. The authz
// permission matrix is a decision-plane outcome, not a synced model record.
import { get, put } from '@/api'
import {
  PERMISSION_PRESETS,
  SCOPE_LABELS,
  SCOPE_HINTS,
  NO_ACCESS_LABEL,
  LEVEL_LABELS,
  LEVEL_HINTS,
} from '@/utils/permissionPresets.js'
import {
  projectGrantsToState,
  buildDesiredPermissions,
  isModuleModified,
  writeScopeOptionsFor,
  supportsRead,
  availableLevels,
  levelForState,
  stateForLevel,
} from '@/utils/permissionMatrixModel.js'

const props = defineProps({
  roleId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
  search: { type: String, default: '' },
})

const loading = ref(false)
const saving = ref(false)
const catalog = ref({ sections: [], modules: [], actions: [], scopes: [] })
const state = reactive({}) // moduleId -> { readScope, writeScope, caps: {} }
const original = ref({}) // snapshot for modified detection
const collapsed = reactive({}) // section -> bool
const filterMode = ref('all') // 'all' | 'granted' | 'modified'
const { confirm } = useConfirm()

// Other roles, for "Copy from…" — live from the syncEngine (C3).
const allRoles = useLiveQuery((db) => db.Role.where().exec(), { models: ['Role'], initial: [] })
const sourceRoles = computed(() =>
  (allRoles.value || [])
    .filter((r) => r.id !== props.roleId)
    .map((r) => ({ label: r.name, value: r.id })),
)

const readActionId = computed(() => catalog.value.actions.find((a) => a.isRead)?.id || 'read')
const capabilityColumns = computed(() => catalog.value.actions.filter((a) => !a.isRead))
const scopeRank = computed(() => Object.fromEntries(catalog.value.scopes.map((s) => [s.id, s.rank])))

function scopeOptionsFor(m) {
  return [
    { label: NO_ACCESS_LABEL, value: null },
    ...m.scopes.map((sid) => ({ label: SCOPE_LABELS[sid] || sid, value: sid, description: SCOPE_HINTS[sid] })),
  ]
}
// Write reach can be as wide as read, never wider.
function writeScopeOptions(m) {
  return writeScopeOptionsFor(m.scopes, state[m.id]?.readScope, scopeRank.value).map((sid) => ({
    label: SCOPE_LABELS[sid] || sid,
    value: sid,
    description: SCOPE_HINTS[sid],
  }))
}
// Capabilities a module actually supports (non-read actions), in global display
// order. Drives the per-row chip cell so only real actions render.
function moduleCaps(m) {
  return capabilityColumns.value.filter((a) => m.actions.includes(a.id))
}
function moduleGranted(id) {
  return !!state[id]?.readScope
}
// Modules with no `read` action have no read-only grant to store — access there
// comes only from holding one of their own verbs. An access level with no
// capability selected would save nothing, so surface it instead of discarding it.
function needsCapability(m) {
  if (supportsRead(m, readActionId.value)) return false
  if (!state[m.id]?.readScope) return false
  return !moduleCaps(m).some((a) => state[m.id]?.caps[a.id])
}
const modulesNeedingCapability = computed(() => catalog.value.modules.filter(needsCapability))
// A Can-edit level narrower than read with every capability unchecked stores
// nothing — the selection would silently vanish on save (the revert bug). The
// equal-to-read case is indistinguishable from pristine read-only state, so
// only the narrowed case is detectable; setWriteScope auto-enabling caps keeps
// the equal case from arising through the UI.
function needsWriteCapability(m) {
  const s = state[m.id]
  if (!s?.readScope || !s.writeScope || s.writeScope === s.readScope) return false
  return !moduleCaps(m).some((a) => s.caps[a.id])
}
const modulesNeedingWriteCapability = computed(() =>
  catalog.value.modules.filter(needsWriteCapability),
)
function moduleModified(id) {
  return isModuleModified(state[id], original.value[id])
}

const grantedCount = computed(() => catalog.value.modules.filter((m) => moduleGranted(m.id)).length)
const modifiedCount = computed(() => catalog.value.modules.filter((m) => moduleModified(m.id)).length)

const filterChips = computed(() => [
  { id: 'all', label: 'All', count: catalog.value.modules.length },
  { id: 'granted', label: 'Granted', count: grantedCount.value },
  { id: 'modified', label: 'Modified', count: modifiedCount.value },
])

const groupedModules = computed(() => {
  const q = props.search.trim().toLowerCase()
  const bySection = new Map()
  for (const m of catalog.value.modules) {
    if (q && !m.name.toLowerCase().includes(q)) continue
    if (filterMode.value === 'granted' && !moduleGranted(m.id)) continue
    if (filterMode.value === 'modified' && !moduleModified(m.id)) continue
    if (!bySection.has(m.section)) bySection.set(m.section, [])
    bySection.get(m.section).push(m)
  }
  return catalog.value.sections
    .filter((s) => bySection.has(s))
    .map((s) => ({ name: s, modules: bySection.get(s) }))
})

function sectionGranted(group) {
  return group.modules.filter((m) => moduleGranted(m.id)).length
}

// ── Mutations ───────────────────────────────────────────────────────────────
function ensure(id) {
  if (!state[id]) state[id] = { readScope: null, writeScope: null, caps: {} }
  return state[id]
}
function setReadScope(id, scope) {
  const s = ensure(id)
  s.readScope = scope
  if (!scope) {
    s.writeScope = null
    s.caps = {} // no read reach ⇒ no write, no capabilities
    return
  }
  // Write defaults to the read reach and can never exceed it.
  const cap = scopeRank.value[scope] ?? 0
  if (!s.writeScope || (scopeRank.value[s.writeScope] ?? 0) > cap) s.writeScope = scope
}
function setWriteScope(id, scope) {
  const s = ensure(id)
  if (!s.readScope) return
  const cap = scopeRank.value[s.readScope] ?? 0
  s.writeScope = (scopeRank.value[scope] ?? 0) > cap ? s.readScope : scope
  // A write reach only exists through capability grants — a Can-edit level with
  // no capability selected would save NOTHING (the silent-revert bug). Picking
  // a level is a write-grant gesture, so light up the module's basic CRUD verbs
  // when none are on yet; fall back to all its verbs for solo-verb modules
  // (manage, upload, …). Never touches rows that already carry capabilities.
  const m = catalog.value.modules.find((x) => x.id === id)
  if (!m) return
  if (moduleCaps(m).some((a) => s.caps[a.id])) return
  const dml = moduleCaps(m).filter((a) => ['create', 'update', 'delete'].includes(a.id))
  for (const a of dml.length ? dml : moduleCaps(m)) s.caps[a.id] = true
}
function toggleCap(id, action, val) {
  ensure(id).caps[action] = val
}

// ── Level layer (simple mode) ───────────────────────────────────────────────
// Each row is presented as Level (capability bundle) at Scope (read = write).
// Rows the ladder can't express (split reach, off-bundle caps) read as
// 'custom' and are edited via the per-row Customize expander, which reuses
// the raw controls below.
const expandedRows = reactive({}) // moduleId -> bool
// Reach granted when a level is picked on a No-access row (clamped per module).
const DEFAULT_LEVEL_SCOPE = 'site'

function levelFor(m) {
  return levelForState(m, state[m.id], readActionId.value)
}
function levelOptionsFor(m) {
  const options = availableLevels(m, readActionId.value).map((id) => ({
    label: LEVEL_LABELS[id],
    value: id,
    description: LEVEL_HINTS[id],
  }))
  // Public-read (reference-data) modules: viewing needs no grant — everyone in
  // the company can read them by design (templates, form blocks, lookups the
  // forms depend on). "No access" would be misleading, so the bottom level
  // reads "View only" and the row carries a hint that grants control authoring.
  if (m.publicRead) {
    const none = options.find((o) => o.value === 'none')
    if (none) {
      none.label = 'View only'
      none.description = 'Everyone can view — no authoring'
    }
  }
  // The select must be able to DISPLAY a custom row; picking a concrete level
  // normalizes it, so 'custom' is never offered as a choice.
  if (levelFor(m) === 'custom') {
    options.push({ label: LEVEL_LABELS.custom, value: 'custom', description: LEVEL_HINTS.custom, disabled: true })
  }
  return options
}
function rowScopeOptions(m) {
  return (m.scopes || []).map((sid) => ({
    label: SCOPE_LABELS[sid] || sid,
    value: sid,
    description: SCOPE_HINTS[sid],
  }))
}
function onLevelChange(m, levelId) {
  if (!levelId || levelId === 'custom') return
  const scope = state[m.id]?.readScope || DEFAULT_LEVEL_SCOPE
  state[m.id] = stateForLevel(m, levelId, scope, readActionId.value)
}
function onScopeChange(m, scope) {
  if (!scope) return
  state[m.id] = stateForLevel(m, levelFor(m), scope, readActionId.value)
}

function applyPreset(presetId) {
  const p = PERMISSION_PRESETS.find((x) => x.id === presetId)
  if (!p) return
  for (const m of catalog.value.modules) {
    // stateForLevel clamps the scope and degrades the level per module
    // (manage-only → full-or-none, read-only → viewer), so a preset always
    // lands on a clean, savable row.
    state[m.id] = stateForLevel(m, p.level, p.scope, readActionId.value)
  }
}
function onPreset(presetId) {
  if (presetId) applyPreset(presetId)
}
async function copyFromRole(sourceRoleId) {
  if (!sourceRoleId) return
  if (
    modifiedCount.value &&
    !(await confirm({
      title: 'Copy permissions',
      message:
        'This replaces the unsaved permission changes on this role with the selected role’s permissions. Continue?',
      okLabel: 'Copy',
    }))
  )
    return
  const data = await get(`/v1/services/authz/roles/${sourceRoleId}/permissions`)
  const projected = projectGrantsToState(
    catalog.value.modules,
    data.permissions || [],
    scopeRank.value,
    readActionId.value,
  )
  for (const m of catalog.value.modules) {
    const p = projected[m.id] || {}
    state[m.id] = {
      readScope: p.readScope ?? null,
      writeScope: p.writeScope ?? null,
      caps: { ...(p.caps || {}) },
    }
  }
}
function onCopyFrom(id) {
  if (id) copyFromRole(id)
}
function makeAdmin() {
  applyPreset('administrator')
}
function clearAll() {
  for (const m of catalog.value.modules) setReadScope(m.id, null)
}
function toggleSection(name) {
  collapsed[name] = !collapsed[name]
}
function setAllCollapsed(val) {
  for (const s of catalog.value.sections) collapsed[s] = val
}

// ── Data ────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const cat = await get('/v1/services/authz/catalog', { loader: loading })
    catalog.value = {
      sections: cat.sections || [],
      modules: cat.modules || [],
      actions: cat.actions || [],
      scopes: cat.scopes || [],
    }
    const data = await get(`/v1/services/authz/roles/${props.roleId}/permissions`)
    const projected = projectGrantsToState(
      catalog.value.modules,
      data.permissions || [],
      scopeRank.value,
      readActionId.value,
    )
    for (const k of Object.keys(state)) delete state[k]
    for (const m of catalog.value.modules)
      state[m.id] = projected[m.id] || { readScope: null, writeScope: null, caps: {} }
    original.value = JSON.parse(JSON.stringify(projected))
    for (const s of catalog.value.sections) if (collapsed[s] === undefined) collapsed[s] = false
  } finally {
    loading.value = false
  }
}

// Pre-save validation, exposed separately so the parent page can run it BEFORE
// persisting the role's name/description — a blocked matrix must not half-save.
// Simple mode can't produce these states (stateForLevel always emits bundle
// caps at read = write); they arise only via the Customize controls, so the
// offending rows are auto-expanded to put the blocked controls on screen.
function validate() {
  const unstorable = modulesNeedingCapability.value
  const capless = modulesNeedingWriteCapability.value
  for (const m of [...unstorable, ...capless]) expandedRows[m.id] = true
  if (unstorable.length) {
    throw new Error(
      `${unstorable.map((m) => m.name).join(', ')}: no read-only access is available on ` +
        `${unstorable.length > 1 ? 'these modules' : 'this module'} — select at least one capability, or set Access to “${NO_ACCESS_LABEL}”.`,
    )
  }
  if (capless.length) {
    throw new Error(
      `${capless.map((m) => m.name).join(', ')}: the Can-edit level has no capabilities selected, ` +
        `so it wouldn't be stored — select at least one capability (Create, Update, …).`,
    )
  }
}

async function save() {
  validate()
  saving.value = true
  try {
    const permissions = buildDesiredPermissions(
      catalog.value.modules,
      state,
      readActionId.value,
      scopeRank.value,
    )
    await put(`/v1/services/authz/roles/${props.roleId}/permissions`, { permissions }, { loader: saving })
    await load() // reflect canonical stored state
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  if (props.roleId) load()
})
watch(
  () => props.roleId,
  () => {
    if (props.roleId) load()
  },
)

// hasUnsavedChanges() lets the parent page warn before navigating away.
defineExpose({ save, validate, hasUnsavedChanges: () => modifiedCount.value > 0 })
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Legend -->
    <div class="tw:flex tw:items-start tw:gap-2 tw:text-xs tw:text-secondary">
      <IconInfoCircle :size="15" class="tw:mt-0.5 tw:shrink-0" />
      <span>
        <b>Level</b> is what the role can do in a module — view, edit, approve, or full control.
        <b>Scope</b> is how far that reach extends — from a user's own records to company-wide.
        Use <b>Customize</b> to hand-pick capabilities or give reading a wider reach than editing.
      </span>
    </div>

    <!-- Toolbar -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
      <div class="tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:bg-main tw:p-1">
        <button
          v-for="chip in filterChips"
          :key="chip.id"
          class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-md tw:px-3 tw:py-1 tw:text-sm tw:font-medium tw:border-0 tw:cursor-pointer"
          :class="
            filterMode === chip.id
              ? 'tw:bg-card tw:text-on-sidebar tw:shadow-sm'
              : 'tw:bg-transparent tw:text-secondary'
          "
          @click="filterMode = chip.id"
        >
          {{ chip.label }}
          <span class="tw:text-xs tw:opacity-70">{{ chip.count }}</span>
        </button>
      </div>

      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
        <span
          v-if="modifiedCount"
          class="tw:rounded-full tw:bg-warning-100 tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-warning-700"
        >
          {{ modifiedCount }} unsaved
        </span>
        <div v-if="canUpdate" class="tw:w-44">
          <BaseSelect
            :modelValue="null"
            :options="PERMISSION_PRESETS.map((p) => ({ label: p.name, value: p.id, description: p.description }))"
            placeholder="Apply preset…"
            size="sm"
            dense
            :searchable="false"
            @update:modelValue="onPreset"
          />
        </div>
        <div v-if="canUpdate && sourceRoles.length" class="tw:w-44">
          <BaseSelect
            :modelValue="null"
            :options="sourceRoles"
            placeholder="Copy from role…"
            size="sm"
            dense
            @update:modelValue="onCopyFrom"
          />
        </div>
        <button
          v-if="canUpdate"
          class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-semibold tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
          @click="makeAdmin"
        >
          <IconShieldCheck :size="18" />
          Make Admin
        </button>
        <button
          v-if="canUpdate"
          class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-semibold tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
          @click="clearAll"
        >
          <IconEraser :size="18" />
          Clear all
        </button>
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-secondary">
          <button class="tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline" @click="setAllCollapsed(false)">
            Expand
          </button>
          <span>/</span>
          <button class="tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline" @click="setAllCollapsed(true)">
            Collapse
          </button>
        </div>
      </div>
    </div>

    <!-- Groups -->
    <div
      v-for="group in groupedModules"
      :key="group.name"
      class="tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden"
    >
      <button
        class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:bg-main tw:px-3 tw:py-2 tw:border-0 tw:cursor-pointer tw:text-left"
        :aria-expanded="!collapsed[group.name]"
        @click="toggleSection(group.name)"
      >
        <IconChevronRight
          :size="16"
          class="tw:text-secondary tw:transition-transform"
          :class="collapsed[group.name] ? '' : 'tw:rotate-90'"
        />
        <span class="tw:text-sm tw:font-semibold tw:text-on-sidebar">{{ group.name }}</span>
        <span class="tw:text-xs tw:text-secondary">{{ sectionGranted(group) }} / {{ group.modules.length }}</span>
      </button>

      <div v-show="!collapsed[group.name]" class="tw:overflow-x-auto">
        <table class="tw:w-full tw:text-sm tw:border-collapse">
          <thead class="tw:sticky tw:top-0 tw:bg-card tw:z-10">
            <tr class="tw:text-left tw:text-xs tw:uppercase tw:tracking-wide tw:text-secondary tw:border-b tw:border-divider">
              <th class="tw:p-2 tw:font-medium tw:whitespace-nowrap">Module</th>
              <th class="tw:p-2 tw:font-medium tw:whitespace-nowrap">Level</th>
              <th class="tw:p-2 tw:font-medium tw:whitespace-nowrap">Scope</th>
              <th class="tw:p-2 tw:font-medium tw:w-10"><span class="tw:sr-only">Customize</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="m in group.modules" :key="m.id">
              <tr
                class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
                :class="moduleModified(m.id) ? 'tw:bg-warning-50' : ''"
              >
                <td class="tw:p-2 tw:font-medium tw:text-on-sidebar tw:whitespace-nowrap">
                  <span
                    v-if="moduleModified(m.id)"
                    class="tw:inline-block tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-warning-500 tw:mr-1.5 tw:align-middle"
                    title="Unsaved change"
                  />
                  {{ m.name }}
                  <span
                    v-if="needsCapability(m) || needsWriteCapability(m)"
                    class="tw:inline-block tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-warning-500 tw:ml-1.5 tw:align-middle"
                    title="Needs attention — open Customize"
                  />
                  <span
                    v-if="m.publicRead"
                    class="tw:block tw:text-[11px] tw:font-normal tw:text-secondary"
                  >
                    Viewable by everyone — levels control authoring
                  </span>
                </td>
                <td class="tw:p-2 tw:w-44">
                  <BaseSelect
                    :modelValue="levelFor(m)"
                    :options="levelOptionsFor(m)"
                    optionDescription="description"
                    size="sm"
                    dense
                    :searchable="false"
                    :clearable="false"
                    :disabled="!canUpdate"
                    @update:modelValue="(v) => onLevelChange(m, v)"
                  />
                </td>
                <td class="tw:p-2 tw:w-44">
                  <BaseSelect
                    v-if="levelFor(m) !== 'none'"
                    :modelValue="state[m.id]?.readScope ?? null"
                    :options="rowScopeOptions(m)"
                    optionDescription="description"
                    size="sm"
                    dense
                    :searchable="false"
                    :clearable="false"
                    :disabled="!canUpdate || levelFor(m) === 'custom'"
                    :title="levelFor(m) === 'custom' ? 'Read reach — adjust via Customize' : undefined"
                    @update:modelValue="(v) => onScopeChange(m, v)"
                  />
                  <span v-else class="tw:text-secondary tw:opacity-30">—</span>
                </td>
                <td class="tw:p-2 tw:w-10 tw:text-right">
                  <button
                    type="button"
                    class="tw:inline-flex tw:items-center tw:justify-center tw:rounded-md tw:border-0 tw:bg-transparent tw:p-1 tw:cursor-pointer"
                    :class="expandedRows[m.id] ? 'tw:text-primary' : 'tw:text-secondary tw:hover:text-on-sidebar'"
                    :aria-expanded="!!expandedRows[m.id]"
                    :aria-label="`Customize ${m.name}`"
                    :title="`Customize ${m.name}`"
                    @click="expandedRows[m.id] = !expandedRows[m.id]"
                  >
                    <IconAdjustmentsHorizontal :size="16" />
                  </button>
                </td>
              </tr>
              <tr v-if="expandedRows[m.id]" class="tw:border-t tw:border-divider tw:bg-main">
                <td colspan="4" class="tw:p-3">
                  <div class="tw:flex tw:flex-wrap tw:items-start tw:gap-6">
                    <div class="tw:w-44">
                      <p class="tw:mb-1 tw:text-xs tw:font-medium tw:uppercase tw:tracking-wide tw:text-secondary">
                        Access <span class="tw:normal-case tw:opacity-60">(read)</span>
                      </p>
                      <BaseSelect
                        :modelValue="state[m.id]?.readScope ?? null"
                        :options="scopeOptionsFor(m)"
                        optionDescription="description"
                        size="sm"
                        dense
                        :searchable="false"
                        :disabled="!canUpdate"
                        :placeholder="NO_ACCESS_LABEL"
                        @update:modelValue="(v) => setReadScope(m.id, v)"
                      />
                    </div>
                    <div class="tw:w-44">
                      <p class="tw:mb-1 tw:text-xs tw:font-medium tw:uppercase tw:tracking-wide tw:text-secondary">
                        Can edit <span class="tw:normal-case tw:opacity-60">(write)</span>
                      </p>
                      <BaseSelect
                        v-if="state[m.id]?.readScope"
                        :modelValue="state[m.id]?.writeScope ?? state[m.id]?.readScope"
                        :options="writeScopeOptions(m)"
                        optionDescription="description"
                        size="sm"
                        dense
                        :searchable="false"
                        :clearable="false"
                        :disabled="!canUpdate"
                        @update:modelValue="(v) => setWriteScope(m.id, v)"
                      />
                      <span v-else class="tw:text-sm tw:text-secondary tw:opacity-40">—</span>
                    </div>
                    <div class="tw:min-w-56 tw:flex-1">
                      <p class="tw:mb-1 tw:text-xs tw:font-medium tw:uppercase tw:tracking-wide tw:text-secondary">
                        Capabilities
                      </p>
                      <p v-if="needsCapability(m)" class="tw:mb-1 tw:text-xs tw:text-warning-700">
                        No read-only access — select a capability.
                      </p>
                      <p v-else-if="needsWriteCapability(m)" class="tw:mb-1 tw:text-xs tw:text-warning-700">
                        Can-edit level needs at least one capability to take effect.
                      </p>
                      <div v-if="moduleCaps(m).length" class="tw:flex tw:flex-wrap tw:gap-1.5">
                        <button
                          v-for="a in moduleCaps(m)"
                          :key="a.id"
                          type="button"
                          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-full tw:border tw:px-2.5 tw:py-1 tw:text-xs tw:font-medium tw:transition-colors"
                          :class="[
                            state[m.id]?.caps[a.id]
                              ? 'tw:bg-primary tw:text-white tw:border-primary'
                              : 'tw:bg-transparent tw:text-secondary tw:border-divider',
                            !canUpdate || !state[m.id]?.readScope
                              ? 'tw:opacity-40 tw:cursor-not-allowed'
                              : 'tw:cursor-pointer tw:hover:border-primary',
                          ]"
                          :disabled="!canUpdate || !state[m.id]?.readScope"
                          :aria-pressed="!!state[m.id]?.caps[a.id]"
                          :aria-label="`${a.name} — ${m.name}`"
                          :title="!state[m.id]?.readScope ? 'Set an access level first' : `${a.name} ${m.name}`"
                          @click="toggleCap(m.id, a.id, !state[m.id]?.caps[a.id])"
                        >
                          <IconCheck v-if="state[m.id]?.caps[a.id]" :size="13" class="tw:shrink-0" />
                          {{ a.name }}
                        </button>
                      </div>
                      <span v-else class="tw:text-sm tw:text-secondary tw:opacity-40">—</span>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="!loading && !groupedModules.length"
      class="tw:rounded-lg tw:border tw:border-dashed tw:border-divider tw:p-8 tw:text-center tw:text-sm tw:text-secondary"
    >
      No modules match the current filter.
    </div>
  </div>
</template>
