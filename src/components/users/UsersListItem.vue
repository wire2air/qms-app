<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { IconTrash } from '@tabler/icons-vue'

const props = defineProps({
  user: {
    type: Object,
    required: true,
  },
  clearable: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['clear'])

const router = useRouter()

const roles = useLiveQueryWithDeps(
  [() => props.user.id],
  async (db, [userId]) => {
    const assignments = await db.RoleOnUser.where('userId', userId).exec()
    const roleResults = await Promise.all(assignments.map((ra) => db.Role.findByPk(ra.roleId)))
    return roleResults.filter(Boolean)
  },

  { models: ['RoleOnUser', 'Role'], initial: [] },
)

const roleNames = computed(() => {
  if (!roles.value.length) return 'No roles assigned'
  return roles.value.map((r) => r.name).join(', ')
})

function onClick() {
  router.push(getCompanyPath(`/users/${props.user.id}`))
}
</script>

<template>
  <BaseClickableRow
    class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-sidebar tw:rounded-lg tw:border tw:border-divider tw:hover:border-primary/30 tw:transition-colors"
    :aria-label="`View ${user.firstName} ${user.lastName}`"
    @click="onClick"
  >
    <UserAvatar :user="user" class="tw:size-14" />

    <div class="tw:flex-1 tw:min-w-0">
      <div class="tw:text-lg tw:font-bold tw:text-on-main">
        {{ user.firstName }} {{ user.lastName }}
      </div>
      <div class="tw:text-sm tw:text-secondary">{{ user.email }}</div>
      <div class="tw:text-xs tw:text-secondary tw:mt-1">{{ roleNames }}</div>
    </div>

    <div class="tw:flex-none">
      <button
        v-if="clearable"
        class="tw:p-1.5 tw:rounded-md tw:text-secondary tw:hover:text-red-600 tw:hover:bg-red-50 tw:transition-colors"
        @click.stop="emit('clear', user)"
      >
        <IconTrash :size="14" />
      </button>
    </div>
  </BaseClickableRow>
</template>
