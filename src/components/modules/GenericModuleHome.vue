<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { IconForms, IconPlus } from '@tabler/icons-vue'

const props = defineProps({ moduleKey: { type: String, required: true } })
const router = useRouter()

const template = useLiveQueryWithDeps(
  [() => props.moduleKey],
  async (db, [key]) => {
    if (!key) return null
    const list = await db.FormTemplate.where('internalName', key).exec()
    return list.find((t) => t.isModule) || null
  },
  { models: ['FormTemplate'] },
)

const records = useLiveQueryWithDeps(
  [() => props.moduleKey],
  async (db, [key]) => {
    if (!key) return []
    const rows = await db.Record.where('moduleKey', key).exec()
    return rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  },
  { initial: [], models: ['Record'] },
)

const title = computed(
  () => template.value?.moduleConfig?.displayName || template.value?.title || 'Module',
)

const columns = [
  { name: 'recordNumber', label: 'NUMBER', field: 'recordNumber', align: 'left', sortable: true },
  { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
]

function create() {
  router.push(getCompanyPath(`/m/${props.moduleKey}/create`))
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconForms" :title="title">
      <template #actions>
        <BaseButton variant="primary" size="sm" @click="create">
          <template #icon><IconPlus :size="16" /></template>
          New {{ title }}
        </BaseButton>
      </template>
    </PageHeader>

    <DataTable :rows="records" :columns="columns" rowKey="id" searchable>
      <template #body-cell-recordNumber="{ row }">
        <RouterLink
          :to="getCompanyPath(`/m/${moduleKey}/${row.id}`)"
          class="tw:text-primary tw:font-medium tw:hover:underline"
        >
          {{ row.recordNumber }}
        </RouterLink>
      </template>
      <template #body-cell-statusId="{ row }">
        <RecordStatusBadgeById :statusId="row.statusId" />
      </template>
      <template #body-cell-createdAt="{ row }">
        {{ row.createdAt?.formatDate?.() ?? '—' }}
      </template>
    </DataTable>
  </BasePage>
</template>
