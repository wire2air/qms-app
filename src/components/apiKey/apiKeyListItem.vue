<script setup>
import { IconKey, IconBan, IconTrash } from '@tabler/icons-vue'

const props = defineProps({
  apiKey: {
    type: Object,
    required: true,
  },
})

const isRevoked = computed(() => props.apiKey.revoked)

const lastUsedLabel = computed(() => {
  return props.apiKey.lastUsedAt ? props.apiKey.lastUsedAt.formatDate() : 'Never'
})

const expiresLabel = computed(() => {
  return props.apiKey.expiresAt ? props.apiKey.expiresAt.formatDate() : 'Never'
})

const confirmDialog = ref(null)

const menuItems = computed(() => {
  const items = []
  if (!isRevoked.value) {
    items.push({
      name: 'Revoke',
      icon: IconBan,
      click: () => {
        confirmDialog.value = {
          title: 'Revoke API Key',
          message: `Are you sure you want to revoke "${props.apiKey.name}"? This key will no longer be able to authenticate requests.`,
          okLabel: 'Revoke',
          onOk: async () => {
            props.apiKey.revoked = true
            await props.apiKey.save()
          },
        }
      },
    })
  }
  items.push({
    name: 'Delete',
    icon: IconTrash,
    click: () => {
      confirmDialog.value = {
        title: 'Delete API Key',
        message: `Are you sure you want to delete "${props.apiKey.name}"? This action cannot be undone.`,
        okLabel: 'Delete',
        onOk: async () => {
          await props.apiKey.delete()
        },
      }
    },
  })
  return items
})
</script>

<template>
  <div class="tw:border tw:border-divider tw:rounded-xl tw:p-4 tw:bg-sidebar">
    <div class="tw:flex tw:items-start tw:gap-3">
      <!-- Key Icon -->
      <div
        class="tw:flex tw:items-center tw:justify-center tw:size-10 tw:rounded-lg tw:flex-none"
        :class="isRevoked ? 'tw:bg-red-50' : 'tw:bg-green-50'"
      >
        <IconKey :size="20" :class="isRevoked ? 'tw:text-red-400' : 'tw:text-green-600'" />
      </div>

      <!-- Info -->
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-lg tw:font-bold tw:text-on-main">
          {{ apiKey.name }}
        </div>
        <div v-if="apiKey.label" class="tw:text-sm tw:text-secondary tw:mt-0.5">
          {{ apiKey.label }}
        </div>

        <!-- Metadata row -->
        <div
          class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-1 tw:mt-2 tw:text-xs tw:text-secondary"
        >
          <span
            class="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-semibold"
            :class="
              isRevoked ? 'tw:bg-red-100 tw:text-red-700' : 'tw:bg-green-100 tw:text-green-700'
            "
          >
            {{ isRevoked ? 'Revoked' : 'Active' }}
          </span>
          <span>Last used: {{ lastUsedLabel }}</span>
          <span>Expires: {{ expiresLabel }}</span>
        </div>
      </div>

      <!-- Actions Menu -->
      <div class="tw:flex-none" @click.stop>
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
