<script setup>
import { IconLock, IconArrowLeft } from '@tabler/icons-vue'

defineOptions({ name: 'NoAccess' })

const router = useRouter()
const route = useRoute()

// The route the user was denied, passed by the permission guard.
const attempted = computed(() => route.query.from || null)

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/dashboard')
}
</script>

<template>
  <div class="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:p-6">
    <div class="tw:flex tw:max-w-md tw:flex-col tw:items-center tw:gap-5 tw:text-center">
      <div
        class="tw:flex tw:h-16 tw:w-16 tw:items-center tw:justify-center tw:rounded-full tw:bg-red-50 tw:text-red-500 tw:dark:bg-red-500/10"
      >
        <IconLock :size="32" :stroke="1.75" />
      </div>

      <div class="tw:flex tw:flex-col tw:gap-2">
        <h1 class="tw:text-2xl tw:font-bold tw:tracking-tight">Access denied</h1>
        <p class="tw:text-secondary tw:text-base">
          You don't have permission to view this page. If you think this is a mistake, ask an
          administrator to update your role's permissions.
        </p>
        <p v-if="attempted" class="tw:text-secondary tw:text-xs tw:break-all tw:opacity-70">
          {{ attempted }}
        </p>
      </div>

      <div class="tw:mt-2 tw:flex tw:items-center tw:gap-3">
        <button
          class="tw:inline-flex tw:h-10 tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-gray-200 tw:px-4 tw:font-medium tw:hover:bg-gray-50 tw:dark:border-gray-700 tw:dark:hover:bg-gray-800"
          @click="goBack"
        >
          <IconArrowLeft :size="18" />
          Go back
        </button>
        <RouterLink
          to="/dashboard"
          class="tw:inline-flex tw:h-10 tw:items-center tw:rounded-lg tw:bg-primary tw:px-4 tw:font-semibold tw:text-on-primary tw:hover:opacity-90"
        >
          Go to Dashboard
        </RouterLink>
      </div>
    </div>
  </div>
</template>
