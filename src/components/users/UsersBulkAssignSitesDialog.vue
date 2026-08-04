<script setup>
// Bulk site assignment — the operation the per-user profile form cannot express.
//
// "Add Pune to these 40 people" is the request admins actually make; a
// replace-only contract would force them to restate each person's existing set,
// which is tedious and an excellent way to wipe assignments by accident. Hence
// three modes.
//
// Unlike the bulk-role dialog (which writes RoleOnUser rows through the
// syncEngine), this posts to POST /v1/services/users/sites:bulk. Three reasons:
// the server validates tenancy + the inactive-site gate, the whole batch is ONE
// transaction so a bad id can't leave the roster half-migrated, and 40 users is
// one request instead of 40 round trips.
import { IconMapPinPlus } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception. The response
// is a per-user change summary, not a synced model record; the resulting
// user_sites rows arrive over the normal sync push.
import { post } from '@/api'

const props = defineProps({
  userIds: { type: Array, default: () => [] },
})
const emit = defineEmits(['assigned'])
const open = defineModel({ type: Boolean, default: false })

const toast = useToast()
const siteIds = ref([])
const mode = ref('add')
const saving = ref(false)

const MODES = [
  { value: 'add', label: 'Add', hint: 'Adds these sites. Existing assignments are kept.' },
  { value: 'remove', label: 'Remove', hint: 'Removes these sites. Everything else is kept.' },
  {
    value: 'replace',
    label: 'Replace',
    hint: 'These sites become the complete set — anything not listed is removed.',
  },
]

const activeHint = computed(() => MODES.find((m) => m.value === mode.value)?.hint ?? '')

// Replace with an empty list is the legitimate way to clear everyone's
// additional sites; add/remove with nothing selected is meaningless.
const canSubmit = computed(() => siteIds.value.length > 0 || mode.value === 'replace')

watch(open, (v) => {
  if (v) {
    siteIds.value = []
    mode.value = 'add'
  }
})

function summarize(results) {
  const changed = results.filter((r) => r.added.length || r.removed.length || r.restored.length)
  const assigned = results.reduce((n, r) => n + r.added.length + r.restored.length, 0)
  const removed = results.reduce((n, r) => n + r.removed.length, 0)
  const parts = []
  if (assigned) parts.push(`${assigned} assignment${assigned === 1 ? '' : 's'} added`)
  if (removed) parts.push(`${removed} removed`)
  if (!parts.length) return 'No changes — the selected users already matched.'
  return `${parts.join(', ')} across ${changed.length} user${changed.length === 1 ? '' : 's'}.`
}

async function confirm() {
  if (!canSubmit.value) {
    toast.notify({ type: 'negative', message: 'Select at least one site' })
    return
  }
  saving.value = true
  try {
    const data = await post('/v1/services/users/sites:bulk', {
      userIds: props.userIds,
      siteIds: siteIds.value,
      mode: mode.value,
    })
    toast.success(summarize(data?.results ?? []))
    emit('assigned')
    open.value = false
  } catch (err) {
    // The server rejects the WHOLE batch on a bad/inactive site, so surface its
    // message rather than a generic failure — "Cannot assign an inactive site:
    // Pune" is actionable, "Something went wrong" is not.
    toast.notify({
      type: 'negative',
      message: err?.response?.data?.message || err?.message || 'Failed to update site assignments',
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    :title="`Assign sites to ${userIds.length} user${userIds.length === 1 ? '' : 's'}`"
  >
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div>
        <p class="tw:text-secondary tw:text-xs tw:mb-1">Action</p>
        <BaseSelect
          v-model="mode"
          :options="MODES"
          optionLabel="label"
          optionValue="value"
          :required="true"
          :searchable="false"
        />
      </div>

      <div>
        <p class="tw:text-secondary tw:text-xs tw:mb-1">Sites</p>
        <SiteSelectMenu v-model="siteIds" multiple :allowCreate="false" forAssignment />
      </div>

      <p class="tw:text-xs tw:text-secondary">{{ activeHint }}</p>

      <p class="tw:text-xs tw:text-secondary">
        These are <strong>additional</strong> sites — each user's primary site is unaffected and
        always remains part of their access. A role with <em>Site</em> access reaches records at
        every site a user holds.
      </p>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="secondary" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="saving || !canSubmit" @click="confirm">
        <template #icon><IconMapPinPlus :size="16" /></template>
        {{ saving ? 'Saving…' : 'Apply' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
