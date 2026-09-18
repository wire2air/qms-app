/**
 * Shared option sources for customer-complaint filtering — used by BOTH the page
 * quick-filter toolbar (CustomerComplaintsFilterToolbar) and the table's advanced
 * filter (CustomerComplaintsTable), so the live queries and label maps live in one
 * place (no drift). Returns canonical { id, name } lists; each consumer maps to
 * whatever shape it needs.
 */
export function useComplaintFilterOptions() {
  const PRIORITIES = [
    { id: 'LOW', name: 'Low' },
    { id: 'MEDIUM', name: 'Medium' },
    { id: 'HIGH', name: 'High' },
    { id: 'CRITICAL', name: 'Critical' },
  ]
  const SENTIMENTS = [
    { id: 'POSITIVE', name: 'Positive' },
    { id: 'NEUTRAL', name: 'Neutral' },
    { id: 'NEGATIVE', name: 'Negative' },
    { id: 'URGENT', name: 'Urgent' },
  ]
  const statuses = useLiveQuery(
    (db) => db.CustomerComplaintStatus.where().orderBy('displayOrder').exec(),
    { models: ['CustomerComplaintStatus'], initial: [] },
  )
  const sources = useLiveQuery(
    (db) => db.CustomerComplaintSource.where().orderBy('displayOrder').exec(),
    { models: ['CustomerComplaintSource'], initial: [] },
  )
  const users = useLiveQuery(
    async (db) => (await db.User.where().exec()).filter((u) => u.userStatusId === 'ACTIVE'),
    { models: ['User'], initial: [] },
  )
  const teams = useLiveQuery((db) => db.Team.where().exec(), { models: ['Team'], initial: [] })

  function userLabel(u) {
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email
  }

  return { PRIORITIES, SENTIMENTS, statuses, sources, users, teams, userLabel }
}
