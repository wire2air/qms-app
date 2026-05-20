<script setup>
import { IconHistory, IconInfoCircle, IconShieldCheck } from '@tabler/icons-vue'

/**
 * Change control form for the document-create flow (v1.0).
 *
 * For the initial version the fields are OPTIONAL — there's no prior state
 * to "change from", so an empty change reason is fine. Once the document
 * exists, new-version creation (handled by NewVersionDialog from
 * DocumentsPageId.vue) requires these fields.
 *
 * Fields are bound directly to the parent's `form` v-model so the values
 * flow into DocumentVersion.create() at save time.
 */

const form = defineModel('form', {
  type: Object,
  required: true,
})

const CHANGE_TYPES = [
  {
    value: 'ADMINISTRATIVE',
    label: 'Administrative',
    description: 'Typos, formatting, owner change. No procedural impact.',
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
</script>

<template>
  <div class="tw:space-y-6">
    <section
      class="tw:bg-sidebar tw:rounded-2xl tw:shadow-sm tw:border tw:border-divider tw:p-6 tw:flex tw:flex-col tw:gap-6"
    >
      <header class="tw:flex tw:items-start tw:gap-3">
        <div
          class="tw:flex tw:items-center tw:justify-center tw:w-10 tw:h-10 tw:rounded-lg tw:bg-primary/10 tw:text-primary"
        >
          <IconHistory :size="22" />
        </div>
        <div>
          <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Change Control</h2>
          <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
            Capture why this revision was made. Required for revisions after v1.0; optional on the
            initial release.
          </p>
        </div>
      </header>

      <div
        class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-blue-900 tw:text-xs"
      >
        <IconInfoCircle :size="16" class="tw:mt-0.5 tw:flex-none" />
        <div>
          You're creating <strong>v1.0</strong> — the initial release. These fields are optional but
          recommended for the audit trail. They become required on every revision after this.
        </div>
      </div>

      <!-- Change reason -->
      <div class="tw:flex tw:flex-col tw:gap-1.5">
        <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">
          Reason for change
          <span class="tw:text-xs tw:font-normal tw:text-secondary">(why this revision?)</span>
        </label>
        <BaseTextarea
          v-model="form.changeReason"
          :rows="2"
          placeholder="e.g. Initial release. Replaces legacy procedure PROC-OLD-014."
        />
      </div>

      <!-- Description of change -->
      <div class="tw:flex tw:flex-col tw:gap-1.5">
        <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">
          Description of change
          <span class="tw:text-xs tw:font-normal tw:text-secondary">(what changed?)</span>
        </label>
        <BaseTextarea
          v-model="form.changeSummary"
          :rows="3"
          placeholder="Summarise the substantive changes a reviewer should focus on."
        />
      </div>

      <!-- Change type -->
      <div class="tw:flex tw:flex-col tw:gap-2">
        <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">Change type</label>
        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-2">
          <button
            v-for="opt in CHANGE_TYPES"
            :key="opt.value"
            type="button"
            class="tw:flex tw:flex-col tw:items-start tw:text-left tw:p-3 tw:rounded-lg tw:border tw:transition-colors tw:cursor-pointer"
            :class="
              form.changeType === opt.value
                ? 'tw:border-primary tw:bg-primary/5 tw:text-on-sidebar'
                : 'tw:border-divider tw:bg-main-hover tw:text-secondary tw:hover:border-primary/40'
            "
            @click="form.changeType = form.changeType === opt.value ? null : opt.value"
          >
            <span class="tw:text-sm tw:font-semibold">{{ opt.label }}</span>
            <span class="tw:text-xs tw:mt-1 tw:leading-snug">{{ opt.description }}</span>
          </button>
        </div>
      </div>

      <!-- Regulatory impact -->
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider">
        <label class="tw:flex tw:items-start tw:gap-3 tw:cursor-pointer">
          <input
            v-model="form.regulatoryImpact"
            type="checkbox"
            class="tw:mt-0.5 tw:size-4 tw:accent-primary tw:cursor-pointer"
          />
          <div class="tw:flex tw:flex-col tw:gap-0.5">
            <span class="tw:text-sm tw:font-medium tw:text-on-sidebar tw:flex tw:items-center tw:gap-1.5">
              <IconShieldCheck :size="14" /> Regulatory impact
            </span>
            <span class="tw:text-xs tw:text-secondary">
              Tick if this change affects a regulatory submission, claimed standard (ISO, FDA), or
              compliance scope. Notes become required.
            </span>
          </div>
        </label>

        <div v-if="form.regulatoryImpact" class="tw:flex tw:flex-col tw:gap-1.5">
          <label class="tw:text-xs tw:font-medium tw:text-secondary">
            Regulatory impact notes
            <span class="tw:text-red-600">*</span>
          </label>
          <BaseTextarea
            v-model="form.regulatoryImpactNotes"
            :rows="2"
            placeholder="Which standard / submission is affected? What changed?"
          />
        </div>
      </div>
    </section>
  </div>
</template>
