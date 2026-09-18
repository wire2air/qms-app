<script setup>
/**
 * The dashboard list: yours, and those shared with you.
 *
 * ── WHY THE TWO GROUPS ARE SHOWN SEPARATELY ─────────────────────────────────
 * Because "private" and "shared" are the whole visibility model, and a flat list
 * hides which is which at exactly the moment it matters — when you are about to
 * put something on a board. partitionDashboards() does the split; the badge on
 * each row states it again, since a user who arrives by direct link never sees
 * the grouping.
 *
 * What the list CANNOT do is show you someone else's private board, no matter
 * what it asks for: the SELECT policy resolves that server-side and a private
 * row simply is not in the result. There is no client-side filtering here doing
 * security work — the grouping is presentational only.
 *
 * ── THE SEEDED BOARDS ───────────────────────────────────────────────────────
 * `is_system` rows are the shipped persona defaults. They render like any other
 * shared board (same builder, same RLS, same audit trail) but cannot be deleted
 * — the DELETE policy refuses. Otherwise a tenant deletes one, the next upgrade
 * re-seeds it, and it reappears with no error anywhere.
 */
import {
  VISIBILITY,
  canDeleteDashboard,
  partitionDashboards,
} from '@/utils/analyticsDashboardAccess.js'
import { currentSession } from '@/utils/currentSession'
import { IconLayoutDashboard, IconPlus, IconLock, IconTrash, IconCompass } from '@tabler/icons-vue'

const router = useRouter()
const toast = useToast()
const { entitled } = useAnalyticsEntitlement()

const dashboards = useLiveQuery(async (db) => {
  const rows = await db.AnalyticsDashboard.where().exec()
  return rows.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
}, { models: 'AnalyticsDashboard', initial: [] })

const viewer = computed(() => ({
  userId: currentSession.value?.id ?? null,
  canManage: !!currentSession.value?.permissions?.includes?.('reports_dashboards:manage'),
}))

const groups = computed(() => partitionDashboards(dashboards.value ?? [], viewer.value.userId))

// ── create ──────────────────────────────────────────────────────────────────
const creating = ref(false)
const newName = ref('')

const createDashboard = useLiveMutation(async (db, name) => {
  // owner_id is pinned by the INSERT policy to the caller, so there is nothing
  // to choose here — a dashboard cannot be created already belonging to someone
  // else even if the client tried.
  const d = db.AnalyticsDashboard.create({ name, visibility: VISIBILITY.PRIVATE })
  await d.save()
  return d
})

async function create() {
  const name = newName.value.trim()
  if (!name || creating.value) return
  creating.value = true
  try {
    const d = await createDashboard(name)
    newName.value = ''
    toast.success('Dashboard created')
    if (d?.id) router.push(`/analytics/dashboards/${d.id}`)
  } catch (err) {
    toast.error(err?.message || 'Could not create the dashboard')
  } finally {
    creating.value = false
  }
}

// ── delete ──────────────────────────────────────────────────────────────────
const removeDashboard = useLiveMutation(async (db, id) => {
  const d = await db.AnalyticsDashboard.findByPk(id)
  if (d) await d.delete()
})

async function remove(d) {
  try {
    await removeDashboard(d.id)
    toast.success('Dashboard deleted')
  } catch (err) {
    toast.error(err?.message || 'Could not delete the dashboard')
  }
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconLayoutDashboard" title="Dashboards">
      <template #actions>
        <BaseButton size="sm" variant="outline" @click="router.push('/analytics/explore')">
          <IconCompass :size="14" aria-hidden="true" />
          Data Explorer
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
      <PageSection variant="card">
        <div class="tw:flex tw:items-end tw:gap-2">
          <BaseTextInput
            v-model="newName"
            label="New dashboard"
            placeholder="e.g. Site 2 weekly review"
            class="tw:flex-1"
            @keyup.enter="create"
          />
          <BaseButton :disabled="!newName.trim() || creating" :isLoading="creating" @click="create">
            <IconPlus :size="14" aria-hidden="true" />
            Create
          </BaseButton>
        </div>
        <BaseText variant="caption" color="secondary" class="tw:mt-2">
          New dashboards start private. Share one when you want the team to see it.
        </BaseText>
      </PageSection>

      <PageSection
        v-for="group in [
          { key: 'mine', title: 'Your dashboards', rows: groups.mine },
          { key: 'shared', title: 'Shared with you', rows: groups.shared },
        ]"
        :key="group.key"
        :title="group.title"
      >
        <BaseEmptyState
          v-if="(group.rows?.length ?? 0) === 0"
          :title="
            group.key === 'mine' ? 'You have no dashboards yet' : 'Nothing shared with you yet'
          "
          :description="
            group.key === 'mine'
              ? 'Create one above, or start in the Data Explorer and save a tile from there.'
              : 'Dashboards other people share with the team will appear here.'
          "
        />

        <!--
          BaseCard has exactly two props (padding, as) and ONE default slot — no
          `clickable`, no `#footer`. This block previously passed both. The
          named slot rendered nothing at all, so the delete button and the
          "Provided with Qability" label were invisible on every card since this
          page shipped, and `clickable` fell through as a meaningless attribute
          on a plain div that no keyboard could operate.

          Neither eslint nor the production build says a word about either: an
          unmatched named slot is silently dropped and an unknown prop becomes a
          fallthrough attribute. Only opening the page shows it.

          BaseClickableRow supplies the real affordance — it renders a
          RouterLink, so middle-click, keyboard and open-in-new-tab all work
          without re-implementing any of them.
        -->
        <ContentGrid v-else min="18rem">
          <BaseClickableRow
            v-for="d in group.rows"
            :key="d.id"
            :to="`/analytics/dashboards/${d.id}`"
          >
            <BaseCard class="tw:h-full">
              <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
                <div class="tw:min-w-0">
                  <BaseText weight="medium" class="tw:truncate">{{ d.name }}</BaseText>
                  <BaseText
                    v-if="d.description"
                    variant="caption"
                    color="secondary"
                    class="tw:line-clamp-2"
                  >
                    {{ d.description }}
                  </BaseText>
                </div>
                <DashboardVisibilityBadgeById :visibilityId="d.visibility" />
              </div>

              <div class="tw:mt-3 tw:flex tw:items-center tw:justify-between">
                <BaseText variant="caption" color="secondary">
                  {{ d.isSystem ? 'Provided with Qability' : '' }}
                </BaseText>
                <BaseButton
                  v-if="canDeleteDashboard(d, viewer)"
                  size="sm"
                  variant="ghost"
                  aria-label="Delete dashboard"
                  @click.stop.prevent="remove(d)"
                >
                  <IconTrash :size="14" aria-hidden="true" />
                </BaseButton>
              </div>
            </BaseCard>
          </BaseClickableRow>
        </ContentGrid>
      </PageSection>
    </template>
  </BasePage>
</template>
