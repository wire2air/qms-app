<script setup>
// Bulk-assign a role to many users at once (M2). Adds RoleOnUser rows through
// the syncEngine — the same write path as the user page and the role dialog —
// skipping users who already hold the role so no duplicate live rows are created.
import { IconUsersPlus } from '@tabler/icons-vue'

const props = defineProps({
  userIds: { type: Array, default: () => [] },
})
const emit = defineEmits(['assigned'])
const open = defineModel({ type: Boolean, default: false })

const toast = useToast()
const roleId = ref(null)
const saving = ref(false)

watch(open, (v) => {
  if (v) roleId.value = null
})

// One mutation does the whole batch: read who already has the role, then create
// the missing assignments.
const bulkAssign = useLiveMutation(async (db, { userIds, roleId }) => {
  const existing = await db.RoleOnUser.where('roleId', roleId).exec()
  const have = new Set(existing.map((a) => a.userId))
  let added = 0
  for (const userId of userIds) {
    if (have.has(userId)) continue
    const a = db.RoleOnUser.create({ userId, roleId })
    await a.save()
    added += 1
  }
  return added
})

async function confirm() {
  if (!roleId.value) {
    toast.notify({ type: 'negative', message: 'Select a role to assign' })
    return
  }
  saving.value = true
  try {
    const added = await bulkAssign({ userIds: props.userIds, roleId: roleId.value })
    // useLiveMutation swallows write failures (it shows its own error toast) and
    // returns undefined. Guard on that: a genuine batch returns a number (0 when
    // everyone already had the role). Without this guard a failed save still
    // printed "Role assigned to undefined users" on top of the error toast.
    if (added == null) return
    const skipped = props.userIds.length - added
    toast.success(
      `Role assigned to ${added} user${added === 1 ? '' : 's'}` +
        (skipped ? ` (${skipped} already had it)` : ''),
    )
    emit('assigned')
    open.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    :title="`Assign a role to ${userIds.length} user${userIds.length === 1 ? '' : 's'}`"
  >
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div>
        <p class="tw:text-secondary tw:text-xs tw:mb-1">Role</p>
        <RoleSelectMenu v-model="roleId" :required="true" />
      </div>
      <p class="tw:text-xs tw:text-secondary">
        The role is added to the selected users. Anyone who already has it is skipped. Existing
        roles are not removed.
      </p>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="secondary" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="saving" @click="confirm">
        <template #icon><IconUsersPlus :size="16" /></template>
        {{ saving ? 'Assigning…' : 'Assign role' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
