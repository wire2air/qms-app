<script setup>
import {
  IconRobot,
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconBan,
  IconCheck,
} from '@tabler/icons-vue'
import { listServiceAccountKeys, revokeServiceAccountKey } from '@/api/serviceAccounts.js'

const props = defineProps({
  account: { type: Object, required: true },
})

const emit = defineEmits(['toggle', 'delete', 'changed'])

const expanded = ref(false)
const keys = ref(null)
const showKeyDialog = ref(false)
const confirmDelete = ref(false)
const confirmRevokeKeyId = ref(null)

const isActive = computed(() => props.account.statusId === 'ACTIVE')

const statusClass = computed(() =>
  isActive.value ? 'tw:bg-green-100 tw:text-green-700' : 'tw:bg-gray-100 tw:text-gray-700',
)

/**
 * Keys load on first expand rather than with the list. A tenant with twenty
 * integrations would otherwise fire twenty requests to render a page on which
 * most rows stay collapsed.
 */
async function toggleExpanded() {
  expanded.value = !expanded.value
  if (expanded.value && keys.value === null) await loadKeys()
}

async function loadKeys() {
  const res = await listServiceAccountKeys(props.account.id)
  keys.value = res?.keys ?? []
}

async function handleRevoke() {
  await revokeServiceAccountKey(props.account.id, confirmRevokeKeyId.value)
  confirmRevokeKeyId.value = null
  await loadKeys()
}

// BaseConfirmDialog takes a boolean v-model, but the revoke dialog is keyed by
// WHICH key is being revoked — so the id doubles as the open flag and this
// translates between the two.
function closeRevokeConfirm(open) {
  if (!open) confirmRevokeKeyId.value = null
}

function keyStatus(key) {
  if (key.revoked) return { label: 'Revoked', cls: 'tw:bg-red-100 tw:text-red-700' }
  if (key.expiresAt && key.expiresAt < new Date())
    return { label: 'Expired', cls: 'tw:bg-gray-100 tw:text-gray-700' }
  return { label: 'Active', cls: 'tw:bg-green-100 tw:text-green-700' }
}
</script>

<template>
  <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-main">
    <div class="tw:flex tw:items-center tw:gap-3 tw:p-4">
      <button
        class="tw:rounded-lg tw:p-1 tw:hover:bg-main-hover tw:transition-colors"
        :aria-label="expanded ? 'Collapse keys' : 'Expand keys'"
        :aria-expanded="expanded"
        @click="toggleExpanded"
      >
        <IconChevronDown v-if="expanded" :size="18" class="tw:text-secondary" />
        <IconChevronRight v-else :size="18" class="tw:text-secondary" />
      </button>

      <div
        class="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary/10 tw:text-primary"
      >
        <IconRobot :size="20" />
      </div>

      <div class="tw:min-w-0 tw:flex-1">
        <div class="tw:flex tw:items-center tw:gap-2">
          <span class="tw:truncate tw:font-semibold tw:text-on-main">{{ account.name }}</span>
          <span class="tw:rounded-full tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium" :class="statusClass">
            {{ isActive ? 'Active' : 'Disabled' }}
          </span>
        </div>
        <div v-if="account.description" class="tw:truncate tw:text-caption tw:text-secondary">
          {{ account.description }}
        </div>
      </div>

      <div class="tw:flex tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-1">
        <RoleBadgeById v-for="roleId in account.roleIds" :key="roleId" :roleId="roleId" />
      </div>

      <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-1">
        <BaseTooltip :content="isActive ? 'Disable — stops every key at once' : 'Enable'">
          <button
            class="tw:rounded-lg tw:border tw:border-divider tw:p-2 tw:hover:bg-main-hover tw:transition-colors"
            :aria-label="isActive ? 'Disable service account' : 'Enable service account'"
            @click="emit('toggle')"
          >
            <IconBan v-if="isActive" :size="18" class="tw:text-secondary" />
            <IconCheck v-else :size="18" class="tw:text-secondary" />
          </button>
        </BaseTooltip>
        <BaseTooltip content="Delete — revokes every key">
          <button
            class="tw:rounded-lg tw:border tw:border-divider tw:p-2 tw:hover:bg-main-hover tw:transition-colors"
            aria-label="Delete service account"
            @click="confirmDelete = true"
          >
            <IconTrash :size="18" class="tw:text-negative" />
          </button>
        </BaseTooltip>
      </div>
    </div>

    <!-- Keys -->
    <div v-if="expanded" class="tw:border-t tw:border-divider tw:p-4">
      <div class="tw:mb-3 tw:flex tw:items-center tw:justify-between">
        <span class="tw:text-sm tw:font-semibold tw:text-on-main">API keys</span>
        <BaseButton size="sm" variant="outline" :disabled="!isActive" @click="showKeyDialog = true">
          <IconPlus class="tw:size-4" />
          Issue key
        </BaseButton>
      </div>

      <div v-if="!isActive" class="tw:mb-3 tw:text-caption tw:text-secondary">
        This account is disabled — its keys will not authenticate, and no new key can be issued
        until it is enabled.
      </div>

      <div v-if="keys === null" class="tw:text-caption tw:text-secondary">Loading…</div>
      <div v-else-if="keys.length === 0" class="tw:text-caption tw:text-secondary">
        No keys yet. Issue one to let an external system authenticate as this account.
      </div>

      <div v-else class="tw:flex tw:flex-col tw:gap-2">
        <div
          v-for="key in keys"
          :key="key.id"
          class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
        >
          <span class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-sm tw:text-on-main">
            {{ key.name }}
          </span>
          <span
            class="tw:rounded-full tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium"
            :class="keyStatus(key).cls"
          >
            {{ keyStatus(key).label }}
          </span>
          <span class="tw:w-40 tw:shrink-0 tw:text-caption tw:text-secondary">
            Last used {{ key.lastUsedAt ? key.lastUsedAt.formatDate('datetime') : 'never' }}
          </span>
          <button
            v-if="!key.revoked"
            class="tw:rounded-lg tw:border tw:border-divider tw:px-2 tw:py-1 tw:text-caption tw:hover:bg-main-hover tw:transition-colors"
            @click="confirmRevokeKeyId = key.id"
          >
            Revoke
          </button>
        </div>
      </div>
    </div>
  </div>

  <ServiceAccountKeyDialog
    v-model="showKeyDialog"
    :accountId="account.id"
    @issued="loadKeys"
  />

  <BaseConfirmDialog
    v-model="confirmDelete"
    title="Delete service account?"
    :message="`Every API key belonging to ${account.name} is revoked immediately, and any integration using one stops working. This cannot be undone.`"
    okLabel="Delete"
    okVariant="danger"
    @ok="emit('delete')"
  />

  <BaseConfirmDialog
    :modelValue="confirmRevokeKeyId !== null"
    title="Revoke this key?"
    message="Any system currently using this key stops working immediately. Revoking cannot be undone — issue a new key instead."
    okLabel="Revoke"
    okVariant="danger"
    @update:modelValue="closeRevokeConfirm"
    @ok="handleRevoke"
    @cancel="confirmRevokeKeyId = null"
  />
</template>
