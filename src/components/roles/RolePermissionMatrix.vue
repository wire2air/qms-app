<script setup>
import { IconShieldCheck, IconEraser, IconChevronRight, IconInfoCircle } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception. The authz
// permission matrix is a decision-plane outcome, not a synced model record.
import { get, put } from '@/api'
import { PERMISSION_PRESETS, SCOPE_LABELS, SCOPE_HINTS, NO_ACCESS_LABEL } from '@/utils/permissionPresets.js'
import {
  projectGrantsToState,
  buildDesiredPermissions,
  isModuleModified,
  clampScope,
  writeScopeOptionsFor,
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
const sourceRoles = ref([]) // other roles, for "Copy from…"
const { confirm } = useConfirm()

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
function supportsCap(m, actionId) {
  return m.actions.includes(actionId)
}
function moduleGranted(id) {
  return !!state[id]?.readScope
}
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
}
function toggleCap(id, action, val) {
  ensure(id).caps[action] = val
}
function applyPreset(presetId) {
  const p = PERMISSION_PRESETS.find((x) => x.id === presetId)
  if (!p) return
  for (const m of catalog.value.modules) {
    setReadScope(m.id, clampScope(p.scope, m.scopes))
    // Preset writeScope defaults to its read scope (uniform), clamped per module.
    setWriteScope(m.id, clampScope(p.writeScope || p.scope, m.scopes))
    const caps = {}
    for (const c of p.caps) if (m.actions.includes(c)) caps[c] = true
    state[m.id].caps = caps
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
    try {
      const rolesResp = await get('/v1/services/roles')
      sourceRoles.value = (rolesResp.roles || [])
        .filter((r) => r.id !== props.roleId)
        .map((r) => ({ label: r.name, value: r.id }))
    } catch {
      sourceRoles.value = []
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

async function save() {
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

defineExpose({ save })
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Legend -->
    <div class="tw:flex tw:items-start tw:gap-2 tw:text-xs tw:text-secondary">
      <IconInfoCircle :size="15" class="tw:mt-0.5 tw:shrink-0" />
      <span>
        <b>Access</b> sets how many records the role can read. <b>Can edit</b> sets how far its
        capabilities reach — it can be narrower than read (e.g. read a whole Site but only approve
        your Own), never wider. A capability needs an access level first.
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
              <th class="tw:p-2 tw:font-medium tw:whitespace-nowrap">Access <span class="tw:normal-case tw:opacity-60">(read)</span></th>
              <th class="tw:p-2 tw:font-medium tw:whitespace-nowrap">Can edit <span class="tw:normal-case tw:opacity-60">(write)</span></th>
              <th
                v-for="a in capabilityColumns"
                :key="a.id"
                class="tw:p-2 tw:font-medium tw:text-center tw:whitespace-nowrap"
              >
                {{ a.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in group.modules"
              :key="m.id"
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
              </td>
              <td class="tw:p-2 tw:w-40">
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
              </td>
              <td class="tw:p-2 tw:w-40">
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
                <span v-else class="tw:text-secondary tw:opacity-30">—</span>
              </td>
              <td v-for="a in capabilityColumns" :key="a.id" class="tw:p-2 tw:text-center">
                <div v-if="supportsCap(m, a.id)" class="tw:flex tw:justify-center">
                  <BaseCheckbox
                    :modelValue="!!state[m.id]?.caps[a.id]"
                    :disabled="!canUpdate || !state[m.id]?.readScope"
                    :aria-label="`${a.name} — ${m.name}`"
                    :title="!state[m.id]?.readScope ? 'Set an access level first' : `${a.name} ${m.name}`"
                    @update:modelValue="(v) => toggleCap(m.id, a.id, v)"
                  />
                </div>
                <span v-else class="tw:text-secondary tw:opacity-30">—</span>
              </td>
            </tr>
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
