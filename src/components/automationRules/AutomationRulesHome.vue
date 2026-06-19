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

    <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead>
          <tr class="tw:text-left tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wider tw:border-b tw:border-divider">
            <th class="tw:px-4 tw:py-2.5">Rule</th>
            <th class="tw:px-4 tw:py-2.5">Object</th>
            <th class="tw:px-4 tw:py-2.5">Trigger</th>
            <th class="tw:px-4 tw:py-2.5 tw:text-center">Conditions</th>
            <th class="tw:px-4 tw:py-2.5">Actions</th>
            <th class="tw:px-4 tw:py-2.5 tw:text-center">Active</th>
            <th class="tw:px-4 tw:py-2.5 tw:text-right"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rule in rules" :key="rule.id" class="tw:border-b tw:border-divider">
            <td class="tw:px-4 tw:py-3 tw:font-medium tw:text-on-sidebar">{{ rule.name }}</td>
            <td class="tw:px-4 tw:py-3 tw:text-secondary">{{ OBJECT_BY_VALUE[rule.objectType]?.label || rule.objectType }}</td>
            <td class="tw:px-4 tw:py-3 tw:text-secondary">{{ triggerLabel[rule.trigger] || rule.trigger }}</td>
            <td class="tw:px-4 tw:py-3 tw:text-center tw:text-secondary">{{ conditionCount(rule) }}</td>
            <td class="tw:px-4 tw:py-3 tw:text-secondary tw:text-xs">{{ actionSummary(rule) }}</td>
            <td class="tw:px-4 tw:py-3 tw:text-center">
              <BaseSwitch :modelValue="rule.isActive" @update:modelValue="() => toggleActive(rule)" />
            </td>
            <td class="tw:px-4 tw:py-3 tw:text-right">
              <div class="tw:flex tw:items-center tw:justify-end tw:gap-1">
                <button class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-primary" title="Edit" @click="openEdit(rule)">
                  <IconPencil :size="16" />
                </button>
                <button class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-red-600" title="Delete" @click="onDelete(rule)">
                  <IconTrash :size="16" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!rules.length">
            <td colspan="7" class="tw:px-4 tw:py-8 tw:text-center tw:text-sm tw:text-secondary tw:italic">
              No automation rules yet. Create one to notify people or auto-create records when conditions match.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AutomationRuleBuilder v-model="showBuilder" :ruleId="editingId" @saved="showBuilder = false" />
  </BasePage>
</template>
