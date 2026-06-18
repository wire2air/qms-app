<script setup>
import { IconRobot, IconBan } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { del } from '@/api'
import { useToast } from '@shared/composables/useToast.js'

const props = defineProps({
  token: {
    type: Object,
    required: true,
  },
})

const toast = useToast()

const isRevoked = computed(() => !!props.token.revokedAt)
const isExpired = computed(() => {
  return props.token.expiresAt && props.token.expiresAt < new Date()
})

const statusLabel = computed(() => {
  if (isRevoked.value) return 'Revoked'
  if (isExpired.value) return 'Expired'
  return 'Active'
})

const statusClass = computed(() => {
  if (isRevoked.value) return 'tw:bg-red-100 tw:text-red-700'
  if (isExpired.value) return 'tw:bg-gray-100 tw:text-gray-700'
  return 'tw:bg-green-100 tw:text-green-700'
})

const lastUsedLabel = computed(() => {
  return props.token.lastUsedAt ? props.token.lastUsedAt.formatDate('datetime') : 'Never'
})

const expiresLabel = computed(() => {
  return props.token.expiresAt ? props.token.expiresAt.formatDate() : 'Never'
})

const confirmDialog = ref(null)

const menuItems = computed(() => {
  if (isRevoked.value) return []
  return [
    {
      name: 'Revoke',
      icon: IconBan,
      click: () => {
        confirmDialog.value = {
          title: 'Revoke API Token',
          message: `Revoke "${props.token.name}"? Any client using it will immediately stop working.`,
          okLabel: 'Revoke',
          onOk: async () => {
            try {
              await del(`/v1/services/ai/pats/${props.token.id}`)
              toast.notify({ type: 'positive', message: 'Token revoked' })
            } catch (err) {
              toast.notify({ type: 'negative', message: err?.message || 'Failed to revoke token' })
            }
          },
        }
      },
    },
  ]
})
</script>

<template>
  <div class="tw:border tw:border-divider tw:rounded-xl tw:p-4 tw:bg-sidebar">
    <div class="tw:flex tw:items-start tw:gap-3">
      <!-- Icon -->
      <div
        class="tw:flex tw:items-center tw:justify-center tw:size-10 tw:rounded-lg tw:flex-none"
        :class="isRevoked || isExpired ? 'tw:bg-red-50' : 'tw:bg-green-50'"
      >
        <IconRobot
          :size="20"
          :class="isRevoked || isExpired ? 'tw:text-red-400' : 'tw:text-green-600'"
        />
      </div>

      <!-- Info -->
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
          <div class="tw:text-lg tw:font-bold tw:text-on-main">
            {{ token.name }}
          </div>
          <code
            class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-main-hover tw:text-secondary tw:font-mono"
          >
            {{ token.prefix }}…
          </code>
        </div>

        <!-- Metadata row -->
        <div
          class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-1 tw:mt-2 tw:text-xs tw:text-secondary"
        >
          <span
            class="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-semibold"
            :class="statusClass"
          >
            {{ statusLabel }}
          </span>
          <span>Last used: {{ lastUsedLabel }}</span>
          <span>Expires: {{ expiresLabel }}</span>
        </div>
      </div>

      <!-- Actions Menu -->
      <div v-if="menuItems.length" class="tw:flex-none" @click.stop>
        <BaseMenu :items="menuItems" />
      </div>
    </div>
  </div>

  <BaseConfirmDialog
    v-if="confirmDialog"
    :modelValue="true"
    v-bind="confirmDialog"
    @update:modelValue="confirmDialog = null"
    @ok="confirmDialog?.onOk"
  />
</template>
