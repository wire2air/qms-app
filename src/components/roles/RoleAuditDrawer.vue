<script setup>
// Unified access-audit for a role (M5) — permission-matrix changes AND role→user
// membership changes in one time-ordered feed, so an access review doesn't have
// to correlate two logs. Derived cross-cutting data → action-RPC read (#4).
import { IconShieldCheck, IconUserPlus, IconUserMinus, IconHistory } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get } from '@/api'
import { SCOPE_LABELS } from '@/utils/permissionPresets.js'

const props = defineProps({
  roleId: { type: String, default: null },
})
const open = defineModel({ type: Boolean, default: false })

const events = ref([])
const loading = ref(false)

function scope(s) {
  return SCOPE_LABELS[s] || s || '—'
}
function humanize(id) {
  return String(id || '').replace(/_/g, ' ')
}

// One-line description per event.
function describe(e) {
  if (e.kind === 'membership') {
    const who = e.detail.targetUser || 'a user'
    if (e.event === 'REMOVED') return `Removed from ${who}`
    if (e.event === 'RESTORED') return `Re-assigned to ${who}`
    return `Assigned to ${who}`
  }
  const m = humanize(e.detail.module)
  const a = humanize(e.detail.action)
  switch (e.event) {
    case 'GRANT':
      return `Granted ${m} · ${a} (${scope(e.detail.newScope)})`
    case 'REVOKE':
      return `Revoked ${m} · ${a}`
    case 'SET_SCOPE':
      return `${m} · ${a} scope: ${scope(e.detail.oldScope)} → ${scope(e.detail.newScope)}`
    case 'MAKE_ADMIN':
      return 'Granted full admin (all permissions)'
    default:
      return `${e.event} ${m} · ${a}`
  }
}

function iconFor(e) {
  if (e.kind === 'membership') return e.event === 'REMOVED' ? IconUserMinus : IconUserPlus
  return IconShieldCheck
}

async function load() {
  if (!props.roleId) return
  loading.value = true
  try {
    const data = await get(`/v1/services/authz/roles/${props.roleId}/audit`, { loader: false })
    events.value = data?.events || []
  } finally {
    loading.value = false
  }
}

watch(open, (v) => {
  if (v) load()
})
</script>

<template>
  <BaseDrawer v-model="open" title="Access history" size="md">
    <div v-if="loading" class="tw:flex tw:justify-center tw:py-10">
      <BaseSpinner />
    </div>

    <BaseEmptyState
      v-else-if="events.length === 0"
      :icon="IconHistory"
      title="No access changes yet"
      description="Permission and membership changes to this role will appear here."
    />

    <div v-else class="tw:flex tw:flex-col tw:gap-1 tw:p-1">
      <div
        v-for="(e, i) in events"
        :key="i"
        class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:p-2.5 tw:hover:bg-main-hover"
      >
        <div
          class="tw:flex tw:items-center tw:justify-center tw:rounded-full tw:size-8 tw:flex-none"
          :class="
            e.kind === 'membership'
              ? 'tw:bg-blue-100 tw:text-blue-600'
              : 'tw:bg-primary/10 tw:text-primary'
          "
        >
          <component :is="iconFor(e)" :size="16" />
        </div>
        <div class="tw:flex-1 tw:min-w-0">
          <p class="tw:text-sm tw:text-on-main">{{ describe(e) }}</p>
          <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ e.actor || 'System' }} · {{ e.occurredAt?.formatDate?.('datetime') || e.occurredAt }}
          </p>
          <p
            v-if="e.detail?.reason"
            class="tw:text-xs tw:text-secondary tw:italic tw:mt-0.5 tw:line-clamp-2"
          >
            “{{ e.detail.reason }}”
          </p>
        </div>
      </div>
    </div>
  </BaseDrawer>
</template>
