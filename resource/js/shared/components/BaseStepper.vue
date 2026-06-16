<script setup>
/**
 * BaseStepper — progress through an ordered set of steps (wizards, approval
 * overviews, multi-stage forms). Horizontal or vertical.
 *
 *   <BaseStepper v-model="current" :steps="steps" />            // horizontal
 *   <BaseStepper v-model="current" :steps="steps" orientation="vertical" clickable>
 *     <template #content="{ step, index }">…</template>          // vertical body
 *   </BaseStepper>
 *
 * Each step: { title, description?, icon?, status? }. Status is derived from
 * position vs the current index (complete / current / upcoming) unless the step
 * sets an explicit status ('complete' | 'current' | 'upcoming' | 'error').
 */
import { IconCheck, IconX } from '@tabler/icons-vue'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  orientation: { type: String, default: 'horizontal' }, // 'horizontal' | 'vertical'
  clickable: { type: Boolean, default: false },
})

const emit = defineEmits(['stepClick'])

// 0-based index of the current step
const current = defineModel({ type: Number, default: 0 })

function statusOf(step, index) {
  if (step.status) return step.status
  if (index < current.value) return 'complete'
  if (index === current.value) return 'current'
  return 'upcoming'
}

const NODE = {
  complete: 'tw:bg-primary tw:text-on-primary tw:border-primary',
  current: 'tw:bg-primary tw:text-on-primary tw:border-primary tw:ring-4 tw:ring-primary/20',
  error: 'tw:bg-bad tw:text-white tw:border-bad',
  upcoming: 'tw:bg-card tw:text-secondary tw:border-divider',
}

function nodeClass(step, index) {
  return NODE[statusOf(step, index)] || NODE.upcoming
}

function isDone(step, index) {
  return statusOf(step, index) === 'complete'
}
function isError(step, index) {
  return statusOf(step, index) === 'error'
}

function onClick(step, index) {
  if (!props.clickable || step.disabled) return
  emit('stepClick', index)
  current.value = index
}
</script>

<template>
  <!-- Horizontal -->
  <div v-if="orientation === 'horizontal'" class="tw:flex tw:w-full tw:items-start">
    <template v-for="(step, index) in steps" :key="index">
      <div
        class="tw:flex tw:flex-col tw:items-center tw:gap-1.5 tw:text-center"
        :class="clickable && !step.disabled ? 'tw:cursor-pointer' : ''"
        @click="onClick(step, index)"
      >
        <div
          class="tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-full tw:border-2 tw:text-sm tw:font-semibold tw:transition-all"
          :class="nodeClass(step, index)"
        >
          <IconCheck v-if="isDone(step, index)" :size="16" />
          <IconX v-else-if="isError(step, index)" :size="16" />
          <component :is="step.icon" v-else-if="step.icon" :size="16" />
          <span v-else>{{ index + 1 }}</span>
        </div>
        <div class="tw:max-w-28">
          <div
            class="tw:text-xs tw:font-semibold tw:leading-tight"
            :class="
              statusOf(step, index) === 'upcoming' ? 'tw:text-secondary' : 'tw:text-on-main'
            "
          >
            {{ step.title }}
          </div>
          <div v-if="step.description" class="tw:mt-0.5 tw:text-[11px] tw:text-secondary">
            {{ step.description }}
          </div>
        </div>
      </div>

      <!-- Connector -->
      <div
        v-if="index < steps.length - 1"
        class="tw:mt-4 tw:h-0.5 tw:flex-1 tw:rounded-full tw:transition-colors"
        :class="index < current ? 'tw:bg-primary' : 'tw:bg-divider'"
      />
    </template>
  </div>

  <!-- Vertical -->
  <div v-else class="tw:flex tw:flex-col">
    <div v-for="(step, index) in steps" :key="index" class="tw:flex tw:gap-3">
      <!-- Rail -->
      <div class="tw:flex tw:flex-col tw:items-center">
        <div
          class="tw:flex tw:size-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:border-2 tw:text-sm tw:font-semibold tw:transition-all"
          :class="[nodeClass(step, index), clickable && !step.disabled ? 'tw:cursor-pointer' : '']"
          @click="onClick(step, index)"
        >
          <IconCheck v-if="isDone(step, index)" :size="16" />
          <IconX v-else-if="isError(step, index)" :size="16" />
          <component :is="step.icon" v-else-if="step.icon" :size="16" />
          <span v-else>{{ index + 1 }}</span>
        </div>
        <div
          v-if="index < steps.length - 1"
          class="tw:w-0.5 tw:flex-1 tw:rounded-full"
          :class="index < current ? 'tw:bg-primary' : 'tw:bg-divider'"
        />
      </div>

      <!-- Body -->
      <div class="tw:flex-1 tw:pb-6">
        <div
          class="tw:text-sm tw:font-semibold"
          :class="[
            statusOf(step, index) === 'upcoming' ? 'tw:text-secondary' : 'tw:text-on-main',
            clickable && !step.disabled ? 'tw:cursor-pointer' : '',
          ]"
          @click="onClick(step, index)"
        >
          {{ step.title }}
        </div>
        <div v-if="step.description" class="tw:mt-0.5 tw:text-xs tw:text-secondary">
          {{ step.description }}
        </div>
        <div v-if="$slots.content && index === current" class="tw:mt-3">
          <slot name="content" :step="step" :index="index" />
        </div>
      </div>
    </div>
  </div>
</template>
