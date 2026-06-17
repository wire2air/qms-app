<script setup>
import { IconPlus } from '@tabler/icons-vue'

const props = defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  nullLabel: {
    type: String,
    default: '— All users —',
  },
  // Set true on admin screens that need to show inactive/invited users too
  includeInactive: {
    type: Boolean,
    default: false,
  },
  // OR-filter: only show users holding at least one of these role ids.
  // Null/empty = no filter.
  roleIdsFilter: {
    type: Array,
    default: null,
  },
  // Restrict to a kind. Default 'INTERNAL' so the generic picker no
  // longer leaks supplier users into screens it never used to (workflow
  // step assignees, admin users home, etc).
  //   'INTERNAL'           — staff only (default)
  //   'EXTERNAL_SUPPLIER'  — supplier users only
  //   null                 — both kinds, e.g. for system-wide impersonate
  //                          or future cross-kind tooling
  kind: {
    type: String,
    default: 'INTERNAL',
    validator: (v) => v === null || v === 'INTERNAL' || v === 'EXTERNAL_SUPPLIER',
  },
  // Restrict to users at a given supplier (paired with kind='EXTERNAL_SUPPLIER').
  // Useful for picking a supplier reviewer at NC/CAPA submit time when
  // entity.supplierId is set. Ignored when kind != 'EXTERNAL_SUPPLIER'.
  supplierId: {
    type: String,
    default: null,
  },
  // Restrict to users in a given department (null = no department filter).
  departmentId: {
    type: String,
    default: null,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const users = useLiveQueryWithDeps(
  [() => props.kind, () => props.supplierId, () => props.includeInactive, () => props.departmentId],
  async (db, [kind, supplierId, includeInactive, departmentId]) => {
    const all = await db.User.where().exec()
    return all
      .filter((u) => includeInactive || u.userStatusId === 'ACTIVE')
      .filter((u) => (kind ? u.kind === kind : true))
      .filter((u) =>
        kind === 'EXTERNAL_SUPPLIER' && supplierId ? u.supplierId === supplierId : true,
      )
      .filter((u) => (departmentId ? u.departmentId === departmentId : true))
      .map((user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}` }))
  },

  { models: ['User'], initial: [] },
)

const roleById = useLiveQuery(
  async (db) => {
    const roles = await db.Role.where().exec()
    return Object.fromEntries(roles.map((r) => [r.id, r]))
  },

  { models: ['Role'], initial: {} },
)

const roleIdsOnUsers = useLiveQuery(
  async (db) => {
    const rou = await db.RoleOnUser.where().exec()
    const map = {}
    rou.forEach((r) => {
      if (!map[r.userId]) map[r.userId] = []
      map[r.userId].push(r.roleId)
    })
    return map
  },

  { models: ['RoleOnUser'], initial: {} },
)

const rolesByUserId = computed(() => {
  const map = {}
  for (const [userId, roleIds] of Object.entries(roleIdsOnUsers.value)) {
    map[userId] = roleIds
      .map((id) => roleById.value[id])
      .filter(Boolean)
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b))
      .join(', ')
  }
  return map
})

// OR semantics — a user is eligible when they hold AT LEAST one of the
// filter's roles. Null or empty array = no filter (show all users).
const filteredUsers = computed(() => {
  const filter = props.roleIdsFilter
  if (!filter || filter.length === 0) return users.value
  return users.value.filter((u) => {
    const userRoleIds = roleIdsOnUsers.value[u.id] || []
    return filter.some((rid) => userRoleIds.includes(rid))
  })
})

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="filteredUsers"
    :required="required"
    :multiple="multiple"
    :nullLabel="nullLabel"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
            <UserBadgeById
              v-for="userId in getArray()"
              :key="userId"
              :userId="userId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(userId)"
            />
            <!-- Explicit "add more" affordance — without it the badge
                 row visually reads as final / single-select. Click is
                 captured by the surrounding popover trigger and opens
                 the menu. -->
            <span
              class="tw:inline-flex tw:items-center tw:gap-0.5 tw:text-xs tw:font-medium tw:text-primary tw:hover:bg-primary/10 tw:rounded tw:px-1.5 tw:py-0.5 tw:cursor-pointer tw:border tw:border-dashed tw:border-primary/40"
            >
              <IconPlus :size="12" />
              Add
            </span>
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> — All users — </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <UserBadgeById
            v-if="modelValue"
            :userId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> — All users — </span>
        </template>
      </slot>
    </template>

    <template #item="{ item }">
      <div class="tw:flex tw:flex-col">
        <span>{{ item.name }}</span>
        <span v-if="rolesByUserId[item.id]" class="tw:text-xs tw:text-placeholder">
          {{ rolesByUserId[item.id] }}
        </span>
      </div>
    </template>
  </BaseSelectMenu>
</template>
