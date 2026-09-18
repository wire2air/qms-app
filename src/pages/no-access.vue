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
        <!-- Use BaseButton so text/border/hover colours come from the theme
             tokens (text-on-sidebar + bg-main-hover) and stay legible in dark
             mode — the raw gray-* classes here made the label match the hover
             background in dark mode. -->
        <BaseButton variant="outline" @click="goBack">
          <template #icon><IconArrowLeft :size="18" /></template>
          Go back
        </BaseButton>
        <BaseButton variant="primary" to="/dashboard"> Go to Dashboard </BaseButton>
      </div>
    </div>
  </div>
</template>
