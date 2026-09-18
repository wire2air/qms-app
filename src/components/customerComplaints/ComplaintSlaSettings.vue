<script setup>
import { IconClockHour4 } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

/**
 * SLA & lifecycle settings — stored in company.settings.complaintSettings
 * (synced Company record, so the backend SLA scan / auto-close / follow-up
 * jobs read the same values agents see here).
 */
const toast = useToast()

const company = useLiveQueryWithDeps(
  [() => currentSession.value?.companyId],

  async (db, [companyId]) => {
    if (!companyId) return null
    return db.Company.findByPk(companyId)
  },
  { models: ['Company'] },
)

const DEFAULTS = {
  firstResponseHours: 24,
  resolutionHours: 72,
  autoCloseDays: 7,
  followUpAfterDays: 30,
  // QMS: resolution target in DAYS, stamped on the complaint at Accept.
  resolutionDays: 0,
}
// Non-numeric QMS settings kept separate from the numeric clean loop below.
const BOOL_DEFAULTS = {
  // When on, Close routes to owner approval (PENDING_APPROVAL) and the owner
  // must e-sign to close.
  requireClosureApproval: false,
}

const draft = ref({ ...DEFAULTS, ...BOOL_DEFAULTS })

watch(
  company,
  (c) => {
    if (!c) return
    draft.value = { ...DEFAULTS, ...BOOL_DEFAULTS, ...(c.settings?.complaintSettings ?? {}) }
  },
  { immediate: true },
)

const saving = ref(false)

async function handleSave() {
  if (!company.value) return
  saving.value = true
  try {
    const clean = {}
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      const n = Number(draft.value[key])
      // resolutionDays may legitimately be 0 (no QMS target); others clamp > 0.
      clean[key] = Number.isFinite(n) && n >= 0 ? (key === 'resolutionDays' ? n : n > 0 ? n : fallback) : fallback
    }
    clean.requireClosureApproval = !!draft.value.requireClosureApproval
    company.value.settings = {
      ...(company.value.settings ?? {}),
      complaintSettings: clean,
    }
    await company.value.save()
    draft.value = { ...clean }
    toast.notify({ type: 'positive', message: 'SLA settings saved' })
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to save settings' })
  } finally {
    saving.value = false
  }
}

const FIELDS = [
  {
    key: 'firstResponseHours',
    label: 'First response target (hours)',
    hint: 'New tickets must get a first agent reply within this window. Breaches notify the assignee and company owners.',
  },
  {
    key: 'resolutionHours',
    label: 'Resolution target (hours)',
    hint: 'Tickets should be resolved within this window from creation.',
  },
  {
    key: 'resolutionDays',
    label: 'QMS resolution target (days)',
    hint: 'When a complaint is accepted, its resolution target date is stamped this many days out. 0 = no target.',
  },
  {
    key: 'autoCloseDays',
    label: 'Auto-close resolved tickets after (days)',
    hint: 'Resolved tickets with no customer reply are closed automatically after this many days.',
  },
  {
    key: 'followUpAfterDays',
    label: 'Follow-up window (days)',
    hint: 'A customer reply to a ticket closed longer than this creates a new follow-up ticket instead of reopening.',
  },
]
</script>

<template>
  <PageSection
    title="SLA &amp; Lifecycle"
    :icon="IconClockHour4"
    variant="card"
    class="tw:max-w-2xl"
  >
    <div class="tw:flex tw:flex-col tw:gap-4">
      <BaseField
        v-for="field in FIELDS"
        :key="field.key"
        v-slot="{ id: fieldId }"
        :label="field.label"
        :hint="field.hint"
      >
        <BaseTextInput :id="fieldId" v-model="draft[field.key]" type="number" class="tw:w-32" />
      </BaseField>

      <BaseField
        label="Require owner approval to close"
        hint="When on, closing a complaint routes to the owner for approval; the owner must e-sign (PIN) to close."
      >
        <BaseCheckbox v-model="draft.requireClosureApproval" label="Owner e-sign approval required on close" />
      </BaseField>

      <div class="tw:flex tw:justify-end tw:pt-2 tw:border-t tw:border-divider">
        <BaseButton variant="primary" :disabled="saving || !company" @click="handleSave">
          {{ saving ? 'Saving…' : 'Save Settings' }}
        </BaseButton>
      </div>
    </div>
  </PageSection>
</template>
