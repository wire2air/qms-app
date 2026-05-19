import { ref, watch, computed } from 'vue'

/**
 * AI dashboard data fetcher.
 *
 * Re-fetches whenever `scope`, `since`, or `until` change. The overview
 * call drives the headline numbers + breakdowns + time series. The jobs
 * call drives the recent-calls table (separately paginated).
 */

const OVERVIEW_ENDPOINT = '/api/v1/services/ai/usage/overview'
const JOBS_ENDPOINT = '/api/v1/services/ai/usage/jobs'

export function useAiUsage() {
  const scope = ref('mine') // 'mine' | 'all'
  const since = ref(defaultSince())
  const until = ref(new Date().toISOString())

  const overview = ref(null)
  const overviewLoading = ref(false)
  const overviewError = ref(null)

  const jobs = ref([])
  const jobsTotal = ref(0)
  const jobsLimit = ref(50)
  const jobsOffset = ref(0)
  const jobsLoading = ref(false)
  const jobsError = ref(null)

  const canViewAll = computed(() => !!overview.value?.canViewAll)

  function defaultSince() {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 30)
    return d.toISOString()
  }

  function setPeriod(days) {
    const now = new Date()
    const start = new Date(now.getTime() - days * 24 * 3600 * 1000)
    since.value = start.toISOString()
    until.value = now.toISOString()
  }

  async function loadOverview() {
    overviewLoading.value = true
    overviewError.value = null
    try {
      const q = new URLSearchParams({ scope: scope.value, since: since.value, until: until.value })
      const res = await fetch(`${OVERVIEW_ENDPOINT}?${q}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      overview.value = await res.json()
    } catch (e) {
      overviewError.value = e.message ?? 'Failed to load overview'
    } finally {
      overviewLoading.value = false
    }
  }

  async function loadJobs() {
    jobsLoading.value = true
    jobsError.value = null
    try {
      const q = new URLSearchParams({
        scope: scope.value,
        since: since.value,
        until: until.value,
        limit: String(jobsLimit.value),
        offset: String(jobsOffset.value),
      })
      const res = await fetch(`${JOBS_ENDPOINT}?${q}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      jobs.value = json.jobs ?? []
      jobsTotal.value = json.total ?? 0
    } catch (e) {
      jobsError.value = e.message ?? 'Failed to load jobs'
    } finally {
      jobsLoading.value = false
    }
  }

  function refresh() {
    loadOverview()
    loadJobs()
  }

  // Refetch on filter changes. Reset pagination when scope/range changes.
  watch([scope, since, until], () => {
    jobsOffset.value = 0
    refresh()
  }, { immediate: true })

  // Refetch jobs on pagination changes (without re-running overview)
  watch([jobsOffset, jobsLimit], () => {
    loadJobs()
  })

  return {
    scope,
    since,
    until,
    setPeriod,
    canViewAll,
    overview,
    overviewLoading,
    overviewError,
    jobs,
    jobsTotal,
    jobsLimit,
    jobsOffset,
    jobsLoading,
    jobsError,
    refresh,
  }
}
