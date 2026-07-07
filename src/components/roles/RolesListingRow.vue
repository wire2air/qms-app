<script setup>
import { IconCircleCheck, IconBan, IconUsers, IconHistory, IconShield } from '@tabler/icons-vue'
import { useRoles } from '@/composables/useRoles.js'
import { getCompanyPath } from '@/utils/routeHelpers'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  role: {
    type: Object,
    required: true,
  },
})

const toast = useToast()
const router = useRouter()
const { deactivateRole, activateRole } = useRoles()

const canUpdateRole = computed(() => isAllowed(['roles:update']))
const isInactive = computed(() => props.role.statusId === 'INACTIVE')

const { confirm } = useConfirm()

function navigateToRole() {
  router.push(getCompanyPath(`/roles/${props.role.id}`))
}

async function handleDeactivate() {
  const ok = await confirm({
    title: 'Deactivate Role',
    message: `Are you sure you want to deactivate the role "${props.role.name}"? This will set its status to Inactive.`,
    okLabel: 'Deactivate',
    danger: true,
  })
  if (!ok) return
  const success = await deactivateRole(props.role.id)
  if (success) {
    toast.success('Role deactivated successfully')
  } else {
    toast.error('Failed to deactivate role')
  }
}

async function handleActivate() {
  const ok = await confirm({
    title: 'Activate Role',
    message: `Are you sure you want to activate the role "${props.role.name}"?`,
    okLabel: 'Activate',
  })
  if (!ok) return
  const success = await activateRole(props.role.id)
  if (success) {
    toast.success('Role activated successfully')
  } else {
    toast.error('Failed to activate role')
  }
}
</script>

<template>
  <BaseClickableRow
    class="tw:group tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-3.5 tw:py-2.5 tw:transition-all tw:hover:border-primary/40 tw:hover:shadow-sm"
    :aria-label="`Open role ${role.name}`"
    @click="navigateToRole"
  >
    <!-- Icon tile -->
    <div
      class="tw:flex tw:h-9 tw:w-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary/10 tw:text-primary"
    >
      <IconShield :size="18" />
    </div>

    <!-- Name + description -->
    <div class="tw:min-w-0 tw:flex-1">
      <div class="tw:flex tw:items-center tw:gap-2">
        <h3 class="tw:truncate tw:text-sm tw:font-semibold tw:text-on-sidebar">{{ role.name }}</h3>
        <RoleStatusBadge v-if="role.statusId" :status="role.statusId" />
      </div>
      <p class="tw:truncate tw:text-xs tw:text-secondary">
        {{ role.description || 'No description provided' }}
      </p>
    </div>

    <!-- Assigned users -->
    <div
      class="tw:hidden tw:shrink-0 tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:sm:flex"
    >
      <IconUsers :size="15" class="tw:shrink-0" />
      <span class="tw:whitespace-nowrap">{{ role.userCount || 0 }} users</span>
    </div>

    <!-- Last modified -->
    <div
      class="tw:hidden tw:w-28 tw:shrink-0 tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:md:flex"
    >
      <IconHistory :size="15" class="tw:shrink-0" />
      <span class="tw:whitespace-nowrap">{{ role.updatedAt?.formatDate('date') }}</span>
    </div>

    <!-- More options -->
    <BaseMenu v-if="canUpdateRole" @click.stop>
      <template #items>
        <button
          v-if="isInactive"
          class="tw:group tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-green-700 tw:transition-colors tw:hover:bg-main-hover tw:bg-transparent tw:border-0 tw:cursor-pointer"
          @click="handleActivate"
        >
          <IconCircleCheck :size="16" class="tw:shrink-0" />
          Activate Role
        </button>
        <button
          v-else
          class="tw:group tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-amber-700 tw:transition-colors tw:hover:bg-main-hover tw:bg-transparent tw:border-0 tw:cursor-pointer"
          @click="handleDeactivate"
        >
          <IconBan :size="16" class="tw:shrink-0" />
          Deactivate Role
        </button>
      </template>
    </BaseMenu>
  </BaseClickableRow>
</template>
