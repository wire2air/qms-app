<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  id: {
    type: String,
    default: undefined,
  },
})

// The standalone templates list moved into the App Builder workspace
// (Forms tab); /templates without an id redirects there. Detail pages
// (/templates/:id) keep working unchanged.
const router = useRouter()
onMounted(() => {
  if (!props.id) router.replace(getCompanyPath('/records?tab=forms'))
})
</script>

<template>
  <FormTemplatePageId v-if="props.id" :id="props.id" />
</template>
