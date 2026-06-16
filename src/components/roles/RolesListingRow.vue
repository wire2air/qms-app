<script setup>
import { IconCircleCheck, IconBan, IconUsers, IconHistory } from '@tabler/icons-vue'
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

const confirmDeactivate = ref(false)
const confirmActivate = ref(false)

function navigateToRole() {
  router.push(getCompanyPath(`/roles/${props.role.id}`))
}

async function handleDeactivate() {
  const success = await deactivateRole(props.role.id)
  if (success) {
    toast.success('Role deactivated successfully')
  } else {
    toast.error('Failed to deactivate role')
  }
}

async function handleActivate() {
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
    class="tw:bg-sidebar tw:border tw:border-divider tw:rounded-xl tw:p-4 tw:hover:shadow-md tw:hover:border-primary/30 tw:transition-all tw:group tw:relative"
    :aria-label="`Open role ${role.name}`"
    @click="navigateToRole"
  >
    <div class="tw:flex tw:justify-between tw:items-start tw:gap-4">
      <div class="tw:flex-1">
        <div class="tw:flex tw:items-center tw:gap-2 tw:mb-2">
          <!-- Role Badges -->
          <RoleStatusBadge v-if="role.statusId" :status="role.statusId" />
          <span class="tw:text-xs tw:text-secondary">•</span>
          <span class="tw:text-xs tw:text-secondary">ID: {{ role.code || role.id }}</span>
        </div>

        <h3 class="tw:text-lg tw:font-bold tw:text-on-sidebar tw:mb-2">
          {{ role.name }}
        </h3>
        <p class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:max-w-3xl">
          {{ role.description || 'No description provided' }}
        </p>
      </div>

      <!-- More Options Button -->
      <BaseMenu v-if="canUpdateRole" @click.stop>
        <template #items>
          <button
            v-if="isInactive"
            class="tw:group tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-green-700 tw:transition-colors tw:hover:bg-main-hover tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="confirmActivate = true"
          >
            <IconCircleCheck :size="16" class="tw:shrink-0" />
            Activate Role
          </button>
          <button
            v-else
            class="tw:group tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-amber-700 tw:transition-colors tw:hover:bg-main-hover tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="confirmDeactivate = true"
          >
            <IconBan :size="16" class="tw:shrink-0" />
            Deactivate Role
          </button>
        </template>
      </BaseMenu>
    </div>

    <!-- Role Metadata Footer -->
    <div
      class="tw:mt-2 tw:flex tw:flex-wrap tw:items-center tw:gap-6 tw:border-t tw:border-divider tw:pt-2"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
        <IconUsers :size="16" class="tw:text-secondary" />
        <span class="tw:font-medium tw:text-on-sidebar">
          {{ role.userCount || 0 }} Assigned Users
        </span>
      </div>

      <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
        <IconHistory :size="16" class="tw:text-secondary" />
        <span class="tw:text-secondary"
          >Last Modified: {{ role.updatedAt.formatDate('date') }}</span
        >
      </div>

    </div>
  </BaseClickableRow>

  <ConfirmDialog
    v-model="confirmDeactivate"
    title="Deactivate Role"
    :message="`Are you sure you want to deactivate the role &quot;${role.name}&quot;? This will set its status to Inactive.`"
    okLabel="Deactivate"
    @ok="handleDeactivate"
  />

  <ConfirmDialog
    v-model="confirmActivate"
    title="Activate Role"
    :message="`Are you sure you want to activate the role &quot;${role.name}&quot;?`"
    okLabel="Activate"
    @ok="handleActivate"
  />
</template>
