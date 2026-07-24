<script setup>
/**
 * Read-only card for the GLOBAL Countries & Regions lookups (Settings →
 * Lookups). The full ISO 3166-1 list ships with the platform (companyId NULL
 * rows) — nothing for a tenant to maintain, so no add/edit/deactivate.
 */
import { IconWorld } from '@tabler/icons-vue'

const search = ref('')

const regions = useLiveQuery(
  async (db) =>
    (await db.Region.where().exec()).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
  { models: ['Region'], initial: [] },
)
const countries = useLiveQueryWithDeps(
  [() => search.value],
  async (db, [q]) => {
    let rows = await db.Country.where().exec()
    if (q) {
      const needle = q.toLowerCase()
      rows = rows.filter(
        (c) => c.name?.toLowerCase().includes(needle) || c.code?.toLowerCase().includes(needle),
      )
    }
    return rows.sort(
      (a, b) =>
        (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
        (a.name || '').localeCompare(b.name || ''),
    )
  },
  { models: ['Country'], initial: [] },
)
const regionName = (id) => regions.value.find((r) => r.id === id)?.name || '—'

const columns = [
  { name: 'name', label: 'COUNTRY', field: 'name', align: 'left' },
  { name: 'code', label: 'CODE', field: 'code', align: 'left' },
  { name: 'region', label: 'REGION', field: 'regionId', align: 'left' },
]
</script>

<template>
  <div class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar">
    <BaseSectionHeader
      title="Countries & Regions"
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #subtitle>
        Global reference data — the full ISO country list ({{ countries.length }} countries,
        {{ regions.length }} regions) is maintained by the platform. Nothing to set up per company.
      </template>
      <template #actions>
        <span class="tw:text-micro tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-1 tw:bg-indigo-100 tw:text-indigo-700">
          <IconWorld :size="12" class="tw:inline tw:mr-0.5" /> Global
        </span>
      </template>
    </BaseSectionHeader>

    <div class="tw:p-4 tw:flex tw:flex-col tw:gap-3">
      <BaseFilterBar v-model:search="search" searchPlaceholder="Search countries…" />
      <DataTable
        :rows="countries"
        :columns="columns"
        rowKey="id"
        :mobileCards="false"
        hidePagination
        noDataLabel="No countries match."
      >
        <template #body-cell-name="{ row }">
          <span class="tw:font-medium tw:text-on-sidebar">{{ row.name }}</span>
        </template>
        <template #body-cell-code="{ row }">
          <code class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-main-hover tw:text-secondary">{{ row.code }}</code>
        </template>
        <template #body-cell-region="{ row }">
          <span class="tw:text-sm tw:text-secondary">{{ regionName(row.regionId) }}</span>
        </template>
      </DataTable>
    </div>
  </div>
</template>
