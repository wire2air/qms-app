/**
 * provideDataTablePersist — wires <DataTable persistKey="…"> view-state
 * persistence to the current user's synced settings bag.
 *
 * Call once near the app root. Every DataTable below it (directly or via the
 * BaseTable adapter) that sets a `persistKey` will persist its density, sort,
 * filters and column visibility/pinning to `User.settings` under
 * `tableView:<persistKey>` — IndexedDB + cross-device sync via the syncEngine
 * (NOT localStorage). DataTable injects this adapter under the string key
 * 'qms:dataTableViewPersist' and stays decoupled from the session/model layer.
 */
import { useUserSettings } from './useUserSettings'

export function provideDataTablePersist() {
  const { ready, getSetting, setSetting } = useUserSettings()
  provide('qms:dataTableViewPersist', {
    ready,
    get: (key) => getSetting(`tableView:${key}`, null),
    set: (key, value) => setSetting(`tableView:${key}`, value),
  })
}
