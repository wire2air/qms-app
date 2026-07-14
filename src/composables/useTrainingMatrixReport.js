import { DateTime } from 'luxon'

/**
 * Shared data + filtering for the Training Matrix report — used by both the
 * in-app report page and the print module so the two never drift.
 *
 * `getFilters()` returns the current filter values:
 *   { search, status, siteId, departmentId, roleId, userId, from, to }
 * where `from`/`to` are ISO dates (yyyy-MM-dd) or empty. Returns `rows`
 * (filtered, one per employee × training) and `allRows` (unfiltered).
 */
export function useTrainingMatrixReport(getFilters) {
  const assignees = useLiveQuery((db) => db.TrainingAssignee.where().exec(), {
    models: ['TrainingAssignee'],
    initial: [],
  })
  const instances = useLiveQuery((db) => db.TrainingInstance.where().exec(), {
    models: ['TrainingInstance'],
    initial: [],
  })
  const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })
  const rolesOnUsers = useLiveQuery((db) => db.RoleOnUser.where().exec(), {
    models: ['RoleOnUser'],
    initial: [],
  })
  const roles = useLiveQuery((db) => db.Role.where().exec(), { models: ['Role'], initial: [] })

  const instanceById = computed(() =>
    Object.fromEntries((instances.value || []).map((i) => [i.id, i])),
  )
  const userById = computed(() => Object.fromEntries((users.value || []).map((u) => [u.id, u])))
  const roleNameById = computed(() =>
    Object.fromEntries((roles.value || []).map((r) => [r.id, r.name])),
  )
  const roleIdsByUser = computed(() => {
    const map = {}
    for (const ru of rolesOnUsers.value || []) (map[ru.userId] ||= []).push(ru.roleId)
    return map
  })

  const allRows = computed(() =>
    (assignees.value || [])
      .map((a) => {
        const inst = instanceById.value[a.trainingInstanceId]
        const user = userById.value[a.userId]
        const roleIds = roleIdsByUser.value[a.userId] || []
        const completedRaw = a.completedAt || (a.status === 'VERIFIED' ? a.signedAt : null) || null
        return {
          id: a.id,
          userId: a.userId,
          siteId: user?.siteId || null,
          departmentId: user?.departmentId || null,
          roleIds,
          employee: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : a.userId,
          roles: roleIds.map((rid) => roleNameById.value[rid] || '').filter(Boolean).join(', '),
          trainingId: inst?.trainingId || null,
          training: inst?.snapshot?.title || '—',
          status: a.status,
          completedRaw,
          completedAt: completedRaw?.formatDate?.('date') || '',
          type: inst?.isAdHoc
            ? inst.isRetraining
              ? 'Ad-hoc (retraining)'
              : 'Ad-hoc'
            : 'Standard',
          reason: inst?.adHocReason || '',
        }
      })
      .sort((a, b) => a.employee.localeCompare(b.employee) || a.training.localeCompare(b.training)),
  )

  const rows = computed(() => {
    const f = getFilters() || {}
    const fromMs = f.from ? DateTime.fromISO(f.from).startOf('day').toMillis() : null
    const toMs = f.to ? DateTime.fromISO(f.to).endOf('day').toMillis() : null
    const needle = f.search ? f.search.toLowerCase() : null

    return allRows.value.filter((r) => {
      if (f.status && f.status !== 'all' && r.status !== f.status) return false
      if (f.siteId && r.siteId !== f.siteId) return false
      if (f.departmentId && r.departmentId !== f.departmentId) return false
      if (f.roleId && !r.roleIds.includes(f.roleId)) return false
      if (f.userId && r.userId !== f.userId) return false
      if (fromMs || toMs) {
        const ms = r.completedRaw?.toMillis?.() ?? null
        if (ms == null) return false
        if (fromMs && ms < fromMs) return false
        if (toMs && ms > toMs) return false
      }
      if (needle) {
        const hay = [r.employee, r.roles, r.training, r.status, r.type].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  })

  return { rows, allRows }
}
