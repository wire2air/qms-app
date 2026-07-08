<script setup>
// My Account — tabbed self-service page: personal profile update + security.
import PersonalProfile from '@/components/profile/PersonalProfile.vue'
import PersonalSecurity from '@/components/security/PersonalSecurity.vue'
import { IconUserCircle, IconUser, IconShieldLock } from '@tabler/icons-vue'

defineOptions({ name: 'ProfilePage' })

const tabs = [
  { value: 'profile', label: 'Personal Profile', icon: IconUser },
  { value: 'security', label: 'Personal Security', icon: IconShieldLock },
]

// Honor ?tab=<id> deep-links (e.g. /profile?tab=security).
const route = useRoute()
const router = useRouter()
const validTabIds = new Set(tabs.map((t) => t.value))
const activeTab = ref(validTabIds.has(route.query.tab) ? route.query.tab : 'profile')

watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.has(v)) activeTab.value = v
  },
)
watch(activeTab, (v) => {
  if (route.query.tab !== v) router.replace({ query: { ...route.query, tab: v } })
})
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconUserCircle" title="My Account" />

    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Account settings">
      <BaseTabPanel value="profile">
        <PersonalProfile />
      </BaseTabPanel>

      <BaseTabPanel value="security">
        <PersonalSecurity />
      </BaseTabPanel>
    </BaseTabs>
  </BasePage>
</template>
