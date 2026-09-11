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
//
// This route is `/templates/[[id]]` — an OPTIONAL param — so `/templates/:id`
// and `/templates` are the same route record and Vue Router reuses this
// component instance across them rather than remounting it. Clicking the
// "Form Templates" breadcrumb from a form's detail page navigates from
// `/templates/<id>` to `/templates`, which only changes `props.id`; an
// onMounted-only redirect never re-runs, so the page was left rendering
// `<FormTemplatePageId v-if="props.id">` with id now undefined — a blank
// page instead of the intended redirect. Watching id (immediate: true, so
// direct navigation to `/templates` still redirects too) covers both cases.
const router = useRouter()
watch(
  () => props.id,
  (id) => {
    if (!id) router.replace(getCompanyPath('/records?tab=forms'))
  },
  { immediate: true },
)
</script>

<template>
  <FormTemplatePageId v-if="props.id" :id="props.id" />
</template>
