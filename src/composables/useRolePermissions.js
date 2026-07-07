import { PERMISSION_SECTIONS, PERMISSION_ACTIONS_ORDER } from '@/utils/categoryConfig.js'
import { get } from '@/api'

/**
 * Composable for managing role permissions
 * Handles fetching, grouping, filtering, and selection of permissions
 */
export function useRolePermissions() {
  const permissions = ref([])
  const selectedPermissions = ref([])
  const searchTerm = ref('')
  const loading = ref(false)
  const error = ref(null)

  /**
   * Fetch all permissions from the API
   */
  async function fetchPermissions() {
    error.value = null

    const data = await get('/v1/services/permissions', {
      loader: loading,
    })
    permissions.value = data.permissions || []
  }

  /**
   * Group permissions by category
   */
  const permissionGroups = computed(() => {
    const groups = {}

    permissions.value.forEach((permission) => {
      const [category, action] = permission.id.split(':')

      if (!groups[category]) {
        groups[category] = {
          name: category,
          permissions: [],
        }
      }

      groups[category].permissions.push({
        ...permission,
        action,
      })
    })

    return groups
  })

  /**
   * Get all unique permission actions in preferred order
   */
  const permissionActions = computed(() => {
    const actions = new Set()

    permissions.value.forEach((permission) => {
      const action = permission.id.split(':')[1]
      if (action) {
        actions.add(action)
      }
    })

    const ordered = []

    PERMISSION_ACTIONS_ORDER.forEach((action) => {
      if (actions.has(action)) {
        ordered.push(action)
        actions.delete(action)
      }
    })

    return [...ordered, ...actions]
  })

  /**
   * Filter permissions by search term
   */
  const filteredGroups = computed(() => {
    if (!searchTerm.value.trim()) {
      return permissionGroups.value
    }

    const search = searchTerm.value.toLowerCase()
    const filtered = {}

    Object.keys(permissionGroups.value).forEach((category) => {
      const group = permissionGroups.value[category]
      const matchingPerms = group.permissions.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search) ||
          category.toLowerCase().includes(search),
      )

      if (matchingPerms.length > 0) {
        filtered[category] = {
          ...group,
          permissions: matchingPerms,
        }
      }
    })

    return filtered
  })

  /**
   * Group permissions into sections
   */
  const sectionedGroups = computed(() => {
    const groups = filteredGroups.value
    const result = []

    PERMISSION_SECTIONS.forEach((section) => {
      const items = section.categories
        .filter((key) => groups[key])
        .map((key) => {
          return { key, group: groups[key] }
        })

      if (items.length > 0) {
        result.push({ name: section.name, items })
      }
    })

    return result
  })

  /**
   * Check if a permission is selected
   * @param {Object} permission - Permission object with id
   * @returns {boolean}
   */
  function isSelected(permission) {
    return selectedPermissions.value.includes(permission.id)
  }

  // Write actions that are meaningless without `read`: the backend RLS gates the
  // SELECT (read-back) of every create/update/delete mutation on `<resource>:read`,
  // so a role granted a write action but not read can INSERT a row yet fails the
  // mutation's return query. `read` is therefore a hard prerequisite for any write.
  const WRITE_ACTIONS = new Set(['create', 'update', 'delete', 'manage'])

  // Permission ids are `resource:action`, where resource may itself contain a
  // colon (e.g. `qcInspection:lot:read`). The action is always the last segment.
  function actionOf(id) {
    const parts = id.split(':')
    return parts[parts.length - 1]
  }
  function resourceOf(id) {
    const parts = id.split(':')
    return parts.slice(0, -1).join(':')
  }
  function permissionExists(id) {
    return permissions.value.some((p) => p.id === id)
  }
  function select(id) {
    if (!selectedPermissions.value.includes(id)) selectedPermissions.value.push(id)
  }
  function deselect(id) {
    const index = selectedPermissions.value.indexOf(id)
    if (index > -1) selectedPermissions.value.splice(index, 1)
  }

  /**
   * Toggle a permission selection, keeping the read-implied-by-write invariant:
   *  - enabling create/update/delete/manage also enables `<resource>:read`
   *  - disabling `<resource>:read` also clears that resource's write actions
   * @param {Object} permission - Permission object with id
   */
  function togglePermission(permission) {
    const { id } = permission
    const action = actionOf(id)
    const resource = resourceOf(id)
    const isCurrentlySelected = selectedPermissions.value.includes(id)

    if (isCurrentlySelected) {
      deselect(id)
      // Removing read invalidates every write on the same resource.
      if (action === 'read') {
        permissions.value.forEach((p) => {
          if (resourceOf(p.id) === resource && WRITE_ACTIONS.has(actionOf(p.id))) {
            deselect(p.id)
          }
        })
      }
    } else {
      select(id)
      // Any write action implies read.
      if (WRITE_ACTIONS.has(action)) {
        const readId = `${resource}:read`
        if (permissionExists(readId)) select(readId)
      }
    }
  }

  /**
   * Whether an action's checkbox should be locked. `read` is locked (forced on)
   * while any write action for the same resource is selected, so the user can't
   * put the role into the invalid write-without-read state.
   * @param {Array} categoryPermissions - permissions for one resource
   * @param {string} action
   * @returns {boolean}
   */
  function isActionLocked(categoryPermissions, action) {
    if (action !== 'read') return false
    return categoryPermissions.some(
      (p) => WRITE_ACTIONS.has(actionOf(p.id)) && selectedPermissions.value.includes(p.id),
    )
  }

  /**
   * Get permission for a specific action in a category
   * @param {Array} categoryPermissions - Array of permissions for a category
   * @param {string} action - Action name (create, read, update, delete)
   * @returns {Object|null}
   */
  function getPermissionForAction(categoryPermissions, action) {
    return categoryPermissions.find((permission) => permission.action === action) || null
  }

  /**
   * Select all available permissions
   */
  function selectAll() {
    const allPermissionIds = permissions.value.map((p) => p.id)
    selectedPermissions.value = [...allPermissionIds]
  }

  /**
   * Clear all selected permissions
   */
  function clearAll() {
    selectedPermissions.value = []
  }

  /**
   * Set selected permissions from an array of permission IDs
   * @param {Array<string>} permissionIds - Array of permission IDs
   */
  function setSelectedPermissions(permissionIds) {
    selectedPermissions.value = [...permissionIds]
  }

  return {
    // State
    permissions,
    selectedPermissions,
    searchTerm,
    loading,
    error,

    // Computed
    permissionGroups,
    permissionActions,
    filteredGroups,
    sectionedGroups,

    // Methods
    fetchPermissions,
    isSelected,
    togglePermission,
    isActionLocked,
    getPermissionForAction,
    selectAll,
    clearAll,
    setSelectedPermissions,
  }
}
