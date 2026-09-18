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

watch(
  () => company.value?.name,
  () => {
    if (isFirstChange.value) {
      isFirstChange.value = false
      return
    }
    debouncedSave()
  },
)
</script>

<template>
  <div
    v-if="company"
    class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar"
  >
    <BaseSectionHeader
      title="General Information"
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #actions>
        <CompanyCardSaveStatus :saving="isSaving" :error="saveError" />
      </template>
    </BaseSectionHeader>

    <div class="tw:p-6 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-6">
      <BaseTextInput v-model="company.name" label="Company Name" placeholder="Enter company name" />

      <BaseTextInput
        v-model="company.code"
        label="Company Code"
        placeholder="Company code"
        :disabled="true"
        class="tw:opacity-70"
        hint="System-generated code (read-only)"
      />
    </div>
  </div>
</template>
