/**
 * useUserSettings — read/write the current user's `settings` JSONB (§39).
 *
 * A free-form per-user preference bag that follows the user across devices
 * (synced like any other model field): dashboard widget selection, table
 * column choices per module, one-time notification "seen" flags, etc.
 * Never read by the server — client-owned presentation state only.
 *
 * @example
 *   const { getSetting, setSetting } = useUserSettings()
 *   const widgets = computed(() => getSetting('dashboardWidgets', DEFAULTS))
 *   await setSetting('dashboardWidgets', ['kpis', 'my-tasks'])
 *
 *   // One-time notice:
 *   if (!getSetting('seenQcIntro', false)) { show(); await setSetting('seenQcIntro', true) }
 */
import { currentSession } from '@/utils/currentSession'

export function useUserSettings() {
  const user = useLiveQueryWithDeps(
    [() => currentSession.value?.userId],
    async (db, [userId]) => (userId ? db.User.findByPk(userId) : null),
    { models: 'User' },
  )

  function getSetting(key, fallback = null) {
    const settings = user.value?.settings
    if (!settings || settings[key] === undefined) return fallback
    return settings[key]
  }

  async function setSetting(key, value) {
    if (!user.value) return
    // Assign a fresh object so the model's dirty-tracking registers the change
    // (nested mutation on the same reference wouldn't).
    user.value.settings = { ...(user.value.settings ?? {}), [key]: value }
    await user.value.save()
  }

  const ready = computed(() => user.value !== undefined && user.value !== null)

  return { user, ready, getSetting, setSetting }
}
