<script setup>
import { IconRocket, IconUsers } from '@tabler/icons-vue'
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  trainingId: { type: String, required: true },
  trainingTitle: { type: String, default: '' },
})

const model = defineModel({ type: Boolean, default: false })
const router = useRouter()

const launching = ref(false)
const error = ref(null)
const launched = ref(null)

async function handleLaunch() {
  launching.value = true
  error.value = null
  launched.value = null
  try {
    const data = await post(`/v1/services/trainings/${props.trainingId}/launch`, {})
    launched.value = data
  } catch (err) {
    error.value = err.message || 'Failed to launch training'
  } finally {
    launching.value = false
  }
}

function handleClose() {
  if (launched.value) {
    router.push(getCompanyPath(`/training-instances/${launched.value.trainingInstance?.id}`))
  }
  model.value = false
  launched.value = null
  error.value = null
}
</script>

<template>
  <BaseDialog v-model="model" title="Launch Training" maxWidth="sm">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <template v-if="!launched">
        <div class="tw:flex tw:items-start tw:gap-3 tw:bg-blue-50 tw:rounded-lg tw:p-3">
          <IconRocket :size="20" class="tw:text-blue-600 tw:shrink-0 tw:mt-0.5" />
          <div>
            <p class="tw:text-sm tw:font-medium tw:text-on-sidebar">{{ trainingTitle }}</p>
            <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
              Launching creates a training instance and assigns tasks to all matching users from the training's roles and user assignments.
            </p>
          </div>
        </div>

        <div v-if="error" class="tw:text-sm tw:text-red-600 tw:bg-red-50 tw:rounded-lg tw:p-3">
          {{ error }}
        </div>

        <div class="tw:flex tw:justify-end tw:gap-2">
          <BaseButton variant="secondary" @click="model = false">Cancel</BaseButton>
          <BaseButton variant="primary" :loading="launching" @click="handleLaunch">
            <IconRocket :size="16" class="tw:mr-1" /> Launch
          </BaseButton>
        </div>
      </template>

      <template v-else>
        <div class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:py-4">
          <div class="tw:w-12 tw:h-12 tw:rounded-full tw:bg-green-100 tw:text-green-600 tw:flex tw:items-center tw:justify-center">
            <IconUsers :size="24" />
          </div>
          <div class="tw:text-center">
            <p class="tw:font-semibold tw:text-on-sidebar">Training Launched!</p>
            <p class="tw:text-sm tw:text-secondary tw:mt-1">
              Assigned to <strong>{{ launched.assigneeCount }}</strong> user{{ launched.assigneeCount !== 1 ? 's' : '' }}.
            </p>
          </div>
        </div>
        <div class="tw:flex tw:justify-end">
          <BaseButton variant="primary" @click="handleClose">View Instance</BaseButton>
        </div>
      </template>
    </div>
  </BaseDialog>
</template>
