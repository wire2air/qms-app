<script setup>
import { IconShieldLock, IconUsers, IconLock } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: role grants
// are authz rows the server checks and audits (supportRoleService.js).
import { get, put } from '@/api'

/**
 * Desk → Settings → Roles: what each support role may do in the desk and its
 * knowledge base. These are the desk's own (QMS Roles no longer lists them);
 * who holds which role is set under Agents. Read comes first: a module's
 * other permissions need it, and clearing Read clears the module.
 */
const toast = useToast()
const { confirm } = useConfirm()

const HELP = {
  complaint_management: {
    read: 'See the inbox, tickets and chats',
    create: 'Create tickets',
    update: 'Reply, edit, tag and set fields',
    assign: 'Assign tickets to agents',
    takeover: "Take over another agent's ticket or chat",
    close: 'Resolve and close',
    reopen: 'Reopen closed tickets',
    delete: 'Delete tickets',
    export: 'Export tickets',
    approve: 'Approve (approval steps)',
    reject: 'Reject (approval steps)',
    manage: 'Open Desk settings',
    manage_agents: 'Manage agents and these roles',
    manage_brands: 'Manage brands and channels',
  },
  knowledge_base: {
    read: 'Read all articles, agents-only included',
    create: 'Write new articles',
    update: 'Edit articles and restore versions',
    publish: 'Publish, unpublish and archive',
    delete: 'Delete articles',
    manage_settings: 'Folders, dynamic content and theme',
    manage_domains: 'Help-center domains',
  },
}
const MODULE_TITLE = { complaint_management: 'Inbox and tickets', knowledge_base: 'Knowledge base' }
const ORDER = ['read', 'create', 'update', 'publish', 'assign', 'takeover', 'close', 'reopen']

const loading = ref(true)
const catalog = ref([])
const roles = ref([])
const selectedId = ref(null)
const draft = ref(new Set())
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const out = await get('/v1/services/supportDesk/roles')
    catalog.value = out.catalog || []
    roles.value = out.roles || []
    if (!roles.value.some((r) => r.id === selectedId.value))
      selectedId.value = roles.value[0]?.id ?? null
    resetDraft()
  } catch (e) {
    toast.error(e?.message || 'Could not load the roles')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const role = computed(() => roles.value.find((r) => r.id === selectedId.value) || null)
function resetDraft() {
  draft.value = new Set(role.value?.permissions || [])
}
const dirty = computed(() => {
  const a = role.value?.permissions || []
  return a.length !== draft.value.size || a.some((p) => !draft.value.has(p))
})
async function select(id) {
  if (id === selectedId.value) return
  if (dirty.value) {
    const ok = await confirm({
      title: 'Discard the changes?',
      message: `Your changes to ${role.value?.name} are not saved.`,
      okLabel: 'Discard',
    })
    if (!ok) return
  }
  selectedId.value = id
  resetDraft()
}

function sortedActions(m) {
  return [...m.actions].sort((a, b) => {
    const ia = ORDER.indexOf(a.id)
    const ib = ORDER.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.id.localeCompare(b.id)
  })
}
const locked = computed(() => new Set(role.value?.locked || []))
function has(m, a) {
  return draft.value.has(`${m}:${a}`)
}
function toggle(m, a, on) {
  const next = new Set(draft.value)
  const key = `${m}:${a}`
  if (on) {
    next.add(key)
    next.add(`${m}:read`) // the module's other permissions need Read
  } else if (a === 'read') {
    for (const p of [...next]) if (p.startsWith(`${m}:`) && !locked.value.has(p)) next.delete(p)
  } else {
    next.delete(key)
  }
  draft.value = next
}
function countIn(m) {
  return m.actions.filter((a) => has(m.id, a.id)).length
}

async function save() {
  if (!role.value) return
  saving.value = true
  try {
    await put(`/v1/services/supportDesk/roles/${role.value.id}/permissions`, {
      permissions: [...draft.value],
    })
    toast.success(
      `${role.value.name} saved. People holding it see the change on their next page load.`,
    )
    await load()
  } catch (e) {
    toast.error(e?.message || 'Could not save the role')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageSection title="Roles" :icon="IconShieldLock" variant="card">
    <p class="tw:mb-4 tw:text-sm tw:text-secondary">
      What each desk role may do in the inbox and the knowledge base. Who holds which role is set
      under Agents. These roles are the desk's own: QMS Roles does not list them.
    </p>
    <div v-if="loading && !roles.length" class="tw:flex tw:justify-center tw:py-8">
      <BaseSpinner />
    </div>
    <div v-else class="tw:flex tw:flex-col tw:gap-4 tw:md:flex-row">
      <ul class="tw:flex tw:shrink-0 tw:flex-col tw:gap-1 tw:md:w-64" aria-label="Desk roles">
        <li v-for="r in roles" :key="r.id">
          <button
            type="button"
            :aria-current="r.id === selectedId ? 'true' : undefined"
            :class="[
              'tw:flex tw:w-full tw:flex-col tw:rounded-md tw:px-3 tw:py-2 tw:text-left',
              r.id === selectedId ? 'tw:bg-primary/10' : 'tw:hover:bg-main-hover',
            ]"
            @click="select(r.id)"
          >
            <span class="tw:text-sm tw:font-medium">{{ r.name }}</span>
            <span class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary">
              <IconUsers :size="12" /> {{ r.people }} {{ r.people === 1 ? 'person' : 'people' }} ·
              {{ r.permissions.length }} permissions
            </span>
          </button>
        </li>
      </ul>

      <section v-if="role" class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-4">
        <div>
          <p class="tw:text-base tw:font-semibold">{{ role.name }}</p>
          <p v-if="role.description" class="tw:text-sm tw:text-secondary">
            {{ role.description }}
          </p>
        </div>
        <div class="tw:grid tw:gap-4 tw:lg:grid-cols-2">
          <div
            v-for="m in catalog"
            :key="m.id"
            class="tw:rounded-lg tw:border tw:border-divider tw:p-3"
          >
            <p
              class="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:text-sm tw:font-semibold"
            >
              {{ MODULE_TITLE[m.id] || m.name }}
              <span class="tw:text-xs tw:font-normal tw:text-secondary"
                >{{ countIn(m) }} of {{ m.actions.length }}</span
              >
            </p>
            <ul class="tw:flex tw:flex-col tw:gap-1.5">
              <li v-for="a in sortedActions(m)" :key="a.id" class="tw:flex tw:items-start tw:gap-2">
                <BaseCheckbox
                  :modelValue="has(m.id, a.id)"
                  :disabled="locked.has(`${m.id}:${a.id}`)"
                  :aria-label="`${role.name}: ${a.name} (${m.name})`"
                  @update:modelValue="(v) => toggle(m.id, a.id, v)"
                />
                <span class="tw:flex tw:flex-col">
                  <span class="tw:flex tw:items-center tw:gap-1 tw:text-sm">
                    {{ a.name }}
                    <IconLock
                      v-if="locked.has(`${m.id}:${a.id}`)"
                      :size="12"
                      class="tw:text-secondary"
                      :title="'Support Admin keeps this, or nobody could open Desk settings'"
                    />
                  </span>
                  <span class="tw:text-xs tw:text-secondary">{{ HELP[m.id]?.[a.id] || '' }}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
        <div class="tw:flex tw:items-center tw:justify-end tw:gap-2">
          <span v-if="dirty" class="tw:mr-auto tw:text-xs tw:font-medium tw:text-amber-700"
            >Unsaved changes</span
          >
          <BaseButton variant="outline" :disabled="!dirty || saving" @click="resetDraft"
            >Reset</BaseButton
          >
          <BaseButton :disabled="!dirty" :isLoading="saving" @click="save">Save</BaseButton>
        </div>
      </section>
    </div>
  </PageSection>
</template>
