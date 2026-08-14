<script setup>
/**
 * "Add Step" wizard for the workflow template editor (user request 2026-08-12).
 * Replaces the old instant-create (a bare "Step N" dropped into the editor)
 * with a small guided widget:
 *
 *   1. What kind of step? Task (ACTION) · Approval · Schedule Task (a follow-up
 *      that activates later — e.g. an effectiveness check; DB value stays DELAY)
 *   2. Task only — pick the task form: a reusable form block, a QMS preset,
 *      or design one from scratch (blank schema — the step editor's Task Form
 *      tab opens the form builder on it).
 *   3. Who works on it? Role assignment. Templates are role-only — the actual
 *      person is picked by the submitter when the workflow is attached to a
 *      record, so roles here just constrain the candidate pool (optional).
 *
 * The dialog only COLLECTS choices; the parent (WorkflowStepList) creates the
 * step + role rows on `submit`, so ordering/company-default logic stays where
 * it always lived.
 */
import {
  IconListCheck,
  IconRubberStamp,
  IconClockPause,
  IconCirclePlus,
  IconHelpCircle,
  IconSearch,
} from '@tabler/icons-vue'
import { QMS_BLOCKS } from '@/constants/formTemplates'

const emit = defineEmits(['submit'])
const open = defineModel({ type: Boolean, default: false })

// "Schedule Task" is the user-facing name for the DELAY step type (renamed
// 2026-08-13 — DB value stays DELAY). It reads as an optional follow-up, not
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
    label: 'Schedule Task',
    sublabel: 'Follow-up',
    icon: IconClockPause,
    blurb:
      'Want a follow-up later? Waits a set number of days, then assigns its task — e.g. an Effectiveness check.',
    defaultName: 'Scheduled Task',
    namePlaceholder: 'e.g. Effectiveness Check',
    helpTooltip: true,
  },
]

// Task is the overwhelmingly common choice — preselect it so the wizard is one
// click shorter (the type screen still allows switching).
const stepType = ref('ACTION')
const name = ref('')
// Task-form choice — key identifies the picked card, schema is its payload.
const formChoiceKey = ref(null)
const formSchema = ref([])
const roleIds = ref([])

// Wizard screens: type → form (Task only — Approval is comment-only and a
// Schedule Task step's evidence form can be added later in the editor) → assignees.
const screens = computed(() => [
  'type',
  ...(stepType.value === 'ACTION' ? ['form'] : []),
  'assignees',
])
const screen = ref('type')
const screenIndex = computed(() => screens.value.indexOf(screen.value))

const SCREEN_LABELS = { type: 'Step type', form: 'Task form', assignees: 'Assignees' }

watch(open, (isOpen) => {
  if (!isOpen) return
  stepType.value = 'ACTION'
  name.value = ''
  formChoiceKey.value = null
  formSchema.value = []
  roleIds.value = []
  screen.value = 'type'
  formSearch.value = ''
  roleSearch.value = ''
})

// Picking a type that skips the form screen must drop a stale form choice
// (pick Task → pick a block → back → switch to Approval).
watch(stepType, (t) => {
  if (t !== 'ACTION') {
    formChoiceKey.value = null
    formSchema.value = []
  }
})

const canNext = computed(() => {
  if (screen.value === 'type') return !!stepType.value
  if (screen.value === 'form') return formChoiceKey.value !== null
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
    formSchema:
      stepType.value === 'ACTION' ? JSON.parse(JSON.stringify(formSchema.value ?? [])) : [],
    roleIds: [...roleIds.value],
  })
  open.value = false
}

// ── Task-form gallery — same sources as WorkflowTaskFormTemplatePicker:
// blank ("create one"), built-in QMS block presets, the tenant's saved
// ACTIVE form blocks (standalone FORM templates excluded on purpose;
// LOG_FORM blocks are exclusive to log books). ─────────────────────────
const formSearch = ref('')

const savedBlocks = useLiveQuery(
  async (db) =>
    (await db.FormTemplate.where('statusId', 'ACTIVE').exec()).filter(
      (t) => t.kind === 'BLOCK' && (t.blockCategory ?? 'GENERAL') !== 'LOG_FORM',
    ),
  { models: ['FormTemplate'], initial: [] },
)

const filteredSaved = computed(() => {
  const withSchema = savedBlocks.value.filter((t) => (t.schema?.length ?? 0) > 0)
  if (!formSearch.value.trim()) return withSchema
  const q = formSearch.value.toLowerCase()
  return withSchema.filter((t) => t.title?.toLowerCase().includes(q))
})

const filteredPresets = computed(() => {
  if (!formSearch.value.trim()) return QMS_BLOCKS
  const q = formSearch.value.toLowerCase()
  return QMS_BLOCKS.filter((p) => p.title.toLowerCase().includes(q))
})

function pickForm(key, schema) {
  formChoiceKey.value = key
  formSchema.value = schema ?? []
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
            v-for="t in STEP_TYPES"
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

      <!-- ── Screen 2 (Task only): task form gallery ────────────────── -->
      <div v-else-if="screen === 'form'" class="tw:flex tw:flex-col tw:gap-4">
        <p class="tw:text-sm tw:text-secondary">
          Pick the form the assignee fills in to complete this task — a reusable
          <strong>form block</strong> or your own design. Every field stays editable in the step
          editor's Task Form tab.
        </p>

        <BaseTextInput v-model="formSearch" placeholder="Search blocks…">
          <template #icon><IconSearch :size="18" class="tw:text-secondary" /></template>
        </BaseTextInput>

        <div
          class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4 tw:overflow-auto tw:max-h-100 tw:p-1"
        >
          <!-- Create one from scratch -->
          <BaseClickableRow
            class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:p-8 tw:border tw:border-divider tw:rounded-xl tw:transition-all tw:duration-200 tw:bg-main tw:hover:bg-main-hover tw:hover:border-primary"
            :class="{ 'tw:border-primary tw:bg-main-hover': formChoiceKey === 'blank' }"
            aria-label="Design a form from scratch"
            @click="pickForm('blank', [])"
          >
            <IconCirclePlus :size="40" class="tw:text-secondary/40" />
            <div class="tw:text-base tw:font-bold tw:mt-3 tw:text-on-main">Create your own</div>
            <div class="tw:text-xs tw:text-secondary tw:text-center">
              Start blank and design it in the form builder
            </div>
          </BaseClickableRow>

          <!-- Built-in QMS block presets -->
          <BaseClickableRow
            v-for="preset in filteredPresets"
            :key="`preset:${preset.code}`"
            class="tw:flex tw:flex-col tw:p-4 tw:border tw:border-divider tw:rounded-xl tw:transition-all tw:duration-200 tw:bg-main tw:hover:bg-main-hover tw:hover:border-primary"
            :class="{
              'tw:border-primary tw:bg-main-hover': formChoiceKey === `preset:${preset.code}`,
            }"
            :aria-label="`Use template ${preset.title}`"
            @click="pickForm(`preset:${preset.code}`, preset.schema)"
          >
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
              <span class="tw:text-sm tw:font-bold tw:text-primary">{{ preset.title }}</span>
              <span class="tw:text-micro tw:uppercase tw:tracking-wide tw:text-secondary">
                Built-in
              </span>
            </div>
            <div
              class="tw:h-40 tw:overflow-hidden tw:relative tw:bg-main tw:border tw:border-divider tw:rounded-lg"
            >
              <div
                class="tw:w-[200%] tw:scale-[0.5] tw:origin-top-left tw:p-4 tw:pointer-events-none"
              >
                <DynamicForm :fields="preset.schema" readonly :modelValue="{}" />
              </div>
            </div>
          </BaseClickableRow>

          <!-- The tenant's saved form blocks -->
          <BaseClickableRow
            v-for="tpl in filteredSaved"
            :key="`saved:${tpl.id}`"
            class="tw:flex tw:flex-col tw:p-4 tw:border tw:border-divider tw:rounded-xl tw:transition-all tw:duration-200 tw:bg-main tw:hover:bg-main-hover tw:hover:border-primary"
            :class="{ 'tw:border-primary tw:bg-main-hover': formChoiceKey === `saved:${tpl.id}` }"
            :aria-label="`Use form block ${tpl.title}`"
            @click="pickForm(`saved:${tpl.id}`, tpl.schema)"
          >
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
              <span class="tw:text-sm tw:font-bold tw:text-primary">{{ tpl.title }}</span>
              <span class="tw:text-micro tw:uppercase tw:tracking-wide tw:text-secondary">
                Your block
              </span>
            </div>
            <div
              class="tw:h-40 tw:overflow-hidden tw:relative tw:bg-main tw:border tw:border-divider tw:rounded-lg"
            >
              <div
                class="tw:w-[200%] tw:scale-[0.5] tw:origin-top-left tw:p-4 tw:pointer-events-none"
              >
                <DynamicForm :fields="tpl.schema" readonly :modelValue="{}" />
              </div>
            </div>
          </BaseClickableRow>
        </div>
      </div>

      <!-- ── Last screen: assignees (roles) ─────────────────────────── -->
      <div v-else-if="screen === 'assignees'" class="tw:flex tw:flex-col tw:gap-4">
        <p class="tw:text-sm tw:text-secondary">
          Which roles can work on this step? The submitter picks the actual person from these
          roles when the workflow starts. Leave empty to let them pick any active user.
        </p>

        <BaseTextInput
          v-model="roleSearch"
          placeholder="Search roles (e.g. Quality Manager…)"
        >
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
