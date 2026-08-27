<script setup>
/**
 * Create or edit an alert DEFINITION — a metric, an optional slice, and a
 * ladder of threshold bands.
 *
 * ── EVERY CONTROL BELOW IS DRIVEN BY A CONSTRAINT, NOT A PREFERENCE ─────────
 * `analytics_alerts_bands_chk` calls `analytics_alert_bands_valid()`, which
 * FAILS CLOSED and returns false rather than raising — so an unknown
 * comparator, severity or period token does not produce a field message, it
 * produces `violates check constraint "analytics_alerts_bands_chk"` with no
 * indication of which band or which field. Hence: selects over the exact
 * enumerations (src/utils/analyticsAlerts.js, which mirrors the function), and
 * a `bandProblems()` pass at the save boundary so the ladder that reaches the
 * database is one the CHECK accepts.
 *
 * The window select is the important one. It is PERIOD_TOKEN_OPTIONS, not a
 * list typed here, because `analytics_resolve_period_token()` maps anything it
 * does not recognise to `(NULL, NULL)` — the server's default window. A typo'd
 * token would therefore not error; it would quietly turn the alert into a
 * broader one wearing the narrower one's label.
 *
 * ── THERE IS NO FILTERS EDITOR, ON PURPOSE ──────────────────────────────────
 * `analytics_alerts.filters` exists and `evaluate_analytics_alerts` REFUSES to
 * evaluate any alert whose filters are non-empty: no metric executor accepts a
 * filter argument (`metric_value` is (key, start, end, compare),
 * `metric_breakdown` is (key, dimension, start, end, limit, min_cell, rank_by)),
 * and evaluating the unfiltered metric would silently make it a broader alert
 * than the one that was saved. Offering the control would let somebody author
 * an alert that looks configured and never fires. This dialog neither reads nor
 * writes the column; AlertsHome flags a row that already carries one.
 *
 * ── WHY THE RECIPIENT PICKERS SOMETIMES ARE NOT DRAWN ───────────────────────
 * Both write policies end the same way:
 *
 *   is_owner OR has_permission('reports_dashboards','manage')
 *   OR analytics_alert_recipients(recipients, bands) <@ ARRAY[me]
 *
 * — anybody may author an alert that mails ONLY THEM; naming anybody else needs
 * `manage`. That is the one seam the write rule is split on, because an alert
 * is the only object in this layer that puts mail in another person's inbox. So
 * without `manage` the pickers are replaced by a line saying the alert notifies
 * you, and `clampRecipients()` pins the payload to match. RLS is still the
 * enforcement — this only avoids assembling a draft the WITH CHECK will refuse.
 *
 * ── AND WHY THE RECIPIENTS FIELD CARRIES A WARNING ──────────────────────────
 * The value is computed PER RECIPIENT under that recipient's own scope
 * (`analytics_alert_events.evaluated_as_user_id` is CHECKed equal to
 * `recipient_user_id`). So an alert cannot tell somebody about something
 * outside their visibility: "above 50, summon the site head" does not fire for
 * a department-scoped site head, because under their own scope the number never
 * reaches 50. That is a deliberate trade — a person who cannot see the records
 * cannot verify or act on the total — but nothing else in the product says so,
 * and "why didn't the site head get it?" is the support ticket it produces.
 */
import {
  BAND_WINDOW_OPTIONS,
  COMPARATOR_OPTIONS,
  DEFAULT_BAND_WINDOW,
  DEFAULT_SUPPRESS_WINDOW_MINUTES,
  MAX_BANDS,
  SEVERITIES,
  SEVERITY_OPTIONS,
  SUPPRESS_MAX_MINUTES,
  SUPPRESS_MIN_MINUTES,
  bandProblems,
  blankBand,
  canNameOtherRecipients,
  clampRecipients,
  formatMinutes,
  newBandKey,
  normaliseBands,
  severityRank,
} from '@/utils/analyticsAlerts.js'
import { dimensionOptionsFor, segmentLabel } from '@/utils/analyticsViz.js'
import { useMetricBreakdown } from '@/composables/useAnalytics.js'
import { currentSession, isAllowed } from '@/utils/currentSession'
import { IconAlertTriangle, IconPlus, IconTrash, IconUsers } from '@tabler/icons-vue'

const props = defineProps({
  // An existing alert to edit; null to create.
  alert: { type: Object, default: null },
  // metric_catalog rows, fetched by the page so the dialog does not re-query.
  metrics: { type: Array, default: () => [] },
  metricsLoading: { type: Boolean, default: false },
  // Lowercased names already used in this tenant, minus this alert's own.
  // `analytics_alerts_name_uniq` is (company_id, lower(name)) WHERE deleted_at
  // IS NULL and it is TENANT-WIDE, not per owner — an alert puts mail in other
  // people's inboxes, so two "Overdue CAPAs" by two authors is a support
  // ticket. Checked here only so the clash reads as a field error rather than
  // a unique-violation toast.
  takenNames: { type: Array, default: () => [] },
})

const emit = defineEmits(['saved'])

const open = defineModel('open', { type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)

const viewer = computed(() => ({
  userId: currentSession.value?.id ?? null,
  // isAllowed() already short-circuits for a company owner, which is the
  // `current_user_is_owner` branch of the policy.
  canManage: isAllowed(['reports_dashboards:manage']),
}))

const canNameOthers = computed(() => canNameOtherRecipients(viewer.value))

function blankForm() {
  return {
    name: '',
    description: '',
    metricKey: null,
    dimension: null,
    dimensionValue: null,
    recipients: viewer.value.userId ? [viewer.value.userId] : [],
    suppressWindowMinutes: String(DEFAULT_SUPPRESS_WINDOW_MINUTES),
    isActive: true,
    bands: [blankBand()],
  }
}

/**
 * A stored band -> the editor's draft. Numbers become strings because a number
 * input hands back a string and a half-typed value is not a number;
 * `normaliseBands()` coerces them back at the save boundary.
 *
 * `key` is carried through UNCHANGED and is not editable. It is the suppression
 * key — `analytics_alert_events_suppression_excl` ranges over (alert,
 * recipient, band_key, slice) and every event snapshots it — so rewriting it
 * would hand this band another band's suppression window and history.
 */
function toDraftBand(band) {
  return {
    key: band?.key || newBandKey(),
    comparator: band?.comparator ?? 'gt',
    threshold: band?.threshold === null || band?.threshold === undefined ? '' : String(band.threshold),
    window: band?.window ?? DEFAULT_BAND_WINDOW,
    severity: band?.severity ?? 'warning',
    recipients: Array.isArray(band?.recipients) ? band.recipients.map(String) : [],
    suppressWindowMinutes:
      band?.suppressWindowMinutes === null || band?.suppressWindowMinutes === undefined
        ? ''
        : String(band.suppressWindowMinutes),
  }
}

const form = ref(blankForm())

// Re-seed whenever the dialog opens, so reopening after a cancel does not
// resurrect the abandoned draft, and so editing never mutates the live
// SyncEngine object the list is rendering.
watch(
  () => [open.value, props.alert?.id],
  () => {
    if (!open.value) return
    if (!props.alert) {
      form.value = blankForm()
      return
    }
    const stored = Array.isArray(props.alert.bands) ? props.alert.bands : []
    form.value = {
      name: props.alert.name ?? '',
      description: props.alert.description ?? '',
      metricKey: props.alert.metricKey ?? null,
      dimension: props.alert.dimension ?? null,
      dimensionValue: props.alert.dimensionValue ?? null,
      recipients: (props.alert.recipients ?? []).map(String),
      suppressWindowMinutes: String(
        props.alert.suppressWindowMinutes ?? DEFAULT_SUPPRESS_WINDOW_MINUTES,
      ),
      isActive: props.alert.isActive !== false,
      // A ladder can legitimately arrive empty only from a superuser path; the
      // editor needs one row to draw.
      bands: stored.length ? stored.map(toDraftBand) : [blankBand()],
    }
  },
  { immediate: true },
)

// ── the metric, and what it can be split by ─────────────────────────────────

const metricOptions = computed(() =>
  (props.metrics ?? []).map((m) => ({ value: m.metricKey, label: m.name || m.metricKey })),
)

const selectedMetric = computed(
  () => (props.metrics ?? []).find((m) => m.metricKey === form.value.metricKey) ?? null,
)

/**
 * The runner reads a dimension alert with `metric_breakdown`, so the offerable
 * dimensions are the ones a BREAKDOWN-sourced viz may use: the metric's
 * declared keys (already truncated server-side to the rollup's three slots)
 * PLUS site / department / owner, which are valid for a breakdown and are not
 * in `metric.dimensions`. `dimensionOptionsFor(metric, 'table')` is exactly
 * that set — hand-rolling the list here would silently drop the scope three.
 */
const BREAKDOWN_VIZ = 'table'

const dimensionOptions = computed(() => dimensionOptionsFor(selectedMetric.value, BREAKDOWN_VIZ))

// Changing the metric can invalidate the dimension, and a stale dimension is
// not a cosmetic problem: metric_breakdown 500s on a key outside the catalog.
watch(
  () => form.value.metricKey,
  () => {
    if (!dimensionOptions.value.some((d) => d.value === form.value.dimension)) {
      form.value.dimension = null
    }
  },
)

// A dimension VALUE without a dimension names a slice of nothing, and
// `analytics_alerts_dimension_chk` refuses it.
watch(
  () => form.value.dimension,
  () => {
    if (!form.value.dimension) form.value.dimensionValue = null
  },
)

/**
 * The slices this alert could name — read through the SAME call the runner
 * makes, with the same limit and the same min-cell, so the list cannot offer a
 * slice the evaluation would then drop.
 *
 * `readBreakdown()` in evaluate_analytics_alerts.js issues
 * `metric_breakdown(key, dimension, start, end, 200, 5, 'contribution')` and
 * then discards residual, suppressed and null rows. All four numbers below are
 * copied from it rather than chosen: a slice ranked past 200 is folded into the
 * residual bucket and CAN NEVER FIRE, and one under the min-cell threshold is
 * withheld — offering either would produce an alert that silently never
 * notifies anybody.
 *
 * The period is left unresolved (the server's own default window). A band may
 * name any window, so no single period would be right here; this list decides
 * WHICH slice, never what its number is.
 */
const { rows: sliceRows, loading: slicesLoading } = useMetricBreakdown(
  {
    metricKey: () => form.value.metricKey,
    dimension: () => form.value.dimension,
    limit: 200,
    minCell: 5,
    rankBy: 'contribution',
  },
  { enabled: () => !!(form.value.metricKey && form.value.dimension && open.value) },
)

const dimensionValueOptions = computed(() => {
  const options = (sliceRows.value ?? [])
    .filter((r) => !r.isResidual && !r.suppressed && r.dimensionValue !== null)
    .map((r) => ({
      value: String(r.dimensionValue),
      label: r.label || segmentLabel(r.dimensionValue) || String(r.dimensionValue),
    }))
  // A saved slice that has since fallen below the min-cell threshold, or out of
  // the top 200, is not in the list any more. Keeping it selectable is the
  // difference between "this alert still watches what it says it watches" and
  // silently rewriting somebody's alert to cover every slice on their next
  // edit — the select would show nothing and save null.
  const current = form.value.dimensionValue
  if (current && !options.some((o) => o.value === String(current))) {
    options.unshift({ value: String(current), label: `${current} (not currently visible)` })
  }
  return options
})

// ── the ladder ──────────────────────────────────────────────────────────────

function addBand() {
  if (form.value.bands.length >= MAX_BANDS) return
  // Seeded from the previous rung — an escalation ladder is usually the same
  // question at a higher number, and re-picking the comparator and window for
  // every rung is busywork. Severity steps up one rank because that is what a
  // second band is nearly always for; it is a select, not a decision made here.
  // The key is always new: see toDraftBand() on why it is never reused.
  const previous = form.value.bands[form.value.bands.length - 1]
  form.value.bands.push(
    blankBand(
      previous
        ? {
            comparator: previous.comparator,
            window: previous.window,
            severity: nextSeverity(previous.severity),
          }
        : {},
    ),
  )
}

/** One rung up the CHECK's severity vocabulary, stopping at the top. */
function nextSeverity(severity) {
  const rank = severityRank(severity)
  return SEVERITIES.find((s) => s.rank === rank + 1)?.value ?? severity
}

function removeBand(index) {
  form.value.bands.splice(index, 1)
  if (!form.value.bands.length) form.value.bands = [blankBand()]
}

// ── validation ──────────────────────────────────────────────────────────────

const nameProblem = computed(() => {
  const name = form.value.name.trim()
  if (!name) return ''
  return (props.takenNames ?? []).includes(name.toLowerCase())
    ? 'Another alert in your company already uses this name.'
    : ''
})

const alertSuppressProblem = computed(() => {
  const minutes = Number(form.value.suppressWindowMinutes)
  if (
    !Number.isInteger(minutes) ||
    minutes < SUPPRESS_MIN_MINUTES ||
    minutes > SUPPRESS_MAX_MINUTES
  ) {
    return `Repeat-after must be a whole number of minutes between ${SUPPRESS_MIN_MINUTES} and ${SUPPRESS_MAX_MINUTES}.`
  }
  return ''
})

/** The payload as it would be stored, so validation tests the real thing. */
const draftBands = computed(() =>
  normaliseBands(
    form.value.bands.map((b) => ({
      ...b,
      recipients: canNameOthers.value ? b.recipients : [],
    })),
  ),
)

const problems = computed(() => {
  const out = []
  if (!form.value.name.trim()) out.push('Give the alert a name.')
  if (nameProblem.value) out.push(nameProblem.value)
  if (!form.value.metricKey) out.push('Choose the metric to watch.')
  if (alertSuppressProblem.value) out.push(alertSuppressProblem.value)
  out.push(...bandProblems(draftBands.value))
  return out
})

const canSave = computed(() => problems.value.length === 0 && !saving.value)

// ── save ────────────────────────────────────────────────────────────────────

const saveAlert = useLiveMutation(async (db, payload) => {
  if (payload.id) {
    const existing = await db.AnalyticsAlert.findByPk(payload.id)
    if (!existing) throw new Error('That alert no longer exists.')
    Object.assign(existing, payload.attrs)
    await existing.save()
    return existing
  }
  const created = db.AnalyticsAlert.create(payload.attrs)
  await created.save()
  return created
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const description = form.value.description.trim()
    const saved = await saveAlert({
      id: props.alert?.id ?? null,
      attrs: {
        name: form.value.name.trim(),
        // NULL rather than '', so the list falls back cleanly instead of
        // rendering an empty line where a description would be.
        description: description || null,
        metricKey: form.value.metricKey,
        dimension: form.value.dimension || null,
        // Pinned to null without a dimension — analytics_alerts_dimension_chk.
        dimensionValue: form.value.dimension ? form.value.dimensionValue || null : null,
        recipients: clampRecipients(form.value.recipients, viewer.value),
        bands: draftBands.value,
        suppressWindowMinutes: Number(form.value.suppressWindowMinutes),
        isActive: form.value.isActive,
        // `filters` is deliberately absent — see the header. The column
        // defaults to {} and nothing here may widen it.
      },
    })
    // useLiveMutation RESOLVES on failure — it toasts the error and returns
    // undefined rather than rejecting. Treating the call as a promise that
    // throws would close the dialog on a rejected write and discard the draft
    // while telling the user it saved.
    if (!saved) return
    toast.success(props.alert ? 'Alert updated' : 'Alert created')
    emit('saved', saved)
    open.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    :title="alert ? 'Edit alert' : 'New alert'"
    subtitle="Watch a metric and notify people when it crosses a threshold. Every figure is recalculated for each recipient under their own access."
    size="3xl"
    persistent
    showClose
  >
    <div class="tw:flex tw:flex-col tw:gap-5">
      <!-- ── what to watch ────────────────────────────────────────────── -->
      <div class="tw:flex tw:flex-col tw:gap-3">
        <BaseText weight="medium">What to watch</BaseText>

        <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
          <BaseTextInput
            v-model="form.name"
            label="Alert name"
            placeholder="e.g. Overdue CAPAs climbing"
            :errorMsg="nameProblem"
          />
          <BaseSelect
            v-model="form.metricKey"
            label="Metric"
            :options="metricOptions"
            :loading="metricsLoading"
            placeholder="Choose what to watch"
          />
        </div>

        <BaseTextarea
          v-model="form.description"
          label="Description"
          :rows="2"
          placeholder="What this alert is for, and what someone should do when it fires."
        />

        <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
          <BaseSelect
            v-model="form.dimension"
            label="Split by"
            :options="dimensionOptions"
            :disabled="!form.metricKey"
            nullLabel="Whole metric — no split"
            hint="Split the metric and every segment is checked on its own."
          />
          <BaseSelect
            v-model="form.dimensionValue"
            label="Only this segment"
            :options="dimensionValueOptions"
            :disabled="!form.dimension"
            :loading="slicesLoading"
            nullLabel="Every segment, checked separately"
            hint="Segments too small to report are not offered — they can never cross a threshold."
          />
        </div>
      </div>

      <!-- ── who is told ──────────────────────────────────────────────── -->
      <div class="tw:flex tw:flex-col tw:gap-3 tw:border-t tw:border-divider tw:pt-4">
        <BaseText weight="medium">Who is told</BaseText>

        <UserSelectMenu
          v-if="canNameOthers"
          v-model="form.recipients"
          multiple
        />
        <BaseText v-else variant="caption" color="secondary">
          This alert will notify only you. Naming anybody else needs the Reports &amp; Dashboards
          <strong>manage</strong> permission.
        </BaseText>

        <!--
          The one product limitation an author cannot discover for themselves.
          `analytics_alert_events.evaluated_as_user_id` is CHECKed equal to
          `recipient_user_id`, so the figure is only ever the recipient's own.
        -->
        <BaseBanner
          tone="warning"
          :icon="IconUsers"
          title="Each person is alerted using their own access"
          message="The number is recalculated for every recipient from what that person can see, so a threshold you cross may not be crossed for them. Naming someone whose access is narrower than yours — a site head on a critical band, say — will not reach them, because under their own scope the figure never gets that high."
        />

        <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
          <BaseTextInput
            v-model="form.suppressWindowMinutes"
            label="Do not repeat within (minutes)"
            type="number"
            :min="SUPPRESS_MIN_MINUTES"
            :max="SUPPRESS_MAX_MINUTES"
            step="1"
            :errorMsg="alertSuppressProblem"
            :instructions="`Currently ${formatMinutes(form.suppressWindowMinutes)}. A band may set its own. An escalation is never held back by a lower band's window.`"
          />
          <div class="tw:flex tw:items-end">
            <BaseCheckbox v-model="form.isActive" label="Active — evaluate this alert" />
          </div>
        </div>
      </div>

      <!-- ── the ladder ───────────────────────────────────────────────── -->
      <div class="tw:flex tw:flex-col tw:gap-3 tw:border-t tw:border-divider tw:pt-4">
        <div class="tw:flex tw:items-center tw:justify-between">
          <BaseText weight="medium">Threshold bands</BaseText>
          <BaseButton
            size="sm"
            variant="outline"
            :disabled="form.bands.length >= MAX_BANDS"
            @click="addBand"
          >
            <IconPlus :size="14" aria-hidden="true" />
            Add band
          </BaseButton>
        </div>

        <BaseText variant="caption" color="secondary">
          Every band a person is on is checked, and only the most severe one they cross fires — so a
          warning and a critical never arrive together for the same number. Each band has its own
          window, so "20 over 30 days" and "50 over 90 days" are two different questions.
        </BaseText>

        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseCard v-for="(band, i) in form.bands" :key="band.key" class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
              <BaseText variant="caption" color="secondary">
                Band {{ i + 1 }} · {{ band.key }}
              </BaseText>
              <BaseButton
                v-if="form.bands.length > 1"
                size="sm"
                variant="text"
                :aria-label="`Remove band ${i + 1}`"
                @click="removeBand(i)"
              >
                <IconTrash :size="14" aria-hidden="true" />
              </BaseButton>
            </div>

            <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2 tw:lg:grid-cols-4">
              <BaseSelect
                v-model="band.severity"
                label="Severity"
                :options="SEVERITY_OPTIONS"
                required
              />
              <BaseSelect
                v-model="band.comparator"
                label="Fires when the value"
                :options="COMPARATOR_OPTIONS"
                required
              />
              <BaseTextInput v-model="band.threshold" label="Threshold" type="number" step="any" />
              <BaseSelect
                v-model="band.window"
                label="Measured over"
                :options="BAND_WINDOW_OPTIONS"
                required
              />
            </div>

            <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
              <div v-if="canNameOthers" class="tw:flex tw:flex-col tw:gap-1">
                <BaseText variant="caption" color="secondary">
                  Also notify on this band
                </BaseText>
                <UserSelectMenu
                  v-model="band.recipients"
                  multiple
                />
              </div>
              <BaseTextInput
                v-model="band.suppressWindowMinutes"
                label="Do not repeat within (minutes)"
                type="number"
                :min="SUPPRESS_MIN_MINUTES"
                :max="SUPPRESS_MAX_MINUTES"
                step="1"
                placeholder="Use the alert default"
              />
            </div>
          </BaseCard>
        </div>

        <BaseText variant="caption" color="secondary">
          A band adds to the people named above — escalating never drops whoever has been watching
          all along.
        </BaseText>
      </div>

      <!--
        Validation is listed, not toasted: it is persistent, anchored to the
        form, and readable by a screen reader in one pass. See
        scripts/check-form-system.mjs (`no-toast-validation`).
      -->
      <div v-if="problems.length" class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:flex tw:items-center tw:gap-1.5">
          <IconAlertTriangle :size="14" class="tw:text-warning" aria-hidden="true" />
          <BaseText variant="caption" weight="medium">Before you can save</BaseText>
        </div>
        <ul class="tw:list-disc tw:pl-6">
          <li v-for="(problem, index) in problems" :key="index">
            <BaseText variant="caption" color="secondary">{{ problem }}</BaseText>
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <BaseDialogFooter
        :loading="saving"
        :disabled="!canSave"
        :submitLabel="alert ? 'Save changes' : 'Create alert'"
        @cancel="open = false"
        @submit="save"
      />
    </template>
  </BaseDialog>
</template>
