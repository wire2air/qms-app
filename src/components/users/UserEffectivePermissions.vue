<script setup>
// Effective-permission viewer — "why does this user have permission X?".
// Shows the user's resolved access WITH PROVENANCE (which role grants each
// module/action and at what scope). Owners bypass roles entirely. Derived,
// cross-cutting data (not a synced model) → action-RPC read, per CLAUDE.md #4.
import { IconCrown, IconShieldCheck } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get } from '@/api'
import { SCOPE_LABELS } from '@/utils/permissionPresets.js'

const props = defineProps({
  userId: { type: String, required: true },
})

const data = ref(null)
const loading = ref(true)

function humanize(id) {
  return String(id || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Group grants by module → actions (each with its scope + source role). Read is
// implied by any grant, so we annotate rather than expecting stored read rows.
const modules = computed(() => {
  const grants = data.value?.grants || []
  const byModule = new Map()
  for (const g of grants) {
    if (!byModule.has(g.module)) byModule.set(g.module, [])
    byModule.get(g.module).push(g)
  }
  return [...byModule.entries()]
    .map(([module, acts]) => ({
      module,
      label: humanize(module),
      actions: acts.sort((a, b) => a.action.localeCompare(b.action)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

async function load() {
  loading.value = true
  try {
    data.value = await get(`/v1/services/authz/users/${props.userId}/effective`, { loader: false })
  } finally {
    loading.value = false
  }
}

watch(() => props.userId, load, { immediate: true })
</script>

<template>
  <div>
    <div v-if="loading" class="tw:py-3 tw:flex tw:justify-center">
      <BaseSpinner size="sm" />
    </div>

    <!-- Owner: bypasses all roles -->
    <div
      v-else-if="data?.isOwner"
      class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:bg-amber-50 tw:p-3 tw:text-sm tw:text-amber-800"
    >
      <IconCrown :size="18" class="tw:mt-0.5 tw:flex-none" />
      <span><strong>Owner</strong> — full access to everything. Ownership bypasses roles and
        permissions entirely.</span>
    </div>

    <div v-else-if="modules.length === 0" class="tw:text-sm tw:text-secondary tw:py-2">
      No effective permissions. Assign a role to grant access.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-3">
      <p class="tw:text-xs tw:text-secondary">
        Resolved from assigned roles and roles inherited via teams. <em>Read</em> is implied by any
        grant on a module.
      </p>
      <div
        v-for="m in modules"
        :key="m.module"
        class="tw:rounded-lg tw:border tw:border-divider tw:p-3"
      >
        <div class="tw:flex tw:items-center tw:gap-2 tw:mb-2">
          <IconShieldCheck :size="15" class="tw:text-primary" />
          <span class="tw:font-semibold tw:text-sm tw:text-on-main">{{ m.label }}</span>
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <div
            v-for="(a, i) in m.actions"
            :key="i"
            class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:text-xs"
          >
            <span class="tw:font-medium tw:text-on-main">
              {{ humanize(a.action) }}
              <span class="tw:text-secondary">· {{ SCOPE_LABELS[a.scope] || a.scope }}</span>
            </span>
            <span
              class="tw:text-secondary tw:truncate"
              :title="
                a.sourceType === 'team'
                  ? `via role ${a.roleName} (Team ${a.viaTeam})`
                  : `via role ${a.roleName}`
              "
            >
              via {{ a.roleName }}
              <span v-if="a.sourceType === 'team'" class="tw:text-primary">· Team {{ a.viaTeam }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
