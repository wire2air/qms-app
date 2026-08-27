<script setup>
/**
 * The alert list: what is being watched, at what thresholds, and who gets told.
 *
 * ── WHAT A ROW MAY SHOW, AND WHAT IT MUST NOT ───────────────────────────────
 * The name, the metric, the ladder, and the people. Deliberately NOT a current
 * value: `analytics_alerts` holds no computed figure by design (the same rule
 * as `analytics_dashboards` and `analytics_reports`), and an alert's number is
 * resolved PER RECIPIENT under that recipient's own scope. A "currently 47"
 * printed here would be the list-builder's number shown to everyone who can see
 * the row — the exact leak the whole layer is shaped to prevent.
 *
 * ── WHO IS IN THIS LIST ─────────────────────────────────────────────────────
 * `analytics_alerts_select_rls` admits the owner, the company owner, anybody
 * with `reports_dashboards:read`, and anybody the alert NOTIFIES. So a
 * colleague's alert can appear here because it mails you. The split below is
 * ownership, which is presentational — nothing on this page filters for
 * security; a row you may not read is simply not in the result.
 *
 * ── TWO THINGS A ROW SAYS OUT LOUD BECAUSE THEY ARE OTHERWISE SILENT ────────
 *  • PAUSED. `is_active = false` is swept out by `analytics_alerts_sweep_idx`,
 *    so a paused alert never evaluates. Without the badge it reads as working.
 *  • FILTERS. `evaluate_analytics_alerts` REFUSES any alert whose `filters` are
 *    non-empty — no metric executor accepts them, and evaluating the unfiltered
 *    metric would fire on records the author excluded. No editor in this
 *    feature can produce one, so a row carrying filters predates this UI or was
 *    written by hand; it looks active and will never fire, which is worth a
 *    badge rather than a mystery.
 *
 * ── DELETE vs PAUSE ─────────────────────────────────────────────────────────
 * `analytics_alert_events.alert_id` is ON DELETE **RESTRICT**: deleting the
 * rule is not a way to delete the evidence that it mailed somebody. An alert
 * that has fired must be paused or soft-deleted instead, so Pause is offered
 * beside Delete rather than being buried in the editor.
 */
import { currentSession, isAllowed } from '@/utils/currentSession'
import {
  alertHasFilters,
  canDeleteAlert,
  canUpdateAlert,
  describeBand,
  effectiveRecipients,
  severityBadgeClass,
  severityLabel,
  severityRank,
} from '@/utils/analyticsAlerts.js'
import { useMetricCatalog } from '@/composables/useAnalytics.js'
import {
  IconBellRinging,
  IconFileAnalytics,
  IconLock,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from '@tabler/icons-vue'

const router = useRouter()
const toast = useToast()
const { entitled } = useAnalyticsEntitlement()

const alerts = useLiveQuery(
  async (db) => {
    const rows = await db.AnalyticsAlert.where().exec()
    return rows.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
  },
  { models: 'AnalyticsAlert', initial: [] },
)

const viewerId = computed(() => currentSession.value?.id ?? null)

const viewer = computed(() => ({
  userId: viewerId.value,
  // The server is authoritative; this only decides which controls to draw.
  canManage: isAllowed(['reports_dashboards:manage']),
}))

// Fetched HERE rather than inside the dialog, so opening and closing the
// builder does not re-issue the same query each time.
const { metrics, loading: metricsLoading } = useMetricCatalog()

const metricLabelByKey = computed(() => {
  const out = {}
  for (const m of metrics.value ?? []) out[m.metricKey] = m.name || m.metricKey
  return out
})

function metricLabel(alert) {
  return metricLabelByKey.value[alert?.metricKey] ?? alert?.metricKey ?? '—'
}

/** The slice this alert watches, as a phrase. */
function sliceLabel(alert) {
  if (!alert?.dimension) return 'Whole metric'
  return alert.dimensionValue
    ? `${alert.dimension}: ${alert.dimensionValue}`
    : `Every ${alert.dimension}, separately`
}

/** The ladder, most severe first — the order the runner walks it in. */
function bandsOf(alert) {
  const bands = Array.isArray(alert?.bands) ? alert.bands : []
  return bands.slice().sort((a, b) => severityRank(b?.severity) - severityRank(a?.severity))
}

function notifiesMe(alert) {
  return !!viewerId.value && effectiveRecipients(alert).includes(viewerId.value)
}

function recipientCount(alert) {
  return effectiveRecipients(alert).length
}

// ── create / edit ───────────────────────────────────────────────────────────

const builderOpen = ref(false)
const editing = ref(null)

function newAlert() {
  editing.value = null
  builderOpen.value = true
}

function editAlert(alert) {
  editing.value = alert
  builderOpen.value = true
}

/**
 * `analytics_alerts_name_uniq` is (company_id, lower(name)) WHERE deleted_at IS
 * NULL — tenant-wide, not per owner. Handed to the dialog so a clash is a field
 * message rather than a unique-violation toast after the user pressed Save.
 */
const takenNames = computed(() =>
  (alerts.value ?? [])
    .filter((a) => a.id !== editing.value?.id)
    .map((a) => String(a.name ?? '').toLowerCase()),
)

// ── pause / delete ──────────────────────────────────────────────────────────

const setActive = useLiveMutation(async (db, { id, isActive }) => {
  const alert = await db.AnalyticsAlert.findByPk(id)
  if (!alert) throw new Error('That alert no longer exists.')
  alert.isActive = isActive
  await alert.save()
  return alert
})

async function toggleActive(alert) {
  const next = !alert.isActive
  const saved = await setActive({ id: alert.id, isActive: next })
  // useLiveMutation resolves rather than rejects on failure and has already
  // toasted the reason; a success message here would contradict it.
  if (!saved) return
  toast.success(next ? 'Alert resumed' : 'Alert paused')
}

const removeAlert = useLiveMutation(async (db, id) => {
  const alert = await db.AnalyticsAlert.findByPk(id)
  if (alert) await alert.delete()
  return true
})

async function remove(alert) {
  const done = await removeAlert(alert.id)
  if (!done) return
  toast.success('Alert deleted')
}

// ── grouping (presentational only — see the header) ─────────────────────────

const groups = computed(() => {
  const mine = []
  const others = []
  for (const a of alerts.value ?? []) {
    if (viewerId.value && a.ownerId === viewerId.value) mine.push(a)
    else others.push(a)
  }
  return [
    {
      key: 'mine',
      title: 'Your alerts',
      rows: mine,
      emptyTitle: 'You have no alerts yet',
      emptyDescription:
        'An alert watches one metric and notifies people when it crosses a threshold you set.',
    },
    {
      key: 'others',
      title: 'Other people’s alerts',
      rows: others,
      emptyTitle: 'Nothing from anyone else',
      emptyDescription:
        'Alerts your colleagues have created, and any that are set up to notify you, appear here.',
    },
  ]
})
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconBellRinging" title="Alerts">
      <template #actions>
        <BaseButton size="sm" variant="outline" @click="router.push('/analytics/reports')">
          <IconFileAnalytics :size="14" aria-hidden="true" />
          Reports
        </BaseButton>
        <BaseButton size="sm" @click="newAlert">
          <IconPlus :size="14" aria-hidden="true" />
          New alert
        </BaseButton>
      </template>
    </PageHeader>

    <PageSection v-if="entitled === false" variant="card">
      <BaseEmptyState
        :icon="IconLock"
        title="Not included in your plan"
        description="Reports & Dashboards is not part of your current subscription."
      />
    </PageSection>

    <template v-else>
      <PageSection v-for="group in groups" :key="group.key" :title="group.title">
        <BaseEmptyState
          v-if="(group.rows?.length ?? 0) === 0"
          :title="group.emptyTitle"
          :description="group.emptyDescription"
        />

        <ContentGrid v-else min="22rem">
          <BaseClickableRow
            v-for="a in group.rows"
            :key="a.id"
            :to="`/analytics/alerts/${a.id}`"
            :aria-label="`Open alert ${a.name}`"
          >
            <BaseCard class="tw:h-full">
              <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
                <div class="tw:min-w-0">
                  <BaseText weight="medium" class="tw:truncate">{{ a.name }}</BaseText>
                  <BaseText variant="caption" color="secondary" class="tw:truncate">
                    {{ metricLabel(a) }} · {{ sliceLabel(a) }}
                  </BaseText>
                </div>
                <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-1">
                  <BaseBadge v-if="!a.isActive" class="tw:bg-gray-100 tw:text-gray-700">
                    Paused
                  </BaseBadge>
                  <BaseBadge v-if="notifiesMe(a)" class="tw:bg-blue-100 tw:text-blue-700">
                    Notifies you
                  </BaseBadge>
                </div>
              </div>

              <BaseText
                v-if="a.description"
                variant="caption"
                color="secondary"
                class="tw:mt-2 tw:line-clamp-2"
              >
                {{ a.description }}
              </BaseText>

              <!--
                A row this UI can no longer produce, and one that looks active
                and never fires. See the header.
              -->
              <BaseText v-if="alertHasFilters(a)" variant="caption" color="secondary" class="tw:mt-2">
                ⚠ This alert has saved filters. It will not be evaluated until they are cleared.
              </BaseText>

              <div class="tw:mt-3 tw:flex tw:flex-wrap tw:gap-1">
                <BaseBadge
                  v-for="band in bandsOf(a)"
                  :key="band.key"
                  :class="severityBadgeClass(band.severity)"
                  :title="describeBand(band)"
                >
                  {{ severityLabel(band.severity) }} {{ band.threshold }}
                </BaseBadge>
              </div>

              <div class="tw:mt-3 tw:flex tw:items-center tw:justify-between tw:gap-2">
                <BaseText variant="caption" color="secondary">
                  {{ recipientCount(a) }}
                  {{ recipientCount(a) === 1 ? 'recipient' : 'recipients' }}
                </BaseText>
                <div class="tw:flex tw:items-center tw:gap-1">
                  <!--
                    .stop.prevent because the whole card is a RouterLink:
                    without both, acting on a row also navigates into it.
                  -->
                  <BaseButton
                    v-if="canUpdateAlert(a, viewer)"
                    size="sm"
                    variant="text"
                    :aria-label="a.isActive ? `Pause alert ${a.name}` : `Resume alert ${a.name}`"
                    :title="a.isActive ? 'Pause — a paused alert is never evaluated' : 'Resume'"
                    @click.stop.prevent="toggleActive(a)"
                  >
                    <IconPlayerPause v-if="a.isActive" :size="14" aria-hidden="true" />
                    <IconPlayerPlay v-else :size="14" aria-hidden="true" />
                  </BaseButton>
                  <BaseButton
                    v-if="canUpdateAlert(a, viewer)"
                    size="sm"
                    variant="text"
                    :aria-label="`Edit alert ${a.name}`"
                    @click.stop.prevent="editAlert(a)"
                  >
                    <IconPencil :size="14" aria-hidden="true" />
                  </BaseButton>
                  <BaseButton
                    v-if="canDeleteAlert(a, viewer)"
                    size="sm"
                    variant="text"
                    :aria-label="`Delete alert ${a.name}`"
                    @click.stop.prevent="remove(a)"
                  >
                    <IconTrash :size="14" aria-hidden="true" />
                  </BaseButton>
                </div>
              </div>
            </BaseCard>
          </BaseClickableRow>
        </ContentGrid>
      </PageSection>

      <AlertBuilderDialog
        v-model:open="builderOpen"
        :alert="editing"
        :metrics="metrics ?? []"
        :metricsLoading="metricsLoading"
        :takenNames="takenNames"
      />
    </template>
  </BasePage>
</template>
