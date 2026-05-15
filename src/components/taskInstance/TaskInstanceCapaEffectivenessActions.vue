<script setup>
import { IconRefresh, IconCheck } from '@tabler/icons-vue'

const props = defineProps({
  taskInstance: { type: Object, required: true },
})

// Find the effectiveness-check row tied to this task. The reminder task
// stores the CAPA id in entityId, and the check row holds a back-link via
// task_instance_id so we can find it directly.
const check = useLiveQueryWithDeps(
  [() => props.taskInstance.id],
  async (db, [taskInstanceId]) => {
    if (!taskInstanceId) return null
    return db.CapaEffectivenessCheck.where('taskInstanceId', taskInstanceId).first()
  },
)

const showComplete = ref(false)
const showRenew = ref(false)
</script>

<template>
  <template v-if="check">
    <button
      class="tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:rounded-lg tw:border tw:border-divider tw:text-on-main tw:hover:bg-main-hover"
      @click="showRenew = true"
    >
      <IconRefresh :size="14" />
      Renew
    </button>
    <button
      class="tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:rounded-lg tw:bg-primary tw:text-white tw:hover:opacity-90"
      @click="showComplete = true"
    >
      <IconCheck :size="14" />
      Complete
    </button>

    <CapaEffectivenessCheckCompleteDialog
      v-model="showComplete"
      :capaId="check.capaId"
      :checkId="check.id"
    />
    <CapaEffectivenessCheckRenewDialog
      v-model="showRenew"
      :capaId="check.capaId"
      :checkId="check.id"
    />
  </template>
</template>
