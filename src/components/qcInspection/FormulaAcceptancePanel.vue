<script setup>
/**
 * Lab Acceptance for formula (√N + 1) lots — the raw-material counterpart of
 * the AQL Acceptance panel. Formula sampling has no defect-class Ac/Re to
 * tally, so the advisory verdict comes straight from the lab results:
 * every captured result within specification → ACCEPT; any out-of-spec
 * result → REJECT (zero tolerance — investigate / reject / return). Shown to
 * the QA manager alongside the disposition, advisory only.
 */
const props = defineProps({
  // Captured results total + the failing ones as { sampleNo, charName }.
  totalResults: { type: Number, default: 0 },
  oosRows: { type: Array, default: () => [] },
  // Context: containers sampled (√N + 1) out of containers received (N).
  sampleSize: { type: Number, default: null },
  containerCount: { type: Number, default: null },
})

const verdict = computed(() => (props.oosRows.length ? 'REJECT' : 'ACCEPT'))
</script>

<template>
  <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
    <div class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-3">
      <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Lab Acceptance (√N + 1)</h3>
      <span
        class="tw:text-xs tw:font-bold tw:px-2.5 tw:py-1 tw:rounded-full"
        :class="verdict === 'REJECT' ? 'tw:bg-red-100 tw:text-red-700' : 'tw:bg-green-100 tw:text-green-700'"
      >
        {{ verdict }} (advisory)
      </span>
      <span class="tw:text-xs tw:text-secondary tw:ml-auto">
        <template v-if="sampleSize != null">{{ sampleSize }} containers sampled</template>
        <template v-if="containerCount != null"> of {{ containerCount }} received</template>
        · {{ totalResults }} result(s)
      </span>
    </div>

    <div class="tw:p-4 tw:flex tw:flex-col tw:gap-2 tw:text-sm">
      <template v-if="oosRows.length">
        <p class="tw:text-on-main">
          <span class="tw:font-semibold tw:text-red-700">{{ oosRows.length }} out-of-specification
          result{{ oosRows.length === 1 ? '' : 's' }}:</span>
        </p>
        <div class="tw:flex tw:flex-wrap tw:gap-1.5">
          <span
            v-for="(r, i) in oosRows"
            :key="i"
            class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded-full tw:bg-red-50 tw:text-red-700 tw:border tw:border-red-200"
          >
            Sample {{ r.sampleNo }} — {{ r.charName }}
          </span>
        </div>
      </template>
      <p v-else class="tw:text-on-main">All captured results are within specification.</p>
      <p class="tw:text-caption tw:text-secondary">
        Raw-material rule: identity/assay is pass-fail per sample — any out-of-specification result
        means do not release (investigate, reject or return to supplier). Advisory only; the
        disposition decision is the QA reviewer's.
      </p>
    </div>
  </div>
</template>
