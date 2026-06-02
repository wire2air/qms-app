<script setup>
import { IconCopy, IconCheck, IconExternalLink } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

const modelValue = defineModel({ type: Boolean, default: false })

const toast = useToast()

const companyCode = computed(() => currentSession.value?.code || '')
const publicUrl = computed(() => {
  if (typeof window === 'undefined' || !companyCode.value) return ''
  return `${window.location.origin}/support/${companyCode.value}`
})

// useClipboard's `copied` flag auto-resets after `copiedDuring`, so the
// inline "copied" check icon flips back to the copy icon on its own.
const { copy, copied, isSupported } = useClipboard({ copiedDuring: 1500 })

async function handleCopy() {
  if (!publicUrl.value) return
  if (!isSupported.value) {
    toast.notify({
      type: 'negative',
      message: 'Clipboard not available in this browser — copy manually.',
    })
    return
  }
  await copy(publicUrl.value)
  toast.notify({ type: 'positive', message: 'Link copied' })
}

function openInNewTab() {
  if (!publicUrl.value) return
  window.open(publicUrl.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <BaseDialog v-model="modelValue" title="Public complaint link">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <p class="tw:text-sm tw:text-secondary">
        Anyone with this link can submit a complaint to your team. The form is rate-limited per
        IP, but doesn't require an account.
      </p>

      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
          Share this URL
        </label>
        <div class="tw:flex tw:items-stretch tw:gap-2">
          <div
            class="tw:flex-1 tw:bg-main-hover tw:border tw:border-divider tw:rounded-md tw:px-3 tw:py-2 tw:font-mono tw:text-sm tw:text-on-main tw:break-all"
          >
            {{ publicUrl || '—' }}
          </div>
          <BaseButton
            variant="primary"
            :disabled="!publicUrl"
            :aria-label="copied ? 'Copied' : 'Copy link'"
            @click="handleCopy"
          >
            <template #icon>
              <IconCheck v-if="copied" :size="16" />
              <IconCopy v-else :size="16" />
            </template>
            {{ copied ? 'Copied' : 'Copy' }}
          </BaseButton>
        </div>
      </div>

      <div class="tw:bg-blue-50 tw:border tw:border-blue-100 tw:rounded-md tw:px-3 tw:py-2 tw:text-xs tw:text-blue-700">
        New tickets created via this link arrive with
        <span class="tw:font-mono">source = WEB</span> and land in the unassigned queue.
        Customers can reply by email — replies thread back via the
        <span class="tw:font-mono">[CC-NNNNNN]</span> token in the subject.
      </div>
    </div>

    <template #actions>
      <BaseButton variant="outline" :disabled="!publicUrl" @click="openInNewTab">
        <template #icon><IconExternalLink :size="14" /></template>
        Open form
      </BaseButton>
      <BaseButton variant="primary" @click="modelValue = false">Done</BaseButton>
    </template>
  </BaseDialog>
</template>
