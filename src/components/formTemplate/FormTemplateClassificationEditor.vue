<script setup>
import { isAllowed } from '@/utils/currentSession'
import { patch as apiPatch } from '@/api'

/**
 * Admin editor for a FormTemplate's Inspections & Logs config. All
 * fields live in `template.config.{recordClassification,editWindow,review,signature}`.
 *
 * Save path is the dedicated REST endpoint
 *   PATCH /v1/services/formTemplates/:id/classification
 * which does a server-side merge that preserves any other config keys
 * not owned by this editor. Direct SyncEngine save would clobber them.
 *
 * Gated by the `fieldRecords:classify_forms` permission — typically QA
 * admin only. Read-only fallback below when the user lacks permission.
 */
const props = defineProps({
  template: { type: Object, required: true },
})
const toast = useToast()

const canEdit = computed(() => isAllowed(['fieldRecords:classify_forms']))

// Local working copy — mutated by the form, then persisted via the
// classify endpoint on blur. Re-derived whenever the live-query refreshes.
const draft = ref({
  recordClassification: 'UTILITY',
  editWindow: { mode: 'NONE' },
  review: { required: false },
  signature: { requiredAtSubmission: false },
})

function hydrateFromTemplate(t) {
  const cfg = t?.config ?? {}
  draft.value = {
    recordClassification: cfg.recordClassification ?? 'UTILITY',
    editWindow: cfg.editWindow ?? { mode: 'NONE' },
    review: cfg.review ?? { required: false },
    signature: cfg.signature ?? { requiredAtSubmission: false },
  }
}

watch(() => props.template, hydrateFromTemplate, { immediate: true, deep: true })

const isUtility = computed(() => draft.value.recordClassification === 'UTILITY')
const isSaving = ref(false)

async function save() {
  if (!props.template?.id || !canEdit.value) return
  isSaving.value = true
  try {
    await apiPatch(`/v1/services/formTemplates/${props.template.id}/classification`, {
      recordClassification: draft.value.recordClassification,
      editWindow: draft.value.editWindow,
      review: draft.value.review,
      signature: draft.value.signature,
    })
    // SyncEngine will pick the update up via the sync push from the api;
    // until then, optimistically mirror onto the local model for the UI.
    if (props.template.config) {
      props.template.config = {
        ...props.template.config,
        recordClassification: draft.value.recordClassification,
        editWindow: draft.value.editWindow,
        review: draft.value.review,
        signature: draft.value.signature,
      }
    }
  } catch (err) {
    toast.error(err?.message ?? 'Failed to save classification')
  } finally {
    isSaving.value = false
  }
}

const CLASSIFICATIONS = [
  {
    id: 'UTILITY',
    label: 'Utility',
    hint: 'Internal tooling / surveys. Full CRUD anytime; not used by Inspections & Logs.',
  },
  {
    id: 'OPERATIONAL_LOG',
    label: 'Operational Log',
    hint: 'Routine field records. Editable during a configurable window, then immutable.',
  },
  {
    id: 'CONTROLLED_RECORD',
    label: 'Controlled Record',
    hint: 'Quality records (evidence-grade). Signature required at every step; immutable.',
  },
]

const EDIT_MODES = [
  { id: 'NONE', label: 'None', hint: 'Locked at submission. No editing allowed.' },
  {
    id: 'TIME_WINDOW',
    label: 'Time window',
    hint: 'Editable for N minutes after submit, then locked automatically.',
  },
  {
    id: 'UNTIL_NEXT_ENTRY',
    label: 'Until next entry',
    hint: 'Editable until the next matching submission locks predecessors.',
  },
  {
    id: 'UNTIL_REVIEW',
    label: 'Until reviewed',
    hint: 'Editable until a reviewer approves or rejects the record.',
  },
]

const NEXT_ENTRY_SCOPES = [
  { id: 'PER_USER', label: 'Per user', hint: 'Only same user / same form locks predecessors.' },
  { id: 'PER_FORM', label: 'Per form', hint: 'Any user on this form locks predecessors.' },
  {
    id: 'PER_USER_PER_FORM',
    label: 'Per user + per form',
    hint: 'Same user, same form (functionally identical to Per user).',
  },
]
</script>

<template>
  <div class="tw:space-y-5">
    <div class="tw:flex tw:items-center tw:justify-between">
      <div>
        <BaseText as="h4" variant="body" weight="semibold">Inspections &amp; Logs</BaseText>
        <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
          Classification, edit window, review gate, and signature requirements.
        </p>
      </div>
      <span
        v-if="isSaving"
        class="tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider"
      >
        Saving…
      </span>
    </div>

    <!-- Classification -->
    <BaseField label="Record classification">
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-2">
        <button
          v-for="opt in CLASSIFICATIONS"
          :key="opt.id"
          type="button"
          class="tw:rounded-lg tw:border tw:px-3 tw:py-2.5 tw:text-left tw:transition"
          :class="
            draft.recordClassification === opt.id
              ? 'tw:border-primary tw:bg-primary/5'
              : 'tw:border-divider tw:hover:bg-main-hover'
          "
          :disabled="!canEdit"
          @click="() => { draft.recordClassification = opt.id; save() }"
        >
          <div class="tw:text-sm tw:font-medium tw:text-on-main">{{ opt.label }}</div>
          <div class="tw:text-caption tw:text-secondary tw:mt-0.5">{{ opt.hint }}</div>
        </button>
      </div>
    </BaseField>

    <template v-if="!isUtility">
      <!-- Edit window -->
      <BaseField label="Edit window">
        <select
          v-model="draft.editWindow.mode"
          :disabled="!canEdit"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-1.5 tw:text-sm"
          @change="save"
        >
          <option v-for="m in EDIT_MODES" :key="m.id" :value="m.id">
            {{ m.label }} — {{ m.hint }}
          </option>
        </select>

        <div v-if="draft.editWindow.mode === 'TIME_WINDOW'" class="tw:mt-2">
          <label class="tw:text-caption tw:text-secondary">Duration (minutes)</label>
          <input
            v-model.number="draft.editWindow.durationMinutes"
            type="number"
            min="1"
            max="1440"
            :disabled="!canEdit"
            class="tw:w-32 tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-2 tw:py-1 tw:text-sm tw:ml-2"
            @blur="save"
          />
        </div>

        <BaseField v-if="draft.editWindow.mode === 'UNTIL_NEXT_ENTRY'" label="Scope" class="tw:mt-2">
          <select
            v-model="draft.editWindow.scope"
            :disabled="!canEdit"
            class="tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-1.5 tw:text-sm"
            @change="save"
          >
            <option v-for="s in NEXT_ENTRY_SCOPES" :key="s.id" :value="s.id">
              {{ s.label }} — {{ s.hint }}
            </option>
          </select>
        </BaseField>
      </BaseField>

      <!-- Review config -->
      <div>
        <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
          <input
            v-model="draft.review.required"
            type="checkbox"
            :disabled="!canEdit"
            @change="save"
          />
          <span class="tw:text-on-main">Reviewer approval required</span>
        </label>
        <div v-if="draft.review.required" class="tw:mt-2 tw:space-y-2 tw:pl-6">
          <BaseField v-slot="{ id: fieldId }" label="Reviewer role">
            <input
              :id="fieldId"
              v-model="draft.review.reviewerRole"
              type="text"
              placeholder="e.g. QA_REVIEWER (role id)"
              :disabled="!canEdit"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-1.5 tw:text-sm"
              @blur="save"
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="SLA (hours)">
            <input
              :id="fieldId"
              v-model.number="draft.review.slaHours"
              type="number"
              min="1"
              max="720"
              :disabled="!canEdit"
              class="tw:w-32 tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-2 tw:py-1 tw:text-sm"
              @blur="save"
            />
          </BaseField>
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-xs">
            <input
              v-model="draft.review.rejectionCreatesFollowup"
              type="checkbox"
              :disabled="!canEdit"
              @change="save"
            />
            <span class="tw:text-on-main">Rejected review auto-creates an NC</span>
          </label>
        </div>
      </div>

      <!-- Signature requirement (OPERATIONAL_LOG only; CONTROLLED_RECORD is always-on) -->
      <div v-if="draft.recordClassification === 'OPERATIONAL_LOG'">
        <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
          <input
            v-model="draft.signature.requiredAtSubmission"
            type="checkbox"
            :disabled="!canEdit"
            @change="save"
          />
          <span class="tw:text-on-main">Require e-signature at submission</span>
        </label>
      </div>
      <div
        v-if="draft.recordClassification === 'CONTROLLED_RECORD'"
        class="tw:text-xs tw:text-secondary tw:italic"
      >
        E-signature is always required for CONTROLLED_RECORD submissions, amendments, voids,
        and reviews.
      </div>
    </template>

    <div
      v-if="!canEdit"
      class="tw:text-caption tw:text-secondary tw:italic"
    >
      You need the <code>fieldRecords:classify_forms</code> permission to edit these settings.
    </div>
  </div>
</template>
