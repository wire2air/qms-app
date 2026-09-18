<script setup>
import { IconMessageReport } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

/**
 * QMS Complaint settings — resolution SLA, stored in
 * company.settings.qualityComplaintSettings (synced Company record, so the
 * backend resolution-target calc reads the same value). Separate key from the
 * support module's complaintSettings.
 */
const toast = useToast()

const company = useLiveQueryWithDeps(
  [() => currentSession.value?.companyId],
  async (db, [companyId]) => (companyId ? db.Company.findByPk(companyId) : null),
  { models: ['Company'] },
)

// resolutionDays wins when > 0; else resolutionHours; else the backend default (72h).
const DEFAULTS = { resolutionDays: 0, resolutionHours: 72 }
const draft = ref({ ...DEFAULTS })

watch(
  company,
  (c) => {
    if (!c) return
    draft.value = { ...DEFAULTS, ...(c.settings?.qualityComplaintSettings ?? {}) }
  },
  { immediate: true },
)

const saving = ref(false)

async function handleSave() {
  if (!company.value) return
  saving.value = true
  try {
    const clean = {
      resolutionDays: Math.max(0, Number(draft.value.resolutionDays) || 0),
      resolutionHours: Math.max(0, Number(draft.value.resolutionHours) || 0),
    }
    company.value.settings = {
      ...(company.value.settings ?? {}),
      qualityComplaintSettings: clean,
    }
    await company.value.save()
    draft.value = { ...clean }
    toast.notify({ type: 'positive', message: 'Complaint settings saved' })
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to save settings' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseCard>
    <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
      <IconMessageReport :size="18" class="tw:text-secondary" />
      <h3 class="tw:text-base tw:font-semibold tw:text-on-main">Complaints</h3>
    </div>
    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      Resolution SLA for quality complaints. The resolution target is stamped at
      create as the open date plus this SLA (days preferred; otherwise hours).
    </p>
    <div class="tw:flex tw:flex-col tw:gap-4 tw:max-w-md">
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
        <label class="tw:text-sm tw:text-on-main">Resolution target (days)</label>
        <BaseTextInput v-model="draft.resolutionDays" type="number" class="tw:w-32" />
      </div>
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
        <label class="tw:text-sm tw:text-on-main">Resolution target (hours, fallback)</label>
        <BaseTextInput v-model="draft.resolutionHours" type="number" class="tw:w-32" />
      </div>
      <div class="tw:flex tw:justify-end">
        <BaseButton variant="primary" :loading="saving" @click="handleSave">Save</BaseButton>
      </div>
    </div>
  </BaseCard>
</template>
