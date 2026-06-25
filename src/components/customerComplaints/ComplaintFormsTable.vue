<script setup>
import {
  IconPencil,
  IconCopy,
  IconExternalLink,
  IconCircleOff,
  IconCircleCheck,
  IconTrash,
} from '@tabler/icons-vue'

defineProps({
  forms: { type: Array, default: () => [] },
})

const emit = defineEmits(['edit', 'setState', 'delete'])

const toast = useToast()

function publicUrl(form) {
  return `${window.location.origin}/support/${form.slug}`
}

async function copyUrl(form) {
  await navigator.clipboard.writeText(publicUrl(form))
  toast.notify({ type: 'positive', message: 'Public form URL copied' })
}

function openPublicPage(form) {
  window.open(publicUrl(form), '_blank', 'noopener,noreferrer')
}

const columns = computed(() => {
  const filterCfg = {
    state: {
      filterType: 'select',
      filterOptions: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INACTIVE', label: 'Disabled' },
      ],
    },
    updatedAt: { filterType: 'date' },
  }
  return [
    { name: 'name', label: 'FORM', field: 'name', align: 'left', sortable: true },
    { name: 'url', label: 'PUBLIC URL', field: 'slug', align: 'left' },
    { name: 'template', label: 'CUSTOM FIELDS', field: 'fieldCount', align: 'left' },
    { name: 'state', label: 'STATUS', field: 'stateId', align: 'left' },
    { name: 'updatedAt', label: 'UPDATED', field: 'updatedAt', align: 'left', sortable: true },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'name', desc: false }])

function rowMenuItems(row) {
  return [
    { name: 'Edit', icon: IconPencil, click: () => emit('edit', row) },
    { name: 'Open public page', icon: IconExternalLink, click: () => openPublicPage(row) },
    row.stateId === 'ACTIVE'
      ? { name: 'Disable', icon: IconCircleOff, click: () => emit('setState', row, 'INACTIVE') }
      : { name: 'Enable', icon: IconCircleCheck, click: () => emit('setState', row, 'ACTIVE') },
    { name: 'Delete', icon: IconTrash, click: () => emit('delete', row) },
  ]
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    :rows="forms"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    filterable
    exportManager
    exportFilename="complaint-forms.csv"
  >
    <template #body-cell-name="{ row }">
      <div class="tw:flex tw:flex-col">
        <button
          class="tw:text-sm tw:font-medium tw:text-left tw:text-on-main tw:hover:text-primary"
          @click="emit('edit', row)"
        >
          {{ row.name }}
        </button>
        <span v-if="row.description" class="tw:text-xs tw:text-secondary tw:truncate">
          {{ row.description }}
        </span>
      </div>
    </template>

    <template #body-cell-url="{ row }">
      <div class="tw:flex tw:items-center tw:gap-1.5">
        <code class="tw:text-xs tw:font-mono tw:text-secondary tw:truncate">
          /support/{{ row.slug }}
        </code>
        <button class="tw:text-secondary tw:hover:text-primary tw:shrink-0" @click="copyUrl(row)">
          <IconCopy :size="14" />
        </button>
      </div>
    </template>

    <template #body-cell-template="{ row }">
      <span
        v-if="row.fieldCount"
        class="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-semibold tw:bg-primary/10 tw:text-primary"
      >
        {{ row.fieldCount === 1 ? '1 field' : `${row.fieldCount} fields` }}
      </span>
      <FormTemplateBadgeById
        v-else-if="row.formTemplateId"
        :formTemplateId="row.formTemplateId"
      />
      <span v-else class="tw:text-sm tw:text-secondary tw:italic">System fields only</span>
    </template>

    <template #body-cell-state="{ row }">
      <BaseBadge
        :class="
          row.stateId === 'ACTIVE'
            ? 'tw:bg-green-100 tw:text-green-700'
            : 'tw:bg-gray-100 tw:text-gray-600'
        "
      >
        {{ row.stateId === 'ACTIVE' ? 'Active' : 'Disabled' }}
      </BaseBadge>
    </template>

    <template #body-cell-updatedAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">
        {{ row.updatedAt?.formatDate?.('date') ?? '—' }}
      </span>
    </template>

    <template #body-cell-actions="{ row }">
      <div class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
