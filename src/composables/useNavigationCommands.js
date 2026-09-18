import { useRouter } from 'vue-router'
import { registerCommands } from '@shared/composables/useCommandRegistry.js'
import { ROUTE_META } from '@/router/routeMeta.js'

/**
 * useNavigationCommands — registers "Go to X" command-palette entries derived
 * from the route-metadata registry (B7), so the palette (C4) can navigate
 * anywhere without hand-maintaining a separate list. Call once near the app root.
 *
 * Only static-title, non-dynamic routes become nav commands (skip `:param`
 * detail patterns and function titles). Each command's `perform` pushes the path.
 */
export function useNavigationCommands() {
  const router = useRouter()
  const commands = Object.entries(ROUTE_META)
    .filter(([pattern, meta]) => !pattern.includes(':') && typeof meta.title === 'string')
    .map(([pattern, meta]) => ({
      id: `nav:${pattern}`,
      title: `Go to ${meta.title}`,
      group: 'Navigate',
      icon: meta.icon,
      keywords: [meta.title],
      perform: () => router.push(pattern),
    }))
  registerCommands(commands)
}
