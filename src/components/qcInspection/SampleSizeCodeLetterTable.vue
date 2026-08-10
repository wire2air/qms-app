<script setup>
/**
 * Sample-size code-letter table — the ANSI/ASQ Z1.4 (ISO 2859-1) "Table 1".
 *
 * Renders the seeded `sample_size_code_letters` for a standard as a
 * lot-size × inspection-level grid. This is the FIRST of the two Z1.4 lookups:
 *   lot size + inspection level  →  sample-size code letter
 * That code letter (together with the AQL and switching state) then drives the
 * actual sample size + accept/reject numbers in the second table.
 *
 * Reads live from IndexedDB so it always matches the seeded standard — never a
 * hand-maintained copy.
 */
const props = defineProps({
  standardCode: { type: String, default: null },
  // The level the user picked — its column is emphasised.
  highlightLevel: { type: String, default: 'II' },
  // The lot size being previewed — the row covering it is emphasised, and the
  // cell where that row meets the picked level is the resolved code letter.
  lotSize: { type: Number, default: null },
})

// General levels first (I, II, III), then Special (S-1…S-4) — matches the
// printed standard. Ids are the canonical underscore form stored on the rows.
const LEVEL_COLUMNS = [
  { id: 'I', label: 'I', group: 'General' },
  { id: 'II', label: 'II', group: 'General' },
  { id: 'III', label: 'III', group: 'General' },
  { id: 'S_1', label: 'S-1', group: 'Special' },
  { id: 'S_2', label: 'S-2', group: 'Special' },
  { id: 'S_3', label: 'S-3', group: 'Special' },
  { id: 'S_4', label: 'S-4', group: 'Special' },
]

const cells = useLiveQueryWithDeps(
  [() => props.standardCode],
  async (db, [code]) => (code ? db.SampleSizeCodeLetter.where('standardId', code).exec() : []),
  { models: ['SampleSizeCodeLetter'], initial: [] },
)

// Pivot the flat rows into one row per lot range: { lotMin, lotMax, letters: {level: code} }.
const rows = computed(() => {
  const byRange = new Map()
  for (const c of cells.value) {
    const key = `${c.lotMin}-${c.lotMax}`
    if (!byRange.has(key)) byRange.set(key, { lotMin: c.lotMin, lotMax: c.lotMax, letters: {} })
    byRange.get(key).letters[c.inspectionLevel] = c.codeLetter
  }
  return [...byRange.values()].sort((a, b) => a.lotMin - b.lotMin)
})

// lotMax uses a large sentinel for the open-ended top band ("… and over").
const OPEN_ENDED = 1_000_000_000
function fmtRange(r) {
  if (r.lotMax >= OPEN_ENDED) return `${r.lotMin.toLocaleString()} and over`
  return `${r.lotMin.toLocaleString()} to ${r.lotMax.toLocaleString()}`
}
function isActiveRow(r) {
  return props.lotSize != null && props.lotSize >= r.lotMin && props.lotSize <= r.lotMax
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <p class="tw:text-xs tw:text-secondary">
      <strong class="tw:text-on-main">Table 1 — sample-size code letters.</strong>
      Your <strong class="tw:text-on-main">lot size</strong> and
      <strong class="tw:text-on-main">inspection level</strong> pick a code letter (A–R). The
      letter — with the AQL % and switching state — then sets the sample size and accept/reject
      numbers. Level <strong class="tw:text-on-main">II</strong> is the default; I samples less,
      III samples more; S-1…S-4 give small samples for costly or destructive tests.
    </p>

    <div v-if="!rows.length" class="tw:text-xs tw:text-secondary tw:italic tw:py-4 tw:text-center">
      {{ standardCode ? 'No code-letter table seeded for this standard.' : 'Select a standard to view its table.' }}
    </div>

    <div v-else class="tw:overflow-x-auto tw:rounded-lg tw:border tw:border-divider">
      <table class="tw:w-full tw:text-xs tw:border-collapse">
        <thead>
          <tr class="tw:bg-main-hover">
            <th rowspan="2" class="tw:sticky tw:left-0 tw:bg-main-hover tw:text-left tw:font-semibold tw:text-on-main tw:px-3 tw:py-2 tw:border-b tw:border-divider">
              Lot size
            </th>
            <th colspan="3" class="tw:text-center tw:font-semibold tw:text-on-main tw:px-2 tw:py-1 tw:border-b tw:border-l tw:border-divider">
              General levels
            </th>
            <th colspan="4" class="tw:text-center tw:font-semibold tw:text-on-main tw:px-2 tw:py-1 tw:border-b tw:border-l tw:border-divider">
              Special levels
            </th>
          </tr>
          <tr class="tw:bg-main-hover">
            <th
              v-for="col in LEVEL_COLUMNS"
              :key="col.id"
              class="tw:text-center tw:font-semibold tw:px-2 tw:py-1 tw:border-b tw:border-divider"
              :class="[
                col.group === 'Special' && col.id === 'S_1' ? 'tw:border-l' : '',
                col.id === highlightLevel
                  ? 'tw:bg-primary/15 tw:text-primary'
                  : col.id === 'II'
                    ? 'tw:text-on-main'
                    : 'tw:text-secondary',
              ]"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="`${r.lotMin}-${r.lotMax}`"
            :class="isActiveRow(r) ? 'tw:bg-primary/5' : ''"
          >
            <td
              class="tw:sticky tw:left-0 tw:px-3 tw:py-1.5 tw:whitespace-nowrap tw:border-b tw:border-divider"
              :class="isActiveRow(r) ? 'tw:bg-primary/10 tw:font-semibold tw:text-on-main' : 'tw:bg-main tw:text-on-main'"
            >
              {{ fmtRange(r) }}
            </td>
            <td
              v-for="col in LEVEL_COLUMNS"
              :key="col.id"
              class="tw:text-center tw:px-2 tw:py-1.5 tw:border-b tw:border-divider"
              :class="[
                col.group === 'Special' && col.id === 'S_1' ? 'tw:border-l' : '',
                isActiveRow(r) && col.id === highlightLevel
                  ? 'tw:bg-primary tw:text-white tw:font-bold tw:rounded'
                  : col.id === highlightLevel
                    ? 'tw:bg-primary/10 tw:text-primary tw:font-medium'
                    : 'tw:text-secondary',
              ]"
            >
              {{ r.letters[col.id] ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
