<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

const router = useRouter()
const route = useRoute()

const query = route.query.onboarding ? { onboarding: route.query.onboarding } : {}
router.replace({ path: getCompanyPath('dashboard'), query })
</script>
