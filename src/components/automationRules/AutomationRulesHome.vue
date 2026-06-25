<script setup>
import { IconBolt, IconPencil, IconTrash } from '@tabler/icons-vue'
import { OBJECT_BY_VALUE, ACTION_LABEL, AUTOMATION_TRIGGERS } from '@/utils/automationObjects'

const toast = useToast()
const { confirm } = useConfirm()

const rules = useLiveQuery((db) => db.AutomationRule.where().orderBy('createdAt', 'desc').exec(), {
  models: ['AutomationRule'],
  initial: [],
})

const showBuilder = ref(false)
const editingId = ref(null)

function openNew() {
  editingId.value = null
  showBuilder.value = true
}
function openEdit(rule) {
  editingId.value = rule.id
  showBuilder.value = true
}

const triggerLabel = Object.fromEntries(AUTOMATION_TRIGGERS.map((t) => [t.value, t.label]))

const OBJECT_OPTIONS = Object.entries(OBJECT_BY_VALUE).map(([value, o]) => ({
  value,
  label: o?.label || value,
}))
const TRIGGER_OPTIONS = AUTOMATION_TRIGGERS.map((t) => ({ value: t.value, label: t.label }))

const columns = [
  { name: 'name', label: 'Rule', field: 'name', align: 'left', sortable: true },
  {
    name: 'object',
    label: 'Object',
    field: 'objectType',
    align: 'left',
    filterType: 'select',
    filterOptions: OBJECT_OPTIONS,
  },
  {
    name: 'trigger',
    label: 'Trigger',
    field: 'trigger',
    align: 'left',
    filterType: 'select',
    filterOptions: TRIGGER_OPTIONS,
  },
  { name: 'conditions', label: 'Conditions', field: conditionCount, align: 'center', filterType: 'number' },
  { name: 'actionSummary', label: 'Actions', field: actionSummary, align: 'left', filterType: false },
  { name: 'active', label: 'Active', field: 'isActive', align: 'center', filterType: false },
  { name: 'actions', label: '', field: 'actions', align: 'right', filterType: false },
]

function actionSummary(rule) {
  const list = Array.isArray(rule.actions) ? rule.actions : []
  if (!list.length) return '—'
  return list.map((a) => ACTION_LABEL[a.type] || a.type).join(', ')
}
function conditionCount(rule) {
  return Array.isArray(rule.conditionTree?.conditions) ? rule.conditionTree.conditions.length : 0
}

async function toggleActive(rule) {
  try {
    rule.isActive = !rule.isActive
    await rule.save()
  } catch (e) {
    toast.error(e.message || 'Failed to update')
  }
}

async function onDelete(rule) {
  if (!(await confirm({ title: 'Delete rule', message: `Delete "${rule.name}"?`, okLabel: 'Delete', danger: true }))) return
  try {
    await rule.delete()
    toast.success('Rule deleted')
  } catch (e) {
    toast.error(e.message || 'Failed to delete')
  }
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconBolt"
      title="Automation Rules"
      subtitle="Condition-based notifications & automations — when an object matches your conditions, run actions."
    >
      <template #actions>
        <BaseButton variant="primary" @click="openNew">New Rule</BaseButton>
      </template>
    </PageHeader>

    <DataTable
      :rows="rules"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      searchable
      filterable
      densitySelector
      columnManager
      exportManager
      exportFilename="automation-rules.csv"
      persistKey="automationRules:list"
      noDataLabel="No automation rules yet. Create one to notify people or auto-create records when conditions match."
    >
      <template #toolbar-left>
        <span class="tw:text-sm tw:text-secondary">{{ rules.length }} rule(s)</span>
      </template>

      <template #body-cell-name="{ row }">
        <span class="tw:font-medium tw:text-on-main">{{ row.name }}</span>
      </template>

      <template #body-cell-object="{ row }">
        <span class="tw:text-secondary">{{ OBJECT_BY_VALUE[row.objectType]?.label || row.objectType }}</span>
      </template>

      <template #body-cell-trigger="{ row }">
        <span class="tw:text-secondary">{{ triggerLabel[row.trigger] || row.trigger }}</span>
      </template>

      <template #body-cell-conditions="{ row }">
        <span class="tw:text-secondary">{{ conditionCount(row) }}</span>
      </template>

      <template #body-cell-actionSummary="{ row }">
        <span class="tw:text-secondary tw:text-xs">{{ actionSummary(row) }}</span>
      </template>

      <template #body-cell-active="{ row }">
        <BaseSwitch :modelValue="row.isActive" @update:modelValue="() => toggleActive(row)" />
      </template>

      <template #body-cell-actions="{ row }">
        <div class="tw:flex tw:items-center tw:justify-end tw:gap-1">
          <button
            class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-primary"
            title="Edit"
            @click="openEdit(row)"
          >
            <IconPencil :size="16" />
          </button>
          <button
            class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-red-600"
            title="Delete"
            @click="onDelete(row)"
          >
            <IconTrash :size="16" />
          </button>
        </div>
      </template>
    </DataTable>

    <AutomationRuleBuilder v-model="showBuilder" :ruleId="editingId" @saved="showBuilder = false" />
  </BasePage>
</template>
