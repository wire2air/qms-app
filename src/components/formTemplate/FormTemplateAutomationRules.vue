<script setup>
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-vue'
import AutomationRuleBuilder from '@/components/automationRules/AutomationRuleBuilder.vue'
import { moduleAutomationFields, ACTION_LABEL, AUTOMATION_TRIGGERS } from '@/utils/automationObjects'

// Automation rules for a single module form. The rule's objectType is the
// module's internalName; conditions use the form's own fields + a few first-class
// fields (Status, Date Created/Completed, Due Date). Reuses the generic builder
// in "module mode".
const props = defineProps({
  templateId: { type: String, required: true },
})

const template = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => (id ? db.FormTemplate.findByPk(id) : null),
  { models: ['FormTemplate'] },
)
const objectType = computed(() => template.value?.internalName || '')
const moduleFields = computed(() =>
  moduleAutomationFields(template.value?.schema || [], template.value?.moduleConfig || null),
)

const rules = useLiveQueryWithDeps(
  [() => objectType.value],
  async (db, [ot]) => {
    if (!ot) return []
    const all = await db.AutomationRule.where().exec()
    return all.filter((r) => r.objectType === ot)
  },
  { models: ['AutomationRule'], initial: [] },
)

const triggerLabel = (t) => AUTOMATION_TRIGGERS.find((x) => x.value === t)?.label || t
const actionsLabel = (r) =>
  (r.actions || []).map((a) => ACTION_LABEL[a.type] || a.type).join(', ') || 'No actions'

const showBuilder = ref(false)
const editingId = ref(null)
function newRule() {
  editingId.value = null
  showBuilder.value = true
}
function editRule(r) {
  editingId.value = r.id
  showBuilder.value = true
}

const deleteRule = useLiveMutation(async (db, id) => {
  const r = await db.AutomationRule.findByPk(id)
  if (r) await r.delete()
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
      <p class="tw:text-sm tw:text-secondary">
        Notify people when this module's records change. Conditions use the form's fields plus
        Status, Date Created, Date Completed and Due Date.
      </p>
      <BaseButton variant="primary" size="sm" :disabled="!objectType" @click="newRule">
        <IconPlus :size="14" class="tw:mr-1" /> New rule
      </BaseButton>
    </div>

    <p v-if="!rules.length" class="tw:text-sm tw:text-secondary tw:italic tw:py-2">
      No automation rules yet.
    </p>
    <div
      v-for="r in rules"
      :key="r.id"
      class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:p-3"
    >
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:flex tw:items-center tw:gap-2">
          <span class="tw:font-medium tw:text-on-main tw:truncate">{{ r.name }}</span>
          <span
            v-if="!r.isActive"
            class="tw:text-micro tw:rounded tw:bg-gray-100 tw:text-gray-600 tw:px-1.5 tw:py-0.5"
          >
            Off
          </span>
        </div>
        <div class="tw:text-xs tw:text-secondary">
          {{ triggerLabel(r.trigger) }} · {{ actionsLabel(r) }}
        </div>
      </div>
      <button
        class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-primary"
        title="Edit"
        @click="editRule(r)"
      >
        <IconPencil :size="16" />
      </button>
      <button
        class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-red-600"
        title="Delete"
        @click="deleteRule(r.id)"
      >
        <IconTrash :size="16" />
      </button>
    </div>

    <AutomationRuleBuilder
      v-model="showBuilder"
      :ruleId="editingId"
      :fixedObjectType="objectType"
      :moduleFields="moduleFields"
    />
  </div>
</template>
