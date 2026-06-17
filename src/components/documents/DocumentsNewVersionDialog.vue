<script setup>
import { IconHistory, IconShieldCheck, IconAlertTriangle } from '@tabler/icons-vue'

/**
 * Captures change-control metadata before creating a new DocumentVersion.
 *
 * For every revision after v1.0 the QMS audit trail requires:
 *   - WHY (changeReason)        — free text, required
 *   - TYPE (changeType)         — ADMINISTRATIVE / MINOR / MAJOR, required
 *   - WHAT (changeSummary)      — reviewer-focused description, optional
 *   - REGULATORY IMPACT flag    — optional, with required notes when set
 *   - AFFECTED SECTIONS         — optional ids; reviewer focus signal
 *
 * Confirms via `@confirm` with a plain object the parent passes straight
 * into DocumentVersion.create(). No persistence happens in this component.
 */

defineProps({
  // Latest version's sections — shown as a multi-select so the author can
  // flag which areas they expect to change in this revision. Optional.
  baselineSections: {
    type: Array,
    default: () => [],
  },
  // Pre-fill the "next version" label so the user knows what they're
  // creating ("v2.0 from v1.0").
  nextVersionLabel: {
    type: String,
    default: '',
  },
  fromVersionLabel: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['confirm'])

const show = defineModel({ type: Boolean, default: false })

const DEFAULT_DRAFT = () => ({
  changeReason: '',
  changeType: null, // ADMINISTRATIVE | MINOR | MAJOR
  changeSummary: '',
  regulatoryImpact: false,
  regulatoryImpactNotes: '',
  affectedSectionIds: [],
})

const draft = ref(DEFAULT_DRAFT())
const submitted = ref(false)

watch(show, (open) => {
  if (open) {
    draft.value = DEFAULT_DRAFT()
    submitted.value = false
  }
})

const CHANGE_TYPES = [
  {
    value: 'ADMINISTRATIVE',
    label: 'Administrative',
    description: 'Typos, formatting, ownership change. No procedural impact.',
  },
  {
    value: 'MINOR',
    label: 'Minor',
    description: 'Clarification or small procedural detail. Workflow unchanged.',
  },
  {
    value: 'MAJOR',
    label: 'Major',
    description: 'Workflow, scope, or compliance reference changed.',
  },
]

const errors = computed(() => {
  const e = {}
  if (!draft.value.changeReason?.trim()) {
    e.changeReason = 'Reason for change is required.'
  } else if (draft.value.changeReason.trim().length < 10) {
    e.changeReason = 'Add a few more words so reviewers understand the intent.'
  }
  if (!draft.value.changeType) {
    e.changeType = 'Pick a change type.'
  }
  if (
    draft.value.regulatoryImpact &&
    !draft.value.regulatoryImpactNotes?.trim()
  ) {
    e.regulatoryImpactNotes = 'Notes are required when regulatory impact is flagged.'
  }
  return e
})

const isValid = computed(() => Object.keys(errors.value).length === 0)

function toggleAffected(sectionId) {
  const idx = draft.value.affectedSectionIds.indexOf(sectionId)
  if (idx === -1) draft.value.affectedSectionIds.push(sectionId)
  else draft.value.affectedSectionIds.splice(idx, 1)
}

function confirm() {
  submitted.value = true
  if (!isValid.value) return
  emit('confirm', {
    changeReason: draft.value.changeReason.trim(),
    changeType: draft.value.changeType,
    changeSummary: draft.value.changeSummary?.trim() || '',
    regulatoryImpact: draft.value.regulatoryImpact,
    regulatoryImpactNotes: draft.value.regulatoryImpact
      ? draft.value.regulatoryImpactNotes.trim()
      : '',
    affectedSectionIds: [...draft.value.affectedSectionIds],
  })
  show.value = false
}

function cancel() {
  show.value = false
}
</script>

<template>
  <BaseDialog v-model="show" maxWidth="2xl">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconHistory :size="22" />
        </div>
        <div>
          <div class="tw:text-lg tw:font-bold tw:text-on-main">Create New Revision</div>
          <div v-if="nextVersionLabel" class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ fromVersionLabel ? `${fromVersionLabel} → ${nextVersionLabel}` : nextVersionLabel }}
          </div>
        </div>
      </div>
    </template>

    <div class="tw:flex tw:flex-col tw:gap-5">
      <div
        class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200 tw:text-amber-900 tw:text-xs"
      >
        <IconAlertTriangle :size="16" class="tw:mt-0.5 tw:flex-none" />
        <div>
          Change control fields are <strong>required</strong> for every revision after v1.0. They
          drive the audit trail, reviewer focus, and the print footer.
        </div>
      </div>

      <!-- Change reason (required) -->
      <BaseField v-slot="{ id: fieldId }" label="Reason for change" required>
        <BaseTextarea
          :id="fieldId"
          v-model="draft.changeReason"
          :rows="2"
          placeholder="e.g. New calibration interval required by Method SOP-014 revision 4."
        />
        <p v-if="submitted && errors.changeReason" class="tw:text-xs tw:text-red-600">
          {{ errors.changeReason }}
        </p>
      </BaseField>

      <!-- Change type (required) -->
      <BaseField label="Change type" required>
        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-2">
          <button
            v-for="opt in CHANGE_TYPES"
            :key="opt.value"
            type="button"
            class="tw:flex tw:flex-col tw:items-start tw:text-left tw:p-3 tw:rounded-lg tw:border tw:transition-colors tw:cursor-pointer"
            :class="
              draft.changeType === opt.value
                ? 'tw:border-primary tw:bg-primary/5 tw:text-on-main'
                : 'tw:border-divider tw:bg-main-hover tw:text-secondary tw:hover:border-primary/40'
            "
            @click="draft.changeType = opt.value"
          >
            <span class="tw:text-sm tw:font-semibold">{{ opt.label }}</span>
            <span class="tw:text-xs tw:mt-1 tw:leading-snug">{{ opt.description }}</span>
          </button>
        </div>
        <p v-if="submitted && errors.changeType" class="tw:text-xs tw:text-red-600">
          {{ errors.changeType }}
        </p>
      </BaseField>

      <!-- Description of change (optional) -->
      <BaseField>
        <template #label>
          Description of change
          <span class="tw:text-xs tw:font-normal tw:text-secondary">(what reviewers should focus on)</span>
        </template>
        <template #default="{ id: fieldId }">
          <BaseTextarea
            :id="fieldId"
            v-model="draft.changeSummary"
            :rows="3"
            placeholder="Summarise the substantive content changes in this revision."
          />
        </template>
      </BaseField>

      <!-- Affected sections (optional) -->
      <BaseField v-if="baselineSections.length">
        <template #label>
          Affected sections
          <span class="tw:text-xs tw:font-normal tw:text-secondary">(optional — reviewer focus)</span>
        </template>
        <div class="tw:max-h-40 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:p-2 tw:flex tw:flex-col tw:gap-1">
          <label
            v-for="section in baselineSections"
            :key="section.id"
            class="tw:flex tw:items-center tw:gap-2 tw:p-1.5 tw:rounded tw:cursor-pointer tw:hover:bg-main-hover"
          >
            <input
              type="checkbox"
              :checked="draft.affectedSectionIds.includes(section.id)"
              class="tw:size-4 tw:accent-primary tw:cursor-pointer"
              @change="toggleAffected(section.id)"
            />
            <span class="tw:text-sm">{{ (section.order ?? '?') }}. {{ section.title || '(untitled)' }}</span>
          </label>
        </div>
      </BaseField>

      <!-- Regulatory impact -->
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider">
        <label class="tw:flex tw:items-start tw:gap-3 tw:cursor-pointer">
          <input
            v-model="draft.regulatoryImpact"
            type="checkbox"
            class="tw:mt-0.5 tw:size-4 tw:accent-primary tw:cursor-pointer"
          />
          <div class="tw:flex tw:flex-col tw:gap-0.5">
            <span class="tw:text-sm tw:font-medium tw:text-on-main tw:flex tw:items-center tw:gap-1.5">
              <IconShieldCheck :size="14" /> Regulatory impact
            </span>
            <span class="tw:text-xs tw:text-secondary">
              Tick if this change affects a regulatory submission, claimed standard (ISO, FDA), or
              compliance scope.
            </span>
          </div>
        </label>

        <BaseField
          v-if="draft.regulatoryImpact"
          v-slot="{ id: fieldId }"
          label="Regulatory impact notes"
          required
          size="xs"
        >
          <BaseTextarea
            :id="fieldId"
            v-model="draft.regulatoryImpactNotes"
            :rows="2"
            placeholder="Which standard / submission is affected? What changed?"
          />
          <p v-if="submitted && errors.regulatoryImpactNotes" class="tw:text-xs tw:text-red-600">
            {{ errors.regulatoryImpactNotes }}
          </p>
        </BaseField>
      </div>
    </div>

    <template #footer>
      <BaseDialogFooter submitLabel="Create Revision" @cancel="cancel" @submit="confirm" />
    </template>
  </BaseDialog>
</template>
