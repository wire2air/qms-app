<script setup>
/**
 * One alert: the ladder as it stands now, and the record of what it has
 * actually sent — TO YOU.
 *
 * ── WHY THE HISTORY IS ALWAYS YOURS, AND WHY THE PAGE SAYS SO ───────────────
 * `analytics_alert_events_select_rls` gates on
 *
 *   recipient_user_id = me OR is_owner
 *
 * and deliberately NOT on `reports_dashboards:manage`. That is not an oversight
 * and it is the one policy in this layer that is not about who may read a
 * definition: `observed_value` is a resolved figure, computed under exactly one
 * person's scope, and `manage` says nothing about scope — so admitting a
 * manage-holder would hand a department-scoped administrator figures from above
 * their own ceiling.
 *
 * The consequence on screen is that an empty history is AMBIGUOUS: it means
 * either "this alert has never fired" or "it has never fired FOR YOU". Those
 * are very different facts and the second one is the common case for anybody
 * looking at a colleague's alert. So the page states which list it is showing
 * rather than letting the emptiness be read as the alert being broken.
 *
 * ── AND WHY EVERY ROW READS FROM ITS OWN SNAPSHOT ───────────────────────────
 * `analytics_alert_events.band` stores the band WHOLE as it stood when it
 * fired, and `comparator` / `threshold_value` / `severity` / `window_token` are
 * a CHECK-pinned projection of that snapshot. So the history is rendered from
 * the event, never from the alert's current ladder — otherwise editing a
 * threshold would silently rewrite the explanation of every past notification,
 * and "why did I get this?" is the question this table exists to answer.
 */
import { DateTime } from 'luxon'
import { currentSession, isAllowed } from '@/utils/currentSession'
import {
  alertHasFilters,
  canUpdateAlert,
  comparatorLabel,
  effectiveRecipients,
  formatMinutes,
  severityBadgeClass,
  severityLabel,
  severityRank,
} from '@/utils/analyticsAlerts.js'
import { periodTokenLabel } from '@/utils/analyticsPeriods.js'
import { formatMetricValue, formatPeriod } from '@/utils/analyticsFormat.js'
import { useMetricCatalog } from '@/composables/useAnalytics.js'
import {
  IconAlertTriangle,
  IconBellRinging,
  IconPencil,
  IconUsers,
} from '@tabler/icons-vue'

const route = useRoute()
const router = useRouter()

const alertId = computed(() => String(route.params.id ?? ''))

// No `initial`, as ReportDetail does it: `alert` stays UNDEFINED until the
// first result lands, so the template can tell "still loading" from "not found,
// or not readable by you". Collapsing the two flashes "not found" on every
// navigation.
const alert = useLiveQueryWithDeps(
  [() => alertId.value],
  async (db, [id]) => (id ? await db.AnalyticsAlert.findByPk(id) : null),
  { models: 'AnalyticsAlert' },
)

const events = useLiveQueryWithDeps(
  [() => alertId.value],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.AnalyticsAlertEvent.where('alertId', id).exec()
    return rows.slice().sort((a, b) => firedAtMillis(b) - firedAtMillis(a))
  },
  { models: 'AnalyticsAlertEvent', initial: [] },
)

const viewer = computed(() => ({
  userId: currentSession.value?.id ?? null,
  canManage: isAllowed(['reports_dashboards:manage']),
}))

const { metrics, loading: metricsLoading } = useMetricCatalog()

const metricByKey = computed(() => {
  const out = {}
  for (const m of metrics.value ?? []) out[m.metricKey] = m
  return out
})

const metricLabel = computed(
  () => metricByKey.value[alert.value?.metricKey]?.name || alert.value?.metricKey || '—',
)

const sliceLabel = computed(() => {
  const a = alert.value
  if (!a?.dimension) return 'Whole metric'
  return a.dimensionValue ? `${a.dimension}: ${a.dimensionValue}` : `Every ${a.dimension}, separately`
})

/** Most severe first — the order the runner walks the ladder in. */
const bands = computed(() => {
  const list = Array.isArray(alert.value?.bands) ? alert.value.bands : []
  return list.slice().sort((a, b) => severityRank(b?.severity) - severityRank(a?.severity))
})

const baseRecipients = computed(() => (alert.value?.recipients ?? []).map(String))
const allRecipients = computed(() => effectiveRecipients(alert.value))

// ── builder ─────────────────────────────────────────────────────────────────

const builderOpen = ref(false)

/**
 * `analytics_alerts_name_uniq` is (company_id, lower(name)) WHERE deleted_at IS
 * NULL — TENANT-wide, not per owner, because an alert puts mail in other
 * people's inboxes and two identically named ones is a support ticket. Every
 * readable name minus this alert's own, so renaming into a clash is a field
 * message rather than a unique-violation toast after Save.
 */
const otherAlerts = useLiveQuery(
  async (db) => db.AnalyticsAlert.where().exec(),
  { models: 'AnalyticsAlert', initial: [] },
)

const takenNames = computed(() =>
  (otherAlerts.value ?? [])
    .filter((a) => a.id !== alertId.value)
    .map((a) => String(a.name ?? '').toLowerCase()),
)

// ── event rendering ─────────────────────────────────────────────────────────

/**
 * `firedAt` may arrive as a luxon DateTime (the model's `@Property({ type:
 * DateTime })`) or as an ISO string on a row that has not been rehydrated.
 * Both are handled rather than assumed, because the failure of assuming is a
 * silently unsorted history.
 */
function firedAtDate(event) {
  const raw = event?.firedAt
  if (!raw) return null
  const dt = DateTime.isDateTime(raw) ? raw : DateTime.fromISO(String(raw))
  return dt.isValid ? dt : null
}

function firedAtMillis(event) {
  return firedAtDate(event)?.toMillis() ?? 0
}

function firedAtLabel(event) {
  return firedAtDate(event)?.formatDate('datetime') ?? '—'
}

/**
 * Both figures arrive as STRINGS — they are `numeric` columns and PostGraphile
 * renders those as strings to keep the precision. Handed to `formatMetricValue`
 * raw rather than through `Number()`, because `Number(null)` is 0 and a
 * missing figure would print as a confident "0" rather than an em-dash.
 */
function valueLabel(event) {
  return formatMetricValue(event?.observedValue, unitOf(event))
}

function thresholdLabel(event) {
  return formatMetricValue(event?.thresholdValue, unitOf(event))
}

/**
 * The unit comes from the catalog, not the event — `analytics_alert_events`
 * snapshots the figure and not its formatting, and a metric's unit is a
 * property of the metric rather than of the firing.
 */
function unitOf(event) {
  return metricByKey.value[event?.metricKey]?.unit ?? ''
}

/**
 * `formatPeriod` takes ISO date STRINGS, and the model declares windowStart /
 * windowEnd as `DateTime` — handing it the objects produces an invalid date and
 * a silently blank window rather than an error.
 */
function isoDate(value) {
  if (!value) return null
  const dt = DateTime.isDateTime(value) ? value : DateTime.fromISO(String(value))
  return dt.isValid ? dt.toISODate() : null
}

function windowLabel(event) {
  const token = periodTokenLabel(event?.windowToken)
  // window_start / window_end are NULLABLE on purpose: last_12_months resolves
  // to (NULL, NULL), meaning the server's own whole-month window. The TOKEN is
  // the authoritative record of the period; the dates are the convenience.
  const start = isoDate(event?.windowStart)
  const end = isoDate(event?.windowEnd)
  if (!start && !end) return token
  return `${token} (${formatPeriod(start, end)})`
}

function sliceOf(event) {
  if (!event?.dimension) return '—'
  return event.dimensionValue ? `${event.dimension}: ${event.dimensionValue}` : event.dimension
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconBellRinging" :title="alert?.name || 'Alert'">
      <template #actions>
        <BaseBadge v-if="alert && !alert.isActive" class="tw:bg-gray-100 tw:text-gray-700">
          Paused
        </BaseBadge>
        <BaseButton
          v-if="alert && canUpdateAlert(alert, viewer)"
          size="sm"
          variant="outline"
          @click="builderOpen = true"
        >
          <IconPencil :size="14" aria-hidden="true" />
          Edit
        </BaseButton>
      </template>
    </PageHeader>

    <BaseEmptyState
      v-if="alert === null"
      title="Alert not found"
      description="It may have been deleted, or you may not have access to it."
    >
      <BaseButton size="sm" variant="outline" @click="router.push('/analytics/alerts')">
        Back to alerts
      </BaseButton>
    </BaseEmptyState>

    <template v-else-if="alert">
      <BaseBanner
        v-if="!alert.isActive"
        tone="neutral"
        title="This alert is paused"
        message="A paused alert is never evaluated, so nobody is notified while it stays this way."
      />

      <!--
        No editor in this feature can produce filters; the runner refuses to
        evaluate an alert that has them. Such a row looks active and never
        fires, which is worth saying rather than leaving as a mystery.
      -->
      <BaseBanner
        v-if="alertHasFilters(alert)"
        tone="danger"
        :icon="IconAlertTriangle"
        title="This alert has saved filters and is not being evaluated"
        message="No metric in this layer accepts filters, and evaluating without them would make this a broader alert than the one that was saved — so it is skipped entirely. Clear the filters to bring it back into service."
      />

      <PageSection title="What it watches">
        <BaseCard>
          <BaseDescriptionList>
            <BaseDescriptionItem label="Metric">
              {{ metricsLoading ? '…' : metricLabel }}
            </BaseDescriptionItem>
            <BaseDescriptionItem label="Segment">{{ sliceLabel }}</BaseDescriptionItem>
            <BaseDescriptionItem label="Do not repeat within">
              {{ formatMinutes(alert.suppressWindowMinutes) }}
            </BaseDescriptionItem>
          </BaseDescriptionList>

          <BaseText v-if="alert.description" variant="caption" color="secondary" class="tw:mt-3">
            {{ alert.description }}
          </BaseText>
        </BaseCard>
      </PageSection>

      <PageSection title="Threshold bands">
        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseCard v-for="band in bands" :key="band.key" padding="sm">
            <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              <BaseBadge :class="severityBadgeClass(band.severity)">
                {{ severityLabel(band.severity) }}
              </BaseBadge>
              <BaseText variant="caption">
                when the value {{ comparatorLabel(band.comparator) }}
                <strong>{{ band.threshold }}</strong>
                over {{ periodTokenLabel(band.window).toLowerCase() }}
              </BaseText>
              <BaseText
                v-if="band.suppressWindowMinutes"
                variant="caption"
                color="secondary"
                class="tw:ml-auto"
              >
                repeats no sooner than {{ formatMinutes(band.suppressWindowMinutes) }}
              </BaseText>
            </div>
            <div
              v-if="(band.recipients ?? []).length"
              class="tw:mt-2 tw:flex tw:flex-wrap tw:items-center tw:gap-1"
            >
              <BaseText variant="caption" color="secondary">Also notified:</BaseText>
              <UserBadgeById v-for="id in band.recipients" :key="id" :userId="id" />
            </div>
          </BaseCard>
        </div>
      </PageSection>

      <PageSection title="Who is told">
        <BaseCard>
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
            <UserBadgeById v-for="id in baseRecipients" :key="id" :userId="id" />
            <BaseText v-if="!allRecipients.length" variant="caption" color="secondary">
              Nobody. This alert notifies no one, so it will never send anything.
            </BaseText>
          </div>

          <!--
            The one product limitation an author cannot discover for themselves.
            `evaluated_as_user_id` is CHECKed equal to `recipient_user_id`, so a
            recipient's figure is only ever their own.
          -->
          <BaseBanner
            tone="warning"
            :icon="IconUsers"
            title="Each person is alerted using their own access"
            message="The number is recalculated for every recipient from what that person can see, so a threshold you cross may not be crossed for them. Naming someone whose access is narrower than yours — a site head on a critical band, say — will not reach them, because under their own scope the figure never gets that high."
            class="tw:mt-3"
          />
        </BaseCard>
      </PageSection>

      <PageSection title="Sent to you">
        <BaseText variant="caption" color="secondary" class="tw:mb-2">
          This history shows only the notifications <strong>you</strong> were sent. Everyone sees
          their own — a colleague on this alert has their own list, and an empty one here does not
          mean the alert has never fired.
        </BaseText>

        <BaseEmptyState
          v-if="(events?.length ?? 0) === 0"
          :icon="IconBellRinging"
          title="Nothing has been sent to you for this alert"
          description="Either it has not crossed a threshold under your access, or you are not one of its recipients."
        />

        <BaseCard v-else padding="none">
          <div class="tw:overflow-x-auto">
            <table class="tw:w-full tw:text-left tw:text-xs">
              <thead class="tw:border-b tw:border-divider tw:text-secondary">
                <tr>
                  <th scope="col" class="tw:p-3 tw:font-medium">When</th>
                  <th scope="col" class="tw:p-3 tw:font-medium">Severity</th>
                  <th scope="col" class="tw:p-3 tw:font-medium">Segment</th>
                  <th scope="col" class="tw:p-3 tw:font-medium">Value</th>
                  <th scope="col" class="tw:p-3 tw:font-medium">Crossed</th>
                  <th scope="col" class="tw:p-3 tw:font-medium">Measured over</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="event in events"
                  :key="event.id"
                  class="tw:border-b tw:border-divider tw:last:border-b-0"
                >
                  <td class="tw:p-3 tw:whitespace-nowrap">{{ firedAtLabel(event) }}</td>
                  <td class="tw:p-3">
                    <BaseBadge :class="severityBadgeClass(event.severity)">
                      {{ severityLabel(event.severity) }}
                    </BaseBadge>
                  </td>
                  <td class="tw:p-3">{{ sliceOf(event) }}</td>
                  <td class="tw:p-3 tw:font-medium">{{ valueLabel(event) }}</td>
                  <td class="tw:p-3">
                    {{ comparatorLabel(event.comparator) }} {{ thresholdLabel(event) }}
                  </td>
                  <td class="tw:p-3">{{ windowLabel(event) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </BaseCard>

        <BaseText variant="caption" color="secondary" class="tw:mt-2">
          Each row is explained by the band exactly as it stood when it fired, not by the ladder
          above — editing a threshold does not rewrite what you were told.
        </BaseText>
      </PageSection>

      <AlertBuilderDialog
        v-model:open="builderOpen"
        :alert="alert"
        :metrics="metrics ?? []"
        :metricsLoading="metricsLoading"
        :takenNames="takenNames"
      />
    </template>
  </BasePage>
</template>
