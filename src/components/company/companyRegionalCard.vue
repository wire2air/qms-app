<script setup>
import { currentCompany } from '@/utils/currentCompany.js'

const company = useLiveQueryWithDeps(
  [() => currentCompany.value?.id],
  async (db, [id]) => {
    if (!id) return null
    return db.Company.findByPk(id)
  },
  { models: ['Company'] },
)

const isSaving = ref(false)
const saveError = ref(null)
const isFirstChange = ref(true)

const debouncedSave = useDebounceFn(async () => {
  if (!company.value) return
  isSaving.value = true
  saveError.value = null
  try {
    await company.value.save()
  } catch (err) {
    saveError.value = err.message || 'Failed to save'
  } finally {
    isSaving.value = false
  }
}, 500)

watch([() => company.value?.defaultTimeZone, () => company.value?.defaultFirstDayOfWeek], () => {
  if (isFirstChange.value) {
    isFirstChange.value = false
    return
  }
  debouncedSave()
})

const firstDayOfWeekOptions = [
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
  { label: 'Sunday', value: 0 },
]
</script>

<template>
  <div
    v-if="company"
    class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Regional Settings</h2>
      <CompanyCardSaveStatus :saving="isSaving" :error="saveError" />
    </div>

    <div class="tw:p-6 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-6">
      <TimezoneDropdown
        v-model="company.defaultTimeZone"
        label="Default Time Zone"
        hint="Used for timestamps and scheduling"
      />

      <BaseField v-slot="{ id: fieldId }" label="First Day of Week" hint="Used for calendar views">
        <select
          :id="fieldId"
          v-model.number="company.defaultFirstDayOfWeek"
          class="tw:w-full tw:px-3 tw:py-2 tw:text-sm tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:text-on-main tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary"
        >
          <option v-for="opt in firstDayOfWeekOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </BaseField>
    </div>
  </div>
</template>
