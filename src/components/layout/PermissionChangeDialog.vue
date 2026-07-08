<script setup>
import { IconShieldLock } from '@tabler/icons-vue'
import { permissionsChanged } from '@/utils/permissionSync'

// Bound to the dialog's v-model. Reflects the shared `permissionsChanged` flag,
// which flips true when an admin changes this user's permissions while they're
// signed in.
const open = computed({
  get: () => permissionsChanged.value,
  set: (v) => (permissionsChanged.value = v),
})

function reloadNow() {
  window.location.reload()
}

function dismiss() {
  permissionsChanged.value = false
}
</script>

<template>
  <BaseDialog v-model="open" size="md" persistent :showClose="false" ariaLabel="Permissions updated">
    <div class="tw:flex tw:flex-col tw:items-center tw:gap-4 tw:text-center tw:py-2">
      <div
        class="tw:flex tw:h-14 tw:w-14 tw:items-center tw:justify-center tw:rounded-full tw:bg-amber-50 tw:text-amber-600 tw:dark:bg-amber-500/10"
      >
        <IconShieldLock :size="28" :stroke="1.75" />
      </div>
      <div class="tw:flex tw:flex-col tw:gap-1.5">
        <h3 class="tw:text-lg tw:font-bold tw:tracking-tight">Your access has changed</h3>
        <p class="tw:text-secondary tw:text-sm">
          An administrator updated your permissions. Reload the page to apply the latest access and
          load any newly available data.
        </p>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="dismiss">Later</BaseButton>
      <BaseButton variant="primary" @click="reloadNow">Reload now</BaseButton>
    </template>
  </BaseDialog>
</template>
