<script setup>
/**
 * Compliance switches for a workflow step — Require Comments / Require
 * E-signature (+ the not-yet-live Adobe pair).
 *
 * Presentational on purpose: it mutates the pooled step instance it's handed
 * and lets the OWNER persist. Both owners run their own debounced autosave
 * (WorkflowStepEditor for the inline APPROVAL case, WorkflowStepSettingsDialog
 * for every other type), so the block can live in either place unchanged.
 */
const props = defineProps({
  // Pooled WorkflowStep model instance (not an id) — see note above.
  step: { type: Object, required: true },
  canUpdate: { type: Boolean, default: false },
})

// Adobe e-sign step flags are persisted but their runtime (agreement creation,
// webhook completion, supplier submit selection) isn't shipped yet — keep the
// switches disabled so they can't be toggled into a misleading inert state.
// Flip to true when steps 3–6 of the Adobe Sign integration land.
const ADOBE_ESIGN_READY = false

const esignLocked = computed(() => !props.canUpdate || props.step?.adobeEsignRequired)
</script>

<template>
  <div class="tw:space-y-3">
    <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
      <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
        <BaseSwitch v-model="step.requireComments" :disabled="!canUpdate" />
        <span class="tw:text-xs tw:font-semibold tw:text-on-main">Require Comments</span>
      </label>
      <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
        <BaseSwitch v-model="step.requireEsignature" :disabled="esignLocked" />
        <span class="tw:text-xs tw:font-semibold tw:text-on-main">Require E-signature</span>
      </label>
    </div>

    <!-- E-signature provider + external signers (Document Control). Adobe
         supersedes the in-app PIN; external_supplier swaps role-based
         internal approvers for supplier users picked at submit. Disabled
         until the Adobe runtime (agreement creation + webhook + supplier
         submit) ships — flip ADOBE_ESIGN_READY then. -->
    <div
      class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3"
      :class="ADOBE_ESIGN_READY ? '' : 'tw:opacity-50'"
    >
      <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
        <BaseSwitch
          v-model="step.adobeEsignRequired"
          :disabled="!canUpdate || !ADOBE_ESIGN_READY"
        />
        <span class="tw:text-xs tw:font-semibold tw:text-on-main">Adobe e-signature</span>
      </label>
      <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
        <BaseSwitch v-model="step.externalSupplier" :disabled="!canUpdate || !ADOBE_ESIGN_READY" />
        <span class="tw:text-xs tw:font-semibold tw:text-on-main">External (supplier) signers</span>
      </label>
    </div>
    <p v-if="!ADOBE_ESIGN_READY" class="tw:text-caption tw:text-secondary">
      Adobe e-signature is coming soon (connect it in Company Settings → Integrations).
    </p>
    <p v-else-if="step.adobeEsignRequired" class="tw:text-caption tw:text-secondary">
      Signs via your connected Adobe Acrobat Sign account (Company Settings → Integrations). All
      selected signers must sign before the step completes.
    </p>
  </div>
</template>
