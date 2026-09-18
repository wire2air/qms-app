<script setup>
/**
 * "Add Step" wizard for the workflow template editor (user request 2026-08-12).
 * Replaces the old instant-create (a bare "Step N" dropped into the editor)
 * with a small guided widget:
 *
 *   1. What kind of step? Task (ACTION) · Approval · Schedule Task (a follow-up
 *      that activates later — e.g. an effectiveness check; DB value stays DELAY)
 *   2. Who works on it? Role assignment. Templates are role-only — the actual
 *      person is picked by the submitter when the workflow is attached to a
 *      record, so roles here just constrain the candidate pool (optional).
 *
 * A Task step is seeded with the standard task form (rich text + attachments)
 * — no form-picker screen. Asking "blank, a QMS preset, or a saved block?"
 * before the step is even named made you decide the form's design at the point
 * you had least context for it (user request 2026-08-15). Swapping in a block
 * or editing the fields still lives in the step editor's Task Form tab, which
 * is where you can see the step in context.
 *
 * The dialog only COLLECTS choices; the parent (WorkflowStepList) creates the
 * step + role rows on `submit`, so ordering/company-default logic stays where
 * it always lived.
 */
import {
  IconListCheck,
  IconRubberStamp,
  IconClockPause,
  IconHelpCircle,
  IconSearch,
} from '@tabler/icons-vue'
import { standardTaskForm } from '@/constants/formTemplates'
import { allowedStepTypes } from './workflowModule.js'

const props = defineProps({
  // workflow.moduleId — decides which step types this workflow may contain.
  // Approval-only modules (Log Book, Audit, QC, Document Control) skip the
  // type screen entirely: there's nothing to choose (2026-08-15).
  moduleId: { type: String, default: null },
})

const emit = defineEmits(['submit'])
const open = defineModel({ type: Boolean, default: false })

// "Effectiveness Check" is the user-facing name for the DELAY step type
// (renamed 2026-08-28; DB value stays DELAY) — the functionality is built
// around the effectiveness-check flow. It reads as a deferred verify, not
// a required "effectiveness check" — that's just the canonical example,
// carried in the tooltip-registry help copy.
const scheduleTaskHelp = useTooltipData().getFromTooltipData('workflow.scheduleTask', 'tooltip')

const STEP_TYPES = [
  {
    id: 'ACTION',
    label: 'Task',
    icon: IconListCheck,
    blurb: 'A work step. The assignee fills in a task form and marks it complete.',
    defaultName: 'Task',
    namePlaceholder: 'e.g. Peer Review',
  },
  {
    id: 'APPROVAL',
    label: 'Approval',
    icon: IconRubberStamp,
    blurb: 'A gate step — approvers review and sign off. Comment-only, no form.',
    defaultName: 'Approval',
    namePlaceholder: 'e.g. QA Approval',
  },
  {
    id: 'DELAY',
    label: 'Effectiveness Check',
    sublabel: 'Follow-up',
    icon: IconClockPause,
    blurb:
      'Want a follow-up later? Waits a set number of days, then assigns its task — e.g. an Effectiveness check.',
    defaultName: 'Effectiveness Check',
    namePlaceholder: 'e.g. Effectiveness Check',
    helpTooltip: true,
  },
]

const availableTypes = computed(() => {
  const allowed = allowedStepTypes(props.moduleId)
  return STEP_TYPES.filter((t) => allowed.includes(t.id))
})

// Only one type available (approval flows) → nothing to pick, so the type
// screen is skipped and that type is preselected.
const skipTypeScreen = computed(() => availableTypes.value.length <= 1)

// Task is the overwhelmingly common choice — preselect it so the wizard is one
// click shorter (the type screen still allows switching).
const stepType = ref('ACTION')
const name = ref('')
const roleIds = ref([])

// Wizard screens: type → assignees. A Task step's form is seeded, not chosen.
const screens = computed(() => [...(skipTypeScreen.value ? [] : ['type']), 'assignees'])
const screen = ref('type')
const screenIndex = computed(() => screens.value.indexOf(screen.value))

const SCREEN_LABELS = { type: 'Step type', assignees: 'Assignees' }

watch(open, (isOpen) => {
  if (!isOpen) return
  stepType.value = availableTypes.value[0]?.id ?? 'ACTION'
  name.value = ''
  roleIds.value = []
  screen.value = screens.value[0]
  roleSearch.value = ''
})

const canNext = computed(() => {
  if (screen.value === 'type') return !!stepType.value
  return true
})

const isLastScreen = computed(() => screenIndex.value === screens.value.length - 1)

function next() {
  if (!canNext.value || isLastScreen.value) return
  screen.value = screens.value[screenIndex.value + 1]
}

function back() {
  if (screenIndex.value === 0) return
  screen.value = screens.value[screenIndex.value - 1]
}

function finish() {
  if (!stepType.value) return
  const typeMeta = STEP_TYPES.find((t) => t.id === stepType.value)
  emit('submit', {
    stepType: stepType.value,
    name: name.value.trim() || typeMeta.defaultName,
    // Approval steps are comment-only; an Effectiveness Check's evidence form
    // is added later in the editor if it needs one.
    formSchema: stepType.value === 'ACTION' ? standardTaskForm() : [],
    // The type is PRESENTED as an Effectiveness Check, so the verdict capture
    // defaults ON (2026-08-28) — authors switch it off for a plain wait.
    ...(stepType.value === 'DELAY' ? { capturesEffectiveness: true } : {}),
    roleIds: [...roleIds.value],
  })
  open.value = false
}

// ── Assignee roles — collected locally (the step doesn't exist yet); the
// parent persists WorkflowStepRole rows after creating the step. ────────
const roleSearch = ref('')

const roles = useLiveQuery((db) => db.Role.where('statusId', 'ACTIVE').exec(), {
  models: ['Role'],
  initial: [],
})

const filteredRoles = computed(() => {
  const q = roleSearch.value.trim().toLowerCase()
  if (!q) return roles.value
  return roles.value.filter((r) => r.name.toLowerCase().includes(q))
})

const selectedRoles = computed(() => roles.value.filter((r) => roleIds.value.includes(r.id)))

function toggleRole(roleId) {
  if (roleIds.value.includes(roleId)) {
    roleIds.value = roleIds.value.filter((id) => id !== roleId)
  } else {
    roleIds.value = [...roleIds.value, roleId]
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Add Step" maxWidth="2xl">
    <div class="tw:flex tw:flex-col tw:gap-5 tw:p-1">
      <!-- Progress — numbered chips for the screens THIS type goes through -->
      <div class="tw:flex tw:items-center tw:gap-2">
        <template v-for="(s, i) in screens" :key="s">
          <div class="tw:flex tw:items-center tw:gap-1.5">
            <span
              class="tw:flex tw:items-center tw:justify-center tw:w-5 tw:h-5 tw:rounded-full tw:text-micro tw:font-bold"
              :class="
                i <= screenIndex
                  ? 'tw:bg-primary tw:text-white'
                  : 'tw:bg-main-hover tw:text-secondary'
              "
            >
              {{ i + 1 }}
            </span>
            <span
              class="tw:text-xs tw:font-semibold"
              :class="i === screenIndex ? 'tw:text-on-main' : 'tw:text-secondary'"
            >
              {{ SCREEN_LABELS[s] }}
            </span>
          </div>
          <div
            v-if="i < screens.length - 1"
            class="tw:flex-1 tw:h-px tw:bg-divider tw:min-w-4"
          ></div>
        </template>
      </div>

      <!-- ── Screen 1: step type + name ─────────────────────────────── -->
      <div v-if="screen === 'type'" class="tw:flex tw:flex-col tw:gap-4">
        <p class="tw:text-sm tw:text-secondary">
          What kind of step is this? You can fine-tune everything afterwards in the step editor.
        </p>
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-3 tw:gap-3">
          <BaseClickableRow
            v-for="t in availableTypes"
            :key="t.id"
            class="tw:flex tw:flex-col tw:items-start tw:gap-2 tw:p-4 tw:border-2 tw:rounded-xl tw:transition-all"
            :class="
              stepType === t.id
                ? 'tw:border-primary tw:bg-primary/5 tw:ring-1 tw:ring-primary/20'
                : 'tw:border-divider tw:hover:border-primary/50 tw:hover:bg-main-hover'
            "
            :aria-label="`Step type ${t.label}`"
            @click="stepType = t.id"
          >
            <component
              :is="t.icon"
              :size="24"
              :class="stepType === t.id ? 'tw:text-primary' : 'tw:text-secondary'"
            />
            <div>
              <span
                class="tw:text-sm tw:font-bold tw:flex tw:items-center tw:gap-1"
                :class="stepType === t.id ? 'tw:text-primary' : 'tw:text-on-main'"
              >
                {{ t.label }}
                <BaseTooltip v-if="t.helpTooltip" :content="scheduleTaskHelp">
                  <IconHelpCircle :size="13" class="tw:text-secondary" />
                </BaseTooltip>
              </span>
              <span v-if="t.sublabel" class="tw:text-micro tw:text-secondary tw:block">
                {{ t.sublabel }}
              </span>
            </div>
            <span class="tw:text-micro tw:leading-tight tw:text-secondary">{{ t.blurb }}</span>
          </BaseClickableRow>
        </div>

        <BaseField v-slot="{ id: fieldId }" label="Step name" optional>
          <BaseTextInput
            :id="fieldId"
            v-model="name"
            :placeholder="
              stepType
                ? STEP_TYPES.find((t) => t.id === stepType).namePlaceholder
                : 'e.g. Peer Review'
            "
          />
        </BaseField>
      </div>

      <!-- ── Last screen: assignees (roles) ─────────────────────────── -->
      <div v-else-if="screen === 'assignees'" class="tw:flex tw:flex-col tw:gap-4">
        <p class="tw:text-sm tw:text-secondary">
          Which roles can work on this step? The submitter picks the actual person from these roles
          when the workflow starts. Leave empty to let them pick any active user.
        </p>

        <BaseTextInput v-model="roleSearch" placeholder="Search roles (e.g. Quality Manager…)">
          <template #icon><IconSearch :size="18" class="tw:text-secondary" /></template>
        </BaseTextInput>

        <div v-if="selectedRoles.length > 0" class="tw:flex tw:flex-wrap tw:gap-2">
          <BaseBadge
            v-for="role in selectedRoles"
            :key="role.id"
            class="tw:bg-main-hover tw:border-divider tw:text-on-main"
            clearable
            :clearLabel="`Remove ${role.name}`"
            @clear="toggleRole(role.id)"
          >
            {{ role.name }}
          </BaseBadge>
        </div>

        <div class="tw:max-h-64 tw:overflow-y-auto tw:space-y-1">
          <BaseClickableRow
            v-for="role in filteredRoles"
            :key="role.id"
            :aria-label="`Toggle role ${role.name}`"
            class="tw:flex tw:items-center tw:gap-3 tw:p-2 tw:rounded-lg tw:transition-colors"
            :class="[
              roleIds.includes(role.id)
                ? 'tw:bg-primary/10 tw:border tw:border-primary/20'
                : 'tw:hover:bg-main-hover',
            ]"
            @click="toggleRole(role.id)"
          >
            <BaseCheckbox
              :modelValue="roleIds.includes(role.id)"
              @click.stop
              @update:modelValue="toggleRole(role.id)"
            />
            <div class="tw:flex-1 tw:min-w-0">
              <div class="tw:text-sm tw:font-medium tw:text-on-main">{{ role.name }}</div>
              <div v-if="role.description" class="tw:text-xs tw:text-secondary tw:truncate">
                {{ role.description }}
              </div>
            </div>
          </BaseClickableRow>

          <BaseEmptyState v-if="filteredRoles.length === 0" dense title="No roles found" />
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton v-if="screenIndex > 0" variant="outline" @click="back">Back</BaseButton>
      <BaseButton variant="outline" @click="open = false">Cancel</BaseButton>
      <BaseButton v-if="!isLastScreen" :disabled="!canNext" @click="next">Next</BaseButton>
      <BaseButton v-else :disabled="!canNext" @click="finish">Add Step</BaseButton>
    </template>
  </BaseDialog>
</template>
