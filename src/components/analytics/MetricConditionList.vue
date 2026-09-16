<script setup>
/**
 * A list of "Field — comparison — value(s)" conditions.
 *
 * Shared by the two places a metric asks the same question in different words:
 * the filters that decide which records count at all, and the numerator that
 * decides which of those count as a success. They were duplicated markup before,
 * and the duplication is what let the two drift — only one of them had learned
 * that a valueless comparison hides its value input.
 *
 * ── WHY VALUES ARE A PICKER HERE AND NOT A TEXT BOX ─────────────────────────
 * Because the stored value is a code, not a word: a status is 'CLOSED', a site is
 * a uuid. Typing it correctly required knowing what the database calls something
 * the UI has never shown the user — the single most common way a metric compiled
 * and then counted nothing. The registry names a `lookupTable` for every enum and
 * uuid field, the parent resolves it to the mirrored SyncEngine model, and this
 * offers the real rows.
 *
 * Free text remains for the fields that have no lookup (nonconformances.priority_id
 * is measured, not referenced) — the compiler validates and quote_literal()s those
 * either way, so the fallback is a usability step down and never a safety one.
 */
import { OP_OPTIONS, VALUELESS_OPS, blankFilter } from '@/utils/analyticsCustomMetricAccess.js'
import { IconPlus, IconTrash } from '@tabler/icons-vue'

const props = defineProps({
  /** Options for the field picker — `{ value: columnName, label }`. */
  fields: { type: Array, default: () => [] },
  /** columnName → `[{ value, label }]` for every field that has a lookup. */
  lookupOptions: { type: Object, default: () => ({}) },
  title: { type: String, default: '' },
  addLabel: { type: String, default: 'Add condition' },
  removeLabel: { type: String, default: 'Remove condition' },
  emptyText: { type: String, default: '' },
})

const rows = defineModel({ type: Array, default: () => [] })

function add() {
  rows.value.push(blankFilter())
}

function remove(index) {
  rows.value.splice(index, 1)
}

/**
 * Changing the field invalidates the values chosen for the previous one — a
 * status code left behind on a Site row is a condition that silently matches
 * nothing.
 */
function onFieldChange(row) {
  row.values = []
}

function optionsFor(row) {
  return props.lookupOptions?.[row.field] ?? null
}

/**
 * Free-text values are held as an array but edited as one comma-separated line.
 *
 * Split on save rather than on every keystroke: splitting live turns "CLOSED, "
 * into an empty second value the moment the comma is typed, and the row then
 * reports itself invalid while the user is still mid-word.
 */
function valuesText(row) {
  return (row.values ?? []).join(', ')
}

function setValues(row, text) {
  row.values = String(text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
</script>

<template>
  <div>
    <div class="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:gap-2">
      <BaseText weight="medium">{{ title }}</BaseText>
      <BaseButton size="sm" variant="outline" @click="add">
        <IconPlus :size="14" aria-hidden="true" />
        {{ addLabel }}
      </BaseButton>
    </div>

    <BaseText v-if="!rows.length && emptyText" variant="caption" color="secondary">
      {{ emptyText }}
    </BaseText>

    <div
      v-for="(row, i) in rows"
      :key="`cond-${i}`"
      class="tw:mb-2 tw:grid tw:items-end tw:gap-2 tw:sm:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <BaseSelect
        v-model="row.field"
        label="Field"
        :options="fields"
        :searchable="false"
        :autoFill="false"
        @update:modelValue="onFieldChange(row)"
      />
      <BaseSelect v-model="row.op" label="Comparison" :options="OP_OPTIONS" :searchable="false" />

      <template v-if="!VALUELESS_OPS.includes(row.op)">
        <!--
          A generic, registry-driven picker, so there is no XSelectMenu to reach
          for: which entity this is comes from `lookupTable` at runtime and is
          different on every row. The triad still owns every place the entity is
          known at author time.
        -->
        <BaseSelect
          v-if="optionsFor(row)"
          v-model="row.values"
          label="Value"
          :options="optionsFor(row)"
          :disabled="!row.field"
          :autoFill="false"
          multiple
          placeholder="Choose…"
        />
        <BaseTextInput
          v-else
          :modelValue="valuesText(row)"
          label="Value"
          :disabled="!row.field"
          placeholder="e.g. HIGH, CRITICAL"
          hint="Comma separated, exactly as stored"
          @update:modelValue="setValues(row, $event)"
        />
      </template>
      <span v-else />

      <BaseButton size="sm" variant="ghost" :aria-label="removeLabel" @click="remove(i)">
        <IconTrash :size="14" aria-hidden="true" />
      </BaseButton>
    </div>
  </div>
</template>
