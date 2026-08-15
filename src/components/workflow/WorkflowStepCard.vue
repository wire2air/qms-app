<script setup>
import {
  IconUsers,
  IconClock,
  IconArrowUp,
  IconArrowDown,
  IconTrash,
  IconDots,
  IconListCheck,
  IconRubberStamp,
  IconClockPause,
  IconChevronDown,
  IconPencil,
  IconSettings,
  IconForms,
  IconWritingSign,
  IconMessage,
} from '@tabler/icons-vue'

const props = defineProps({
  step: {
    type: Object,
    required: true,
  },
  index: {
    type: Number,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
  isFirst: {
    type: Boolean,
    default: false,
  },
  isLast: {
    type: Boolean,
    default: false,
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
  isChild: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'select',
  'remove',
  'moveUp',
  'moveDown',
  'openSettings',
  'openAssignees',
])

const roleCount = useLiveQueryWithDeps(
  [() => props.step?.id],
  async (db, [stepId]) => {
    if (!stepId) return 0
    const all = await db.WorkflowStepRole.where().exec()
    return all.filter((sr) => sr.stepId === stepId).length
  },

  { models: ['WorkflowStepRole'], initial: 0 },
)

const userCount = useLiveQueryWithDeps(
  [() => props.step?.id],
  async (db, [stepId]) => {
    if (!stepId) return 0
    const all = await db.WorkflowStepUser.where().exec()
    return all.filter((su) => su.stepId === stepId).length
  },

  { models: ['WorkflowStepUser'], initial: 0 },
)

const approverLabel = computed(() => {
  const roles = roleCount.value || 0
  const users = userCount.value || 0
  const parts = []
  if (roles > 0) parts.push(`${roles} Role${roles !== 1 ? 's' : ''}`)
  if (users > 0) parts.push(`${users} User${users !== 1 ? 's' : ''}`)
  // "Unassigned" (not "No tasks"): a step with no roles/users isn't broken —
  // the submitter simply picks anyone at submit time.
  return parts.length > 0 ? parts.join(', ') : 'Unassigned'
})

// Chip toggles for the compliance flags. Saved here rather than relying on a
// parent's autosave: the step's editor is unmounted while the step is
// collapsed, so nothing else would persist the change. Reverts on failure —
// a pessimistic save means a thrown error left nothing written.
async function toggleFlag(field) {
  if (!props.canUpdate) return
  if (field === 'requireEsignature' && props.step.adobeEsignRequired) return
  const previous = props.step[field]
  props.step[field] = !previous
  try {
    await props.step.save()
  } catch (e) {
    props.step[field] = previous
    toast.error(e?.message || 'Failed to update the step')
  }
}

// Field count only means something where a form can exist — an Approval step
// is comment-only, so "0 fields" there would read as a gap rather than design.
const formFieldCount = computed(() => props.step?.formSchema?.length ?? 0)
const showsFormMeta = computed(
  () => props.step?.stepType !== 'APPROVAL' && formFieldCount.value > 0,
)

// Step-type chip — user-facing names ("Task" / "Approval" / "Schedule Task");
// the type is immutable after creation, so the card is where you read it at
// a glance without opening the step's configuration dialog.
const TYPE_META = {
  ACTION: { label: 'Task', icon: IconListCheck },
  APPROVAL: { label: 'Approval', icon: IconRubberStamp },
  DELAY: { label: 'Schedule Task', icon: IconClockPause },
}
const typeMeta = computed(() => TYPE_META[props.step?.stepType] ?? TYPE_META.ACTION)

// ── Inline rename ────────────────────────────────────────────────────────────
// Saves on Enter/blur; a blank name restores the previous one rather than
// persisting an unnamed step (the card would render as an empty title).
const toast = useToast()
const editingName = ref(false)
let nameBeforeEdit = ''

function startRename() {
  if (!props.canUpdate) return
  nameBeforeEdit = props.step.name
  editingName.value = true
}

async function finishRename() {
  if (!editingName.value) return
  editingName.value = false
  const step = props.step
  if (!step.name?.trim()) {
    step.name = nameBeforeEdit
    return
  }
  if (step.name === nameBeforeEdit) return
  try {
    await step.save()
  } catch (e) {
    step.name = nameBeforeEdit
    toast.error(e?.message || 'Failed to rename step')
  }
}

const menuItems = computed(() => {
  const items = []
  if (!props.isFirst)
    items.push({ name: 'Move Up', icon: IconArrowUp, click: () => emit('moveUp') })
  if (!props.isLast)
    items.push({ name: 'Move Down', icon: IconArrowDown, click: () => emit('moveDown') })
  items.push({ name: 'Delete', icon: IconTrash, click: () => emit('remove') })
  return items
})
</script>

<template>
  <!-- ONE panel per step (user request 2026-08-15): the summary row is the
       panel's HEADER and the expanded configuration is its body, sharing a
       single border — it used to be two stacked boxes with a gap. The border
       lives on this wrapper, not on the clickable row, so the config content
       sits INSIDE the same surface while staying OUTSIDE the click target
       (clicking a form field must never fold the step away). -->
  <div
    class="tw:bg-main tw:transition-all tw:overflow-hidden"
    :class="[
      isChild ? 'tw:rounded-lg tw:border' : 'tw:rounded-xl tw:border-2 tw:shadow-sm',
      isSelected
        ? 'tw:border-primary tw:ring-4 tw:ring-primary/5'
        : 'tw:border-divider tw:hover:border-secondary',
    ]"
  >
    <!-- Header is NOT clickable (user request 2026-08-15) — the chevron is the
       only expand/collapse control. The header is full of its own controls
       (rename, chips, settings, menu), so a card-wide toggle meant every
       mis-click folded the step away. -->
    <div class="tw:group tw:relative" :class="isChild ? 'tw:p-3' : 'tw:p-4'">
      <div class="tw:flex tw:items-start tw:gap-3">
        <!-- Step Number -->
        <div
          class="tw:mt-0.5 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:font-bold tw:shrink-0"
          :class="[
            isChild ? 'tw:w-5 tw:h-5 tw:text-micro' : 'tw:w-6 tw:h-6 tw:text-xs',
            isSelected ? 'tw:bg-primary tw:text-white' : 'tw:bg-main-hover tw:text-secondary',
          ]"
        >
          {{ index + 1 }}
        </div>

        <!-- Step Info -->
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:mb-1">
            <!-- Click-to-edit name. The expanded panel below has no header
               (2026-08-15), so this is the only place a step is renamed.
               .stop everywhere — the card itself toggles the panel. -->
            <BaseTextInput
              v-if="editingName"
              v-model="step.name"
              size="sm"
              class="tw:flex-1 tw:min-w-0"
              placeholder="Step name"
              autofocus
              @click.stop
              @keyup.enter="finishRename"
              @blur="finishRename"
            />
            <button
              v-else-if="canUpdate"
              type="button"
              class="tw:group/name tw:inline-flex tw:items-center tw:gap-1.5 tw:min-w-0 tw:text-left"
              aria-label="Rename step"
              @click.stop="startRename"
            >
              <BaseText as="h3" weight="bold" truncate>{{ step.name }}</BaseText>
              <IconPencil
                :size="14"
                class="tw:shrink-0 tw:text-secondary tw:opacity-0 tw:group-hover/name:opacity-100 tw:group-focus-visible/name:opacity-100 tw:transition-opacity"
              />
            </button>
            <BaseText v-else as="h3" weight="bold" truncate>
              {{ step.name }}
            </BaseText>
            <!-- (No ALL/ANY chip — removed 2026-08-15. Every step carries an
               approvalRule, but it only MEANS anything on an Approval step,
               so it read as noise on Tasks. Where it matters it's the
               "Who must approve?" control in the step's own panel.) -->
          </div>

          <!-- Key info at a glance (2026-08-15): type, who's assigned, SLA,
             e-sign, and for a Task how many fields its form captures — the
             facts you'd otherwise have to expand or open Settings to see. -->
          <!-- Chips are the CONTROLS, not just a readout (user request
             2026-08-15): assignees opens its dialog, E-sign / Comment toggle
             the requirement in place. Toggles always render so a requirement
             can be switched ON, dimmed when off. Read-only viewers see only
             what's actually required. -->
          <div class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-secondary tw:flex-wrap">
            <span class="tw:flex tw:items-center tw:gap-1 tw:font-medium tw:text-primary">
              <component :is="typeMeta.icon" :size="16" />
              {{ typeMeta.label }}
            </span>

            <button
              v-if="canUpdate"
              type="button"
              class="tw:flex tw:items-center tw:gap-1 tw:px-1.5 tw:py-0.5 tw:-mx-1 tw:rounded tw:hover:bg-main-hover tw:hover:text-primary tw:transition-colors"
              :aria-label="`Manage assignees — ${approverLabel}`"
              @click.stop="emit('openAssignees')"
            >
              <IconUsers :size="16" />
              {{ approverLabel }}
            </button>
            <span v-else class="tw:flex tw:items-center tw:gap-1">
              <IconUsers :size="16" />
              {{ approverLabel }}
            </span>

            <span v-if="step.slaDays" class="tw:flex tw:items-center tw:gap-1">
              <IconClock :size="16" />
              {{ step.slaDays }} Day{{ step.slaDays !== 1 ? 's' : '' }}
            </span>
            <span v-if="showsFormMeta" class="tw:flex tw:items-center tw:gap-1">
              <IconForms :size="16" />
              {{ formFieldCount }} field{{ formFieldCount !== 1 ? 's' : '' }}
            </span>

            <BaseTooltip
              v-if="canUpdate"
              :content="
                step.adobeEsignRequired
                  ? 'Required by Adobe e-signature'
                  : step.requireEsignature
                    ? 'E-signature required — click to turn off'
                    : 'Click to require an e-signature'
              "
            >
              <button
                type="button"
                class="tw:flex tw:items-center tw:gap-1 tw:px-1.5 tw:py-0.5 tw:rounded tw:border tw:transition-colors tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
                :class="
                  step.requireEsignature
                    ? 'tw:border-amber-300 tw:bg-amber-50 tw:text-amber-700 tw:font-medium'
                    : 'tw:border-divider tw:text-secondary tw:hover:border-secondary'
                "
                :aria-pressed="!!step.requireEsignature"
                :disabled="step.adobeEsignRequired"
                @click.stop="toggleFlag('requireEsignature')"
              >
                <IconWritingSign :size="16" />
                E-sign
              </button>
            </BaseTooltip>
            <span
              v-else-if="step.requireEsignature"
              class="tw:flex tw:items-center tw:gap-1 tw:text-amber-700 tw:font-medium"
            >
              <IconWritingSign :size="16" />
              E-sign
            </span>

            <BaseTooltip
              v-if="canUpdate"
              :content="
                step.requireComments
                  ? 'Comment required — click to turn off'
                  : 'Click to require a comment'
              "
            >
              <button
                type="button"
                class="tw:flex tw:items-center tw:gap-1 tw:px-1.5 tw:py-0.5 tw:rounded tw:border tw:transition-colors"
                :class="
                  step.requireComments
                    ? 'tw:border-primary/30 tw:bg-primary/5 tw:text-primary tw:font-medium'
                    : 'tw:border-divider tw:text-secondary tw:hover:border-secondary'
                "
                :aria-pressed="!!step.requireComments"
                @click.stop="toggleFlag('requireComments')"
              >
                <IconMessage :size="16" />
                Comment
              </button>
            </BaseTooltip>
            <span v-else-if="step.requireComments" class="tw:flex tw:items-center tw:gap-1">
              <IconMessage :size="16" />
              Comment
            </span>
          </div>
        </div>

        <!-- Step settings (the rest: instructions, SLA, delay window, …) -->
        <BaseTooltip v-if="canUpdate" content="Step settings">
          <button
            type="button"
            class="tw:shrink-0 tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:transition-colors"
            aria-label="Step settings"
            @click.stop="emit('openSettings')"
          >
            <IconSettings :size="17" />
          </button>
        </BaseTooltip>

        <!-- The ONLY expand/collapse control. -->
        <button
          type="button"
          class="tw:shrink-0 tw:p-1 tw:rounded tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:transition-colors"
          :aria-label="`${isSelected ? 'Collapse' : 'Expand'} step ${step.name}`"
          :aria-expanded="isSelected"
          @click="emit('select')"
        >
          <IconChevronDown
            :size="18"
            class="tw:transition-transform"
            :class="isSelected ? '' : 'tw:-rotate-90'"
            aria-hidden="true"
          />
        </button>

        <!-- Actions Menu -->
        <div
          v-if="canUpdate"
          class="tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:shrink-0"
        >
          <BaseMenu :items="menuItems">
            <template #trigger>
              <button
                class="tw:p-1 tw:rounded tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
              >
                <IconDots :size="18" />
              </button>
            </template>
          </BaseMenu>
        </div>
      </div>
    </div>

    <!-- Expanded configuration — the panel's body. Sibling of the clickable
         header, so interacting with it never toggles the step. -->
    <div v-if="isSelected && $slots.expanded" class="tw:border-t tw:border-divider">
      <slot name="expanded" />
    </div>
  </div>
</template>
