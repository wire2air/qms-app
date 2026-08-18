<script setup>
/**
 * The report list: the ones we ship, yours, and those shared with you.
 *
 * ── WHY THE SHIPPED REPORTS ARE THEIR OWN GROUP ─────────────────────────────
 * Same reasoning as DashboardsHome's `is_system` note, one step further. A
 * seeded report is `shared` and owned by whoever the seeder ran as, so a plain
 * owner split would file all eight of them under "shared with you" — where they
 * read as something a colleague built, and a tenant that then tries to delete
 * one gets a refusal from the DELETE policy with no explanation on the page.
 * Grouping them under "Provided with Qability" states up front what they are,
 * and the row badge repeats it for anyone who arrives by direct link and never
 * sees the grouping.
 *
 * The other two groups are the visibility model, verbatim from DashboardsHome:
 * "private" and "shared" is the whole of it, and a flat list hides which is
 * which. What the list CANNOT do is show you someone else's private report: the
 * SELECT policy resolves that server-side and a private row simply is not in
 * the result. No client-side filtering here is doing security work — every
 * grouping below is presentational only.
 *
 * ── WHAT A ROW IS ALLOWED TO SHOW ───────────────────────────────────────────
 * Name, description, visibility, and how many sections the definition asks for.
 * Deliberately not a single figure: `definition` stores the questions and the
 * answers are computed per viewer at render time (CLAUDE.md rule #4), so a
 * number printed on this list would be the list-builder's number shown to
 * everyone who can see the row.
 *
 * Creating and editing live on the report page, not here — this is the list.
 */
import { currentSession } from '@/utils/currentSession'
import { canDeleteReport, canEditReport } from '@/utils/analyticsReportAccess.js'
import {
  IconFileAnalytics,
  IconLayoutDashboard,
  IconLock,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-vue'

const router = useRouter()
const toast = useToast()
const { entitled } = useAnalyticsEntitlement()

const reports = useLiveQuery(
  async (db) => {
    const rows = await db.AnalyticsReport.where().exec()
    return rows.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
  },
  { models: 'AnalyticsReport', initial: [] },
)

const viewerId = computed(() => currentSession.value?.id ?? null)

/**
 * How many sections this report asks for. `definition` defaults to `{}` in the
 * database, so an authored-but-empty report is normal, not a fault — show 0
 * rather than hiding the line, otherwise the row looks like it failed to load.
 */
function sectionCount(report) {
  const sections = report?.definition?.sections
  return Array.isArray(sections) ? sections.length : 0
}

// ── create / edit ───────────────────────────────────────────────────────────
// The catalog is fetched HERE rather than inside the dialog, so opening and
// closing the builder does not re-issue the same query each time.
const { metrics, loading: metricsLoading } = useMetricCatalog()

const builderOpen = ref(false)
const editing = ref(null)

function newReport() {
  editing.value = null
  builderOpen.value = true
}

function editReport(r) {
  editing.value = r
  builderOpen.value = true
}

const viewer = computed(() => ({
  userId: viewerId.value,
  // The server is authoritative; this only decides which buttons to draw.
  canManage: !!currentSession.value?.permissions?.includes?.('reports_dashboards:manage'),
}))

const removeReport = useLiveMutation(async (db, id) => {
  const r = await db.AnalyticsReport.findByPk(id)
  if (r) await r.delete()
})

async function remove(r) {
  try {
    await removeReport(r.id)
    toast.success('Report deleted')
  } catch (err) {
    toast.error(err?.message || 'Could not delete the report')
  }
}

const groups = computed(() => {
  const provided = []
  const mine = []
  const shared = []
  for (const r of reports.value ?? []) {
    if (r.isSystem) provided.push(r)
    else if (viewerId.value && r.ownerId === viewerId.value) mine.push(r)
    else shared.push(r)
  }
  return [
    {
      key: 'provided',
      title: 'Provided with Qability',
      rows: provided,
      // Dropped entirely when empty rather than shown with an empty state:
      // nothing to explain when a tenant simply has no seeds yet, and "no
      // provided reports" reads as a missing feature rather than an empty list.
      hideWhenEmpty: true,
    },
    {
      key: 'mine',
      title: 'Your reports',
      rows: mine,
      emptyTitle: 'You have no reports yet',
      emptyDescription: 'Open one of the provided reports to see the shape of one.',
    },
    {
      key: 'shared',
      title: 'Shared with you',
      rows: shared,
      emptyTitle: 'Nothing shared with you yet',
      emptyDescription: 'Reports other people share with the team will appear here.',
    },
  ].filter((g) => !(g.hideWhenEmpty && g.rows.length === 0))
})
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconFileAnalytics" title="Reports">
      <template #actions>
        <BaseButton size="sm" variant="outline" @click="router.push('/analytics/dashboards')">
          <IconLayoutDashboard :size="14" aria-hidden="true" />
          Dashboards
        </BaseButton>
        <BaseButton size="sm" @click="newReport">
          <IconPlus :size="14" aria-hidden="true" />
          New report
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

        <ContentGrid v-else min="18rem">
          <BaseClickableRow
            v-for="r in group.rows"
            :key="r.id"
            :to="`/analytics/reports/${r.id}`"
            :aria-label="`Open report ${r.name}`"
          >
            <BaseCard class="tw:h-full">
              <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
                <div class="tw:min-w-0">
                  <BaseText weight="medium" class="tw:truncate">{{ r.name }}</BaseText>
                  <BaseText
                    v-if="r.description"
                    variant="caption"
                    color="secondary"
                    class="tw:line-clamp-2"
                  >
                    {{ r.description }}
                  </BaseText>
                </div>
                <DashboardVisibilityBadgeById :visibilityId="r.visibility" />
              </div>

              <div class="tw:mt-3 tw:flex tw:items-center tw:justify-between tw:gap-2">
                <BaseText variant="caption" color="secondary">
                  {{ sectionCount(r) }} {{ sectionCount(r) === 1 ? 'section' : 'sections' }}
                </BaseText>
                <div class="tw:flex tw:items-center tw:gap-1">
                  <BaseBadge v-if="r.isSystem" class="tw:bg-gray-100 tw:text-gray-700">
                    Provided with Qability
                  </BaseBadge>
                  <!--
                    .stop.prevent because the whole card is a RouterLink: without
                    both, editing or deleting also navigates into the report the
                    user just acted on.
                  -->
                  <BaseButton
                    v-if="canEditReport(r, viewer)"
                    size="sm"
                    variant="ghost"
                    :aria-label="`Edit report ${r.name}`"
                    @click.stop.prevent="editReport(r)"
                  >
                    <IconPencil :size="14" aria-hidden="true" />
                  </BaseButton>
                  <BaseButton
                    v-if="canDeleteReport(r, viewer)"
                    size="sm"
                    variant="ghost"
                    :aria-label="`Delete report ${r.name}`"
                    @click.stop.prevent="remove(r)"
                  >
                    <IconTrash :size="14" aria-hidden="true" />
                  </BaseButton>
                </div>
              </div>
            </BaseCard>
          </BaseClickableRow>
        </ContentGrid>
      </PageSection>

      <ReportBuilderDialog
        v-model:open="builderOpen"
        :report="editing"
        :metrics="metrics ?? []"
        :metricsLoading="metricsLoading"
      />
    </template>
  </BasePage>
</template>
