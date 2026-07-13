import { currentCompany } from '@/utils/currentCompany.js'
import { get, post, put, patch } from '@/api'

const symbol = Symbol('useRoles')

function RolesState() {
  const roles = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Filters
  const filters = ref({
    search: '',
    statusId: 'ACTIVE', // Default to active roles
  })

  function buildFilterParams() {
    const params = {}

    Object.keys(filters.value).forEach((key) => {
      const value = filters.value[key]
      if (value !== null && value !== '' && typeof value === 'string' && value.trim() !== '') {
        params[key] = value.trim()
      } else if (
        value !== null &&
        value !== '' &&
        typeof value !== 'string' &&
        (Array.isArray(value) ? value?.length > 0 : true)
      ) {
        params[key] = value
      }
    })

    return params
  }

  // Fetch roles
  async function fetchRoles() {
    error.value = null

    const data = await get('/v1/services/roles', {
      params: buildFilterParams(),
      loader: loading,
    })
    roles.value = data.roles || []
  }

  // Watch filters and refetch
  watch(
    filters,
    () => {
      fetchRoles()
    },
    { deep: true },
  )

  // Fetch roles when company changes
  watch(
    () => currentCompany.value?.id,
    (newId) => {
      if (newId) {
        fetchRoles()
      }
    },
    { immediate: true },
  )

  // Fetch single role
  async function fetchRole(id) {
    error.value = null

    const data = await get(`/v1/services/roles/${id}`, {
      loader: loading,
    })
    return data.role
  }

  // Update role
  async function updateRole(id, payload) {
    error.value = null

    await put(`/v1/services/roles/${id}`, payload, {
      loader: loading,
    })

    const result = await fetchRole(id)

    // Update role in the roles array
    const roleIndex = roles.value.findIndex((r) => r.id === id)
    if (roleIndex !== -1) {
      roles.value[roleIndex] = result
    }

    return { success: true, role: result }
  }

  // Create role
  async function createRole(payload) {
    error.value = null

    const result = await post('/v1/services/roles', payload, {
      loader: loading,
    })
    await fetchRoles()
    return { success: true, role: result.role }
  }

  // Deactivate role
  async function deactivateRole(id) {
    error.value = null

    await put(
      `/v1/services/roles/${id}`,
      { statusId: 'INACTIVE' },
      {
        loader: loading,
      },
    )

    const roleIndex = roles.value.findIndex((r) => r.id === id)
    if (roleIndex !== -1) {
      roles.value[roleIndex] = { ...roles.value[roleIndex], statusId: 'INACTIVE' }
    }

    return true
  }

  // Activate role
  async function activateRole(id) {
    error.value = null

    await put(
      `/v1/services/roles/${id}`,
      { statusId: 'ACTIVE' },
      {
        loader: loading,
      },
    )

    const roleIndex = roles.value.findIndex((r) => r.id === id)
    if (roleIndex !== -1) {
      roles.value[roleIndex] = { ...roles.value[roleIndex], statusId: 'ACTIVE' }
    }

    return true
  }

  // Lock / unlock a role (protect it from edits).
  async function setRoleLock(id, locked) {
    error.value = null
    await patch(`/v1/services/roles/${id}/lock`, { locked }, { loader: loading })
    const result = await fetchRole(id)
    const roleIndex = roles.value.findIndex((r) => r.id === id)
    if (roleIndex !== -1) roles.value[roleIndex] = result
    return { success: true, role: result }
  }

  return {
    roles,
    loading,
    error,
    filters,
    fetchRoles,
    fetchRole,
    updateRole,
    createRole,
    deactivateRole,
    activateRole,
    setRoleLock,
  }
}

/**
 *
 * @returns {ReturnType<typeof RolesState>}
 */
export function useRoles() {
  const state = inject(symbol, null)
  if (!state) {
    return RolesState()
  }
  return state
}

export function provideRoles() {
  const state = RolesState()
  provide(symbol, state)
  return state
}
