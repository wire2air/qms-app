<script setup>
defineOptions({
  name: 'CompanyDashboard',
})

const route = useRoute()
const showOnboarding = ref(route.query.onboarding === 'true')
</script>

<template>
  <DashboardHome />
  <OnboardingDialog v-model="showOnboarding" />
</template>
