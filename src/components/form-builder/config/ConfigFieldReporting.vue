<script setup>
/**
 * Per-field ANALYTICS marking (QMS Intelligence — Phase 9). Writes to
 * `field.reporting`; the template schema is JSONB and DynamicForm ignores
 * unknown props, so this is purely additive — exactly like `field.scoring`,
 * whose panel (ConfigFieldScoring) this deliberately mirrors:
 *
 *   scoring:   { enabled, weight, … }  → contributes to a record's score
 *   reporting: { enabled, key }        → projects into analytics
 *
 * When a record is sealed, every field marked here is read into
 * analytics_field_values under its key, typed by the field's own type, and
 * becomes aggregable. The compute lives in the backend
 * (`shared/utils/analyticsFieldProjection.js`), which is also the authority on
 * the key rule; `utils/reportingKey.js` mirrors it so the author sees the
 * problem while typing instead of as a 400 on Save.
 *
 * ── WHY THE KEY IS REQUIRED, IN ONE SENTENCE THE AUTHOR SEES ────────────────
 * The field's own name (`input_1`, `number_3`) is minted from a counter, so
 * deleting a field frees its name for the next one created — and a metric built
 * on that name then keeps drawing a perfectly healthy line over somebody else's
 * data. Nothing errors. That is why this panel refuses the auto-generated name
 * and asks for a real one, and why the key is separate from the field name
 * rather than a rename of it: answers are stored under the field name, so
 * renaming the field would orphan every answer already collected.
 */
import { IconChartHistogram } from '@tabler/icons-vue'
import { reportingKeyError, suggestReportingKey } from '@/utils/reportingKey'

const props = defineProps({
  // Keys already used by OTHER reportable fields on this template. Two fields
  // sharing a key collide in the projection and one silently overwrites the
  // other, so the clash is caught here rather than at seal time.
  takenKeys: { type: Array, default: () => [] },
})

const field = defineModel('field', { type: Object, required: true })

function ensureReporting() {
  if (!field.value.reporting) field.value.reporting = {}
  return field.value.reporting
}

const enabled = computed({
  get: () => !!field.value?.reporting?.enabled,
  set: (v) => {
    const r = ensureReporting()
    r.enabled = v
    // Offer a key derived from the label as a STARTING POINT, never silently.
    // suggestReportingKey returns '' when the label would slug to something
    // that is itself invalid, so a field labelled "Untitled" opens with an empty
    // required box rather than a plausible-looking wrong key.
    if (v && !r.key) r.key = suggestReportingKey(field.value.label, field.value.type)
  },
})

const key = computed({
  get: () => field.value?.reporting?.key ?? '',
  set: (v) => {
    ensureReporting().key = typeof v === 'string' ? v.trim() : v
  },
})

const error = computed(() =>
  enabled.value ? reportingKeyError(key.value, field.value?.type, props.takenKeys) : '',
)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:pt-3 tw:mt-3 tw:border-t tw:border-divider">
    <BaseCheckbox v-model="enabled">
      <span class="tw:inline-flex tw:items-center tw:gap-1">
        <IconChartHistogram :size="14" class="tw:text-primary" />
        Report on this field
      </span>
    </BaseCheckbox>

    <template v-if="enabled">
      <BaseField
        label="Reporting key"
        required
        :error="error"
        hint="A stable name for this measurement, e.g. defect_count. Metrics and charts point at this key, so keep it as long as the question stays the same."
      >
        <BaseTextInput v-model="key" size="sm" placeholder="defect_count" />
      </BaseField>

      <BaseText variant="caption" class="tw:text-secondary">
        Answers already collected for this field are included — the history is filled in the next
        time analytics runs, so the chart starts where the data does, not today.
      </BaseText>
    </template>
  </div>
</template>
