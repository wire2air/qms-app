<script setup>
/**
 * Share the Mobile Logging Portal (/logging — the phone-first floor-user
 * surface) — QR code to scan with a phone + copy-able link. This replaced the
 * "Logging" left-nav entry (user decision 2026-07-24: the portal is for
 * people on the go in the warehouse / on the floor, not a desktop menu item;
 * a dedicated mobile app wraps this route later).
 */
import { IconCopy, IconCheck, IconExternalLink } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const portalUrl = computed(() => `${window.location.origin}${getCompanyPath('/logging')}`)

const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(portalUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    toast.error('Could not copy — select the link and copy manually.')
  }
}
function openPortal() {
  window.open(portalUrl.value, '_blank')
}
</script>

<template>
  <BaseDialog v-model="show" title="Mobile Logging Portal" maxWidth="md">
    <div class="tw:p-5 tw:flex tw:flex-col tw:items-center tw:gap-4 tw:text-center">
      <p class="tw:text-sm tw:text-secondary">
        The phone-first portal for floor and warehouse users — pick a log book, fill it, done.
        Scan the code with a phone camera, or send the link. Users sign in with their normal
        account.
      </p>

      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-white tw:p-4">
        <BaseQrCode :value="portalUrl" :size="180" />
      </div>

      <div class="tw:flex tw:items-center tw:gap-2 tw:w-full">
        <code
          class="tw:flex-1 tw:truncate tw:text-xs tw:px-3 tw:py-2 tw:rounded-lg tw:bg-main-hover tw:text-secondary tw:text-left"
        >
          {{ portalUrl }}
        </code>
        <BaseButton variant="outline" size="sm" :aria-label="copied ? 'Copied' : 'Copy link'" @click="copyLink">
          <component :is="copied ? IconCheck : IconCopy" :size="16" />
        </BaseButton>
        <BaseButton variant="outline" size="sm" aria-label="Open portal" @click="openPortal">
          <IconExternalLink :size="16" />
        </BaseButton>
      </div>

      <p class="tw:text-xs tw:text-secondary">
        Tip: on the phone, use “Add to Home Screen” for an app-like icon until the dedicated
        mobile app ships.
      </p>
    </div>
  </BaseDialog>
</template>
