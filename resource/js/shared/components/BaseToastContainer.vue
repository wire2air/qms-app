<script setup>
import { computed } from 'vue'
import { useToast } from '@shared/composables/useToast.js'

const { toasts, dismiss } = useToast()

const positionClasses = {
  top: 'tw:top-4 tw:inset-x-0 tw:flex-col tw:items-center',
  'top-right': 'tw:top-4 tw:right-4 tw:flex-col tw:items-end',
  'top-left': 'tw:top-4 tw:left-4 tw:flex-col tw:items-start',
  bottom: 'tw:bottom-4 tw:inset-x-0 tw:flex-col-reverse tw:items-center',
  'bottom-right': 'tw:bottom-4 tw:right-4 tw:flex-col-reverse tw:items-end',
  'bottom-left': 'tw:bottom-4 tw:left-4 tw:flex-col-reverse tw:items-start',

  // FIXED: Uses inset-0 and flex centering instead of translates
  center: 'tw:inset-0 tw:flex-col tw:items-center tw:justify-center',
}

const slideFrom = {
  top: 'tw:opacity-0 tw:-translate-y-4',
  'top-right': 'tw:opacity-0 tw:translate-x-4',
  'top-left': 'tw:opacity-0 tw:-translate-x-4',
  bottom: 'tw:opacity-0 tw:translate-y-4',
  'bottom-right': 'tw:opacity-0 tw:translate-x-4',
  'bottom-left': 'tw:opacity-0 tw:-translate-x-4',
  // Center is now only opacity for a clean fade-in/out
  center: 'tw:opacity-0',
}

const positions = Object.keys(positionClasses)

const groupedToasts = computed(() => {
  const groups = {}
  for (const toast of toasts.value) {
    const pos = toast.position || 'top'
    if (!groups[pos]) groups[pos] = []
    groups[pos].push(toast)
  }
  return groups
})
</script>

<template>
  <Teleport to="body">
    <TransitionGroup
      v-for="position in positions"
      :key="position"
      tag="div"
      :class="[
        'tw:fixed tw:z-toast tw:flex tw:gap-2 tw:pointer-events-none tw:w-full tw:max-w-full',
        positionClasses[position],
      ]"
      enterActiveClass="tw:transition-all tw:duration-300 tw:ease-out"
      :enterFromClass="slideFrom[position] || slideFrom.top"
      enterToClass="tw:opacity-100 tw:translate-x-0 tw:translate-y-0 tw:scale-100"
      leaveActiveClass="tw:transition-all tw:duration-200 tw:ease-in tw:absolute"
      leaveFromClass="tw:opacity-100 tw:translate-x-0 tw:translate-y-0 tw:scale-100"
      :leaveToClass="slideFrom[position] || slideFrom.top"
      moveClass="tw:transition-all tw:duration-300 tw:ease-in-out"
    >
      <BaseToast
        v-for="toast in groupedToasts[position] || []"
        :id="toast.id"
        :key="toast.id"
        :type="toast.type"
        :message="toast.message"
        :caption="toast.caption"
        :html="toast.html"
        :multiLine="toast.multiLine"
        class="tw:pointer-events-auto"
        @dismiss="dismiss"
      />
    </TransitionGroup>
  </Teleport>
</template>
