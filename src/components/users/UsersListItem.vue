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
    class="tw:flex tw:items-center tw:gap-3 tw:px-3.5 tw:py-2.5 tw:bg-sidebar tw:rounded-lg tw:border tw:border-divider tw:hover:border-primary/40 tw:hover:shadow-sm tw:transition-all"
    :aria-label="`View ${user.firstName} ${user.lastName}`"
    @click="onClick"
  >
    <UserAvatar :user="user" class="tw:size-9 tw:shrink-0" />

    <div class="tw:flex-1 tw:min-w-0">
      <div class="tw:truncate tw:text-sm tw:font-semibold tw:text-on-main">
        {{ user.firstName }} {{ user.lastName }}
      </div>
      <div class="tw:truncate tw:text-xs tw:text-secondary">{{ user.email }}</div>
    </div>

    <div class="tw:hidden tw:max-w-56 tw:shrink-0 tw:truncate tw:text-xs tw:text-secondary tw:md:block">
      {{ roleNames }}
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
