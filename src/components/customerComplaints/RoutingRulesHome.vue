<script setup>
import { IconRoute, IconPlus, IconPencil, IconTrash, IconX } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
// Routing rules are REST-managed admin config.
// TODO(form-migration): RoutingRule CRUD still on @/api — convert to syncEngine in a follow-up.
import { get, post, put, del } from '@/api'
import { required } from '@shared/components/form/validators.js'

/**
 * Ticket routing rules (Complaint Settings → Routing). Zendesk-trigger
 * style: IF condition groups (ALL = AND, ANY = OR) THEN actions,
 * evaluated on ticket created / customer reply, in position order.
 */
const toast = useToast()
const { confirm } = useConfirm()

const loading = ref(true)
const rules = ref([])

async function load() {
  loading.value = true
  try {
    const data = await get('/v1/services/customerComplaints/routingRules', { showError: false })
    rules.value = data.rules ?? []
  } catch {
    // tab shows empty on failure
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ─── Field / operator / action vocabulary ─────────────────────────────────────
const CONDITION_FIELDS = [
  { id: 'priorityId', name: 'Priority' },
  { id: 'sourceId', name: 'Source' },
  { id: 'statusId', name: 'Status' },
  { id: 'sentiment', name: 'Sentiment' },
  { id: 'formId', name: 'Form' },
  { id: 'channelId', name: 'Email channel' },
  { id: 'subject', name: 'Subject' },
  { id: 'description', name: 'Description' },
  { id: 'customerEmail', name: 'Customer email' },
  { id: 'assignedTo', name: 'Assignee' },
  { id: 'assignedTeamId', name: 'Group' },
]
const OPERATORS = [
  { id: 'eq', name: 'is' },
  { id: 'neq', name: 'is not' },
  { id: 'contains', name: 'contains' },
  { id: 'not_contains', name: 'does not contain' },
  { id: 'in', name: 'is one of (comma-separated)' },
  { id: 'is_set', name: 'is set' },
  { id: 'not_set', name: 'is not set' },
]
const ACTION_TYPES = [
  { id: 'ASSIGN_USER', name: 'Assign to agent' },
  { id: 'ASSIGN_TEAM', name: 'Assign to group' },
  { id: 'SET_PRIORITY', name: 'Set priority' },
  { id: 'SET_SENTIMENT', name: 'Set sentiment' },
  { id: 'CLOSE', name: 'Close ticket' },
  { id: 'FLAG_SPAM', name: 'Flag as spam' },
  { id: 'NOTIFY_USER', name: 'Notify user' },
]
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => ({
  id: p,
  name: p.charAt(0) + p.slice(1).toLowerCase(),
}))
const SENTIMENTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'URGENT'].map((p) => ({
  id: p,
  name: p.charAt(0) + p.slice(1).toLowerCase(),
}))
const EVENTS = [
  { id: 'CREATED', name: 'Ticket created' },
  { id: 'CUSTOMER_REPLY', name: 'Customer reply' },
  { id: 'UPDATED', name: 'Ticket updated' },
]

function fieldLabel(id) {
  return CONDITION_FIELDS.find((f) => f.id === id)?.name ?? id
}
function opLabel(id) {
  return OPERATORS.find((o) => o.id === id)?.name ?? id
}
function actionLabel(action) {
  return ACTION_TYPES.find((a) => a.id === action.type)?.name ?? action.type
}

function summarizeConditions(rule) {
  const parts = []
  for (const c of rule.conditions?.all ?? []) {
    parts.push(`${fieldLabel(c.field)} ${opLabel(c.op)} ${c.value ?? ''}`)
  }
  if (rule.conditions?.any?.length) {
    parts.push(
      `(${rule.conditions.any.map((c) => `${fieldLabel(c.field)} ${opLabel(c.op)} ${c.value ?? ''}`).join(' OR ')})`,
    )
  }
  return parts.join(' AND ') || '—'
}

// ─── Edit dialog ──────────────────────────────────────────────────────────────
const showEditDialog = ref(false)
const editing = ref(null)
const draft = ref(makeDraft(null))
const saving = ref(false)
const saveError = ref('')
const formRef = ref(null)

function makeDraft(rule) {
  return {
    name: rule?.name ?? '',
    triggerEvents: [...(rule?.triggerEvents ?? ['CREATED'])],
    all: (rule?.conditions?.all ?? []).map((c) => ({ ...c })),
    any: (rule?.conditions?.any ?? []).map((c) => ({ ...c })),
    actions: (rule?.actions ?? []).map((a) => ({ ...a })),
    stateId: rule?.stateId ?? 'ACTIVE',
    position: rule?.position ?? 1000,
  }
}

function onCreate() {
  editing.value = null
  draft.value = makeDraft(null)
  draft.value.all = [{ field: 'priorityId', op: 'eq', value: '' }]
  draft.value.actions = [{ type: 'ASSIGN_TEAM', teamId: null }]
  saveError.value = ''
  showEditDialog.value = true
}

function onEdit(rule) {
  editing.value = rule
  draft.value = makeDraft(rule)
  saveError.value = ''
  showEditDialog.value = true
}

function addCondition(group) {
  draft.value[group].push({ field: 'priorityId', op: 'eq', value: '' })
}
function removeCondition(group, index) {
  draft.value[group].splice(index, 1)
}
function addAction() {
  draft.value.actions.push({ type: 'SET_PRIORITY', priorityId: 'HIGH' })
}
function removeAction(index) {
  draft.value.actions.splice(index, 1)
}
function toggleEvent(eventId) {
  const idx = draft.value.triggerEvents.indexOf(eventId)
  if (idx === -1) draft.value.triggerEvents.push(eventId)
  else if (draft.value.triggerEvents.length > 1) draft.value.triggerEvents.splice(idx, 1)
}

function needsValue(op) {
  return !['is_set', 'not_set'].includes(op)
}

async function onValidSubmit() {
  if (!draft.value.all.length && !draft.value.any.length) {
    saveError.value = 'Add at least one condition'
    return
  }
  if (!draft.value.actions.length) {
    saveError.value = 'Add at least one action'
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const payload = {
      name: draft.value.name.trim(),
      triggerEvents: draft.value.triggerEvents,
      conditions: { all: draft.value.all, any: draft.value.any },
      actions: draft.value.actions,
      stateId: draft.value.stateId,
      position: draft.value.position,
    }
    const data = editing.value
      ? await put(`/v1/services/customerComplaints/routingRules/${editing.value.id}`, payload)
      : await post('/v1/services/customerComplaints/routingRules', payload)
    rules.value = data.rules ?? []
    showEditDialog.value = false
  } catch (e) {
    saveError.value = e.message || 'Failed to save rule'
  } finally {
    saving.value = false
  }
}

async function toggleRuleState(rule) {
  try {
    const data = await put(`/v1/services/customerComplaints/routingRules/${rule.id}`, {
      stateId: rule.stateId === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
    })
    rules.value = data.rules ?? []
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed' })
  }
}

async function handleDelete(rule) {
  if (
    !(await confirm({
      title: 'Delete Routing Rule',
      message: `Delete rule "${rule.name}"?`,
      okLabel: 'Delete',
      danger: true,
    }))
  )
    return
  try {
    const data = await del(`/v1/services/customerComplaints/routingRules/${rule.id}`)
    rules.value = data.rules ?? []
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to delete' })
  }
}
</script>

<template>
  <PageSection title="Ticket Routing Rules" :icon="IconRoute" variant="card">
    <template #actions>
      <BaseButton variant="primary" size="sm" @click="onCreate">
        <IconPlus :size="16" class="tw:mr-1" />
        New rule
      </BaseButton>
    </template>

    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      IF conditions match THEN actions run — evaluated in order when a ticket is created or a
      customer replies. Example: <em>IF priority is Critical THEN assign QA Team</em>.
    </p>

    <div v-if="loading" class="tw:text-sm tw:text-secondary">Loading…</div>
    <div v-else-if="!rules.length" class="tw:text-sm tw:text-secondary tw:italic">
      No routing rules yet.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="rule in rules"
        :key="rule.id"
        class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
      >
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-sm tw:font-medium">{{ rule.name }}</span>
            <BaseBadge
              :class="
                rule.stateId === 'ACTIVE'
                  ? 'tw:bg-green-100 tw:text-green-700'
                  : 'tw:bg-gray-100 tw:text-gray-600'
              "
              class="tw:text-micro tw:cursor-pointer"
              @click="toggleRuleState(rule)"
            >
              {{ rule.stateId === 'ACTIVE' ? 'Active' : 'Disabled' }}
            </BaseBadge>
            <span class="tw:text-micro tw:text-secondary">
              on {{ rule.triggerEvents.join(', ') }}
            </span>
          </div>
          <div class="tw:text-xs tw:text-secondary tw:truncate">
            IF {{ summarizeConditions(rule) }} → {{ rule.actions.map(actionLabel).join(', ') }}
          </div>
        </div>
        <button class="tw:text-secondary tw:hover:text-primary" @click="onEdit(rule)">
          <IconPencil :size="16" />
        </button>
        <button class="tw:text-secondary tw:hover:text-red-600" @click="handleDelete(rule)">
          <IconTrash :size="16" />
        </button>
      </div>
    </div>

    <!-- Edit dialog -->
    <BaseDialog
      v-model="showEditDialog"
      :title="editing ? 'Edit Routing Rule' : 'New Routing Rule'"
      maxWidth="2xl"
    >
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Rule name" required :value="draft.name" :rules="[required()]">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="draft.name"
                  placeholder="e.g. Critical → QA Team"
                />
              </template>
            </BaseField>
            <BaseField label="Run when">
              <div class="tw:flex tw:flex-wrap tw:gap-2">
                <BaseButton
                  v-for="event in EVENTS"
                  :key="event.id"
                  size="sm"
                  :variant="draft.triggerEvents.includes(event.id) ? 'primary' : 'outline'"
                  @click="toggleEvent(event.id)"
                >
                  {{ event.name }}
                </BaseButton>
              </div>
            </BaseField>
          </div>

          <!-- Conditions -->
          <div v-for="group in ['all', 'any']" :key="group" class="tw:flex tw:flex-col tw:gap-2">
            <div class="tw:flex tw:items-center tw:justify-between">
              <BaseText variant="overline">
                {{ group === 'all' ? 'Match ALL of (AND)' : 'Match ANY of (OR)' }}
              </BaseText>
              <BaseButton variant="outline" size="sm" @click="addCondition(group)">
                <IconPlus :size="12" class="tw:mr-1" /> Condition
              </BaseButton>
            </div>
            <div
              v-for="(condition, index) in draft[group]"
              :key="index"
              class="tw:flex tw:flex-wrap tw:items-center tw:gap-2"
            >
              <BaseSelect
                v-model="condition.field"
                :options="CONDITION_FIELDS"
                optionLabel="name"
                optionValue="id"
                required
                class="tw:w-40"
              />
              <BaseSelect
                v-model="condition.op"
                :options="OPERATORS"
                optionLabel="name"
                optionValue="id"
                required
                class="tw:w-40"
              />
              <BaseTextInput
                v-if="needsValue(condition.op)"
                v-model="condition.value"
                placeholder="value"
                class="tw:flex-1 tw:min-w-32"
              />
              <span v-else class="tw:flex-1" />
              <button
                class="tw:text-secondary tw:hover:text-red-600"
                @click="removeCondition(group, index)"
              >
                <IconX :size="14" />
              </button>
            </div>
            <p v-if="!draft[group].length" class="tw:text-xs tw:text-secondary tw:italic">
              No {{ group === 'all' ? 'AND' : 'OR' }} conditions.
            </p>
          </div>

          <!-- Actions -->
          <div class="tw:flex tw:flex-col tw:gap-2">
            <div class="tw:flex tw:items-center tw:justify-between">
              <BaseText variant="overline">Then (actions)</BaseText>
              <BaseButton variant="outline" size="sm" @click="addAction">
                <IconPlus :size="12" class="tw:mr-1" /> Action
              </BaseButton>
            </div>
            <div
              v-for="(action, index) in draft.actions"
              :key="index"
              class="tw:flex tw:flex-wrap tw:items-center tw:gap-2"
            >
              <BaseSelect
                v-model="action.type"
                :options="ACTION_TYPES"
                optionLabel="name"
                optionValue="id"
                required
                class="tw:w-44"
              />
              <UserSelectMenu
                v-if="['ASSIGN_USER', 'NOTIFY_USER'].includes(action.type)"
                v-model="action.userId"
                required
                class="tw:flex-1 tw:min-w-40"
              />
              <GroupSelectMenu
                v-else-if="action.type === 'ASSIGN_TEAM'"
                v-model="action.teamId"
                required
                class="tw:flex-1 tw:min-w-40"
              />
              <BaseSelect
                v-else-if="action.type === 'SET_PRIORITY'"
                v-model="action.priorityId"
                :options="PRIORITIES"
                optionLabel="name"
                optionValue="id"
                required
                placeholder="Select priority"
                class="tw:flex-1 tw:min-w-40"
              />
              <BaseSelect
                v-else-if="action.type === 'SET_SENTIMENT'"
                v-model="action.sentiment"
                :options="SENTIMENTS"
                optionLabel="name"
                optionValue="id"
                required
                placeholder="Select sentiment"
                class="tw:flex-1 tw:min-w-40"
              />
              <span v-else class="tw:flex-1" />
              <button class="tw:text-secondary tw:hover:text-red-600" @click="removeAction(index)">
                <IconX :size="14" />
              </button>
            </div>
          </div>
        </div>
      </BaseForm>

      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Save Rule"
          :loading="saving"
          :error="saveError"
          @cancel="close"
          @submit="formRef.submit()"
        />
      </template>
    </BaseDialog>
  </PageSection>
</template>
