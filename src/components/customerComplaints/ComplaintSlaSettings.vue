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
)

const DEFAULTS = {
  firstResponseHours: 24,
  resolutionHours: 72,
  autoCloseDays: 7,
  followUpAfterDays: 30,
}

const draft = ref({ ...DEFAULTS })

watch(
  company,
  (c) => {
    if (!c) return
    draft.value = { ...DEFAULTS, ...(c.settings?.complaintSettings ?? {}) }
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
      clean[key] = Number.isFinite(n) && n > 0 ? n : fallback
    }
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
  <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:max-w-2xl">
    <div
      class="tw:flex tw:items-center tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <IconClockHour4 :size="18" class="tw:text-primary" />
      <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
        SLA &amp; Lifecycle
      </div>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-4">
      <div v-for="field in FIELDS" :key="field.key" class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium">{{ field.label }}</label>
        <BaseTextInput v-model="draft[field.key]" type="number" class="tw:w-32" />
        <p class="tw:text-xs tw:text-secondary">{{ field.hint }}</p>
      </div>

      <div class="tw:flex tw:justify-end tw:pt-2 tw:border-t tw:border-divider">
        <BaseButton variant="primary" :disabled="saving || !company" @click="handleSave">
          {{ saving ? 'Saving…' : 'Save Settings' }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
