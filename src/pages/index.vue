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
import { isSupplier } from '@/utils/currentSession'

const router = useRouter()
const route = useRoute()

const query = route.query.onboarding ? { onboarding: route.query.onboarding } : {}
const target = isSupplier.value ? 'supplier' : 'dashboard'
router.replace({ path: getCompanyPath(target), query })
</script>
