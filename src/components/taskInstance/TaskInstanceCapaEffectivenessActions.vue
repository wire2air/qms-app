<script setup>
import { IconShieldCheck } from '@tabler/icons-vue'

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
  { models: ['CapaEffectivenessCheck'] },
)

// Single "Verify Effectiveness" entrypoint — the consolidated dialog
// internally lets the owner pick Effective / Not Effective / Extend
// (the latter replaces the old standalone Renew button).
const showComplete = ref(false)
</script>

<template>
  <template v-if="check">
    <button
      class="tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:rounded-lg tw:bg-primary tw:text-white tw:hover:opacity-90"
      @click="showComplete = true"
    >
      <IconShieldCheck :size="14" />
      Verify Effectiveness
    </button>

    <CapaEffectivenessCheckCompleteDialog
      v-model="showComplete"
      :capaId="check.capaId"
      :checkId="check.id"
    />
  </template>
</template>
