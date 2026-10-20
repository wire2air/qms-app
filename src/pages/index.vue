<script setup>
/**
 * Universal post-login landing route. EXTERNAL_SUPPLIER sessions get their own
 * purpose-built, RLS-scoped portal (`/supplier`) — everyone else lands on the
 * internal company dashboard. Both `App.vue`'s auth-page and tenant-mismatch
 * redirects funnel through here too (they navigate to `/`, not `/dashboard`
 * directly) specifically so this one branch is the only place that decides —
 * see docs/modules/dashboard's 2026-09-07 addendum, finding 1.
 */
import { getCompanyPath } from '@/utils/routeHelpers'
import { isSupplier, currentSession, isAllowed } from '@/utils/currentSession'
import { isSupportHost } from '@/utils/tenant'

const router = useRouter()
const route = useRoute()

const query = route.query.onboarding ? { onboarding: route.query.onboarding } : {}

// Support-desk-only users (agents whose only module is complaint_management,
// beyond the baseline org lookups every user can read) go straight to the
// inbox: the QMS dashboard would be an empty page for them.
const BASELINE = new Set(['complaint_management', 'sites', 'departments', 'users'])
function isDeskOnly() {
  const s = currentSession.value
  if (!s || s.isOwner || !isAllowed(['complaint_management:read'])) return false
  return !(s.permissions || []).some((p) => {
    const [mod, verb] = p.split(':')
    return verb === 'read' && !BASELINE.has(mod)
  })
}
const target = isSupplier.value
  ? 'supplier'
  : currentSession.value?.isSupportUser || isSupportHost() || isDeskOnly()
    ? 'desk'
    : 'dashboard'
router.replace({ path: getCompanyPath(target), query })
</script>
