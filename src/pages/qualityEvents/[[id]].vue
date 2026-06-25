<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'

const route = useRoute()
const router = useRouter()
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }

const showCreate = ref(false)

watch(
  () => route.query.create,
  (v) => {
    if (!route.params.id && v === '1') showCreate.value = true
  },
  { immediate: true },
)

watch(showCreate, (v) => {
  if (!v && route.query.create === '1') {
    const query = { ...route.query }
    delete query.create
    router.replace({ query })
  }
})

function onCreated(event) {
  showCreate.value = false
  if (event?.id) router.push(getCompanyPath(`/qualityEvents/${event.id}`))
}
</script>

<template>
  <QualityEventsPageId v-if="route.params.id" :id="route.params.id" />
  <QualityEventsHome v-else />
  <QualityEventCreateDialog
    v-if="!route.params.id && showCreate"
    v-model="showCreate"
    @created="onCreated"
  />
</template>
