<script setup>
import { IconPlus } from '@tabler/icons-vue'

const props = defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  // Forwarded to BaseSelect: opt out of the required first-option auto-fill
  // when the caller owns defaulting (reviewer pickers).
  autoFill: {
    type: Boolean,
    default: true,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  nullLabel: {
    type: String,
    default: '— Select User —',
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

</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="filteredUsers"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :autoFill="autoFill"
    :multiple="multiple"
    :clearable="!required"
    :nullLabel="nullLabel"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
        <UserBadgeById
          v-for="o in options"
          :key="o.value"
          :userId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
        <!-- Explicit "add more" affordance — without it the badge row visually
             reads as final / single-select. Click bubbles to the trigger and
             opens the menu. -->
        <span
          v-if="multiple"
          class="tw:inline-flex tw:items-center tw:gap-0.5 tw:text-xs tw:font-medium tw:text-primary tw:hover:bg-primary/10 tw:rounded tw:px-1.5 tw:py-0.5 tw:cursor-pointer tw:border tw:border-dashed tw:border-primary/40"
        >
          <IconPlus :size="12" />
          Add
        </span>
      </div>
    </template>

    <template #option="{ opt }">
      <div class="tw:flex tw:flex-col">
        <span>{{ opt.label }}</span>
        <span v-if="rolesByUserId[opt.value]" class="tw:text-xs tw:text-placeholder">
          {{ rolesByUserId[opt.value] }}
        </span>
      </div>
    </template>
  </BaseSelect>
</template>
