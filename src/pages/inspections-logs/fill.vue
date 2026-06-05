<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

/**
 * Dedicated "fill a log / inspection" page.
 *
 * Launched two ways:
 *   - From a task (/tasks): with ?logBookId=…&assignmentInstanceId=… —
 *     opens straight into that log book's fill form; submitting completes
 *     the scheduled instance + its task.
 *   - From the "Submit a log" button: no query — shows the log-book
 *     picker first, then the fill form (ad-hoc submission).
 *
 * Replaces the old in-page modal so the same flow can be fired from a
 * task with all the context (which log book) already known.
 */
defineOptions({
  name: 'InspectionsLogsFillPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}

const route = useRoute()
const router = useRouter()
const toast = useToast()

const open = ref(true)
const logBookId = computed(() =>
  typeof route.query.logBookId === 'string' ? route.query.logBookId : null,
)
const assignmentInstanceId = computed(() =>
  typeof route.query.assignmentInstanceId === 'string' ? route.query.assignmentInstanceId : null,
)

// Where to land afterwards: the task inbox if this came from a task,
// otherwise straight back to the logging dashboard (the log-book list the
// user picked from) — minimise taps for someone logging on the floor.
function done() {
  router.replace(getCompanyPath(assignmentInstanceId.value ? '/task-instances' : '/logging'))
}

// Friction-free submit: skip AddRecordDialog's success screen — toast and
// go straight back so they can grab the next log book.
function onCreated() {
  toast.success('Log saved')
  done()
}
</script>

<template>
  <div class="tw:h-full">
    <AddRecordDialog
      v-model="open"
      classificationFilter="inspections"
      :logBookId="logBookId"
      :assignmentInstanceId="assignmentInstanceId"
      @created="onCreated"
      @close="done"
    />
  </div>
</template>
