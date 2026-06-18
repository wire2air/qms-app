<script setup>
/**
 * BaseStepper — progress through an ordered set of steps (wizards, approval
 * overviews, multi-stage forms). Horizontal or vertical.
 *
 *   <BaseStepper v-model="current" :steps="steps" ariaLabel="Approval progress" />
 *   <BaseStepper v-model="current" :steps="steps" orientation="vertical" clickable>
 *     <template #content="{ step, index }">…</template>          // vertical body
 *   </BaseStepper>
 *
 * Each step: { title, description?, icon?, status?, disabled? }. Status is
 * derived from position vs the current index (complete / current / upcoming)
 * unless the step sets an explicit status ('complete' | 'current' | 'upcoming'
 * | 'error').
 *
 * A11y: rendered as an <ol> with aria-current="step" on the active step;
 * connectors are decorative (aria-hidden). When `clickable`, each step is a real
 * <button> (keyboard-operable, rule #8) rather than a clickable <div>.
 *
 * Icons are NOT auto-imported — pass imported @tabler/icons-vue components.
 */
import { IconCheck, IconX } from '@tabler/icons-vue'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  orientation: { type: String, default: 'horizontal' }, // 'horizontal' | 'vertical'
  clickable: { type: Boolean, default: false },
  // Accessible name for the step list.
  ariaLabel: { type: String, default: undefined },
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

// The interactive element: a real <button> in clickable mode (disabled steps
// render as <button disabled> so they're still announced), otherwise a plain
// <div> (no fake role / tabindex).
function stepTag() {
  return props.clickable ? 'button' : 'div'
}

function onClick(step, index) {
  if (!props.clickable || step.disabled) return
  emit('stepClick', index)
  current.value = index
}
</script>

<template>
  <!-- Horizontal -->
  <ol
    v-if="orientation === 'horizontal'"
    :aria-label="ariaLabel"
    class="tw:flex tw:w-full tw:items-start tw:list-none"
  >
    <template v-for="(step, index) in steps" :key="index">
      <li :aria-current="statusOf(step, index) === 'current' ? 'step' : undefined">
        <component
          :is="stepTag(step)"
          :type="stepTag(step) === 'button' ? 'button' : undefined"
          :disabled="stepTag(step) === 'button' ? step.disabled : undefined"
          class="tw:flex tw:flex-col tw:items-center tw:gap-1.5 tw:text-center tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40 tw:rounded-lg"
          :class="clickable && !step.disabled ? 'tw:cursor-pointer' : ''"
          @click="onClick(step, index)"
        >
          <span
            class="tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-full tw:border-2 tw:text-sm tw:font-semibold tw:transition-all"
            :class="nodeClass(step, index)"
          >
            <IconCheck v-if="isDone(step, index)" :size="16" />
            <IconX v-else-if="isError(step, index)" :size="16" />
            <component :is="step.icon" v-else-if="step.icon" :size="16" />
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span class="tw:max-w-28">
            <span
              class="tw:block tw:text-xs tw:font-semibold tw:leading-tight"
              :class="statusOf(step, index) === 'upcoming' ? 'tw:text-secondary' : 'tw:text-on-main'"
            >
              {{ step.title }}
            </span>
            <span v-if="step.description" class="tw:mt-0.5 tw:block tw:text-[11px] tw:text-secondary">
              {{ step.description }}
            </span>
          </span>
        </component>
      </li>

      <!-- Connector (decorative) -->
      <li
        v-if="index < steps.length - 1"
        aria-hidden="true"
        class="tw:mt-4 tw:h-0.5 tw:flex-1 tw:rounded-full tw:transition-colors"
        :class="index < current ? 'tw:bg-primary' : 'tw:bg-divider'"
      />
    </template>
  </ol>

  <!-- Vertical -->
  <ol v-else :aria-label="ariaLabel" class="tw:flex tw:flex-col tw:list-none">
    <li
      v-for="(step, index) in steps"
      :key="index"
      class="tw:flex tw:gap-3"
      :aria-current="statusOf(step, index) === 'current' ? 'step' : undefined"
    >
      <!-- Rail -->
      <div class="tw:flex tw:flex-col tw:items-center">
        <component
          :is="stepTag(step)"
          :type="stepTag(step) === 'button' ? 'button' : undefined"
          :disabled="stepTag(step) === 'button' ? step.disabled : undefined"
          class="tw:flex tw:size-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:border-2 tw:text-sm tw:font-semibold tw:transition-all tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
          :class="[nodeClass(step, index), clickable && !step.disabled ? 'tw:cursor-pointer' : '']"
          @click="onClick(step, index)"
        >
          <IconCheck v-if="isDone(step, index)" :size="16" />
          <IconX v-else-if="isError(step, index)" :size="16" />
          <component :is="step.icon" v-else-if="step.icon" :size="16" />
          <span v-else>{{ index + 1 }}</span>
        </component>
        <div
          v-if="index < steps.length - 1"
          aria-hidden="true"
          class="tw:w-0.5 tw:flex-1 tw:rounded-full"
          :class="index < current ? 'tw:bg-primary' : 'tw:bg-divider'"
        />
      </div>

      <!-- Body -->
      <div class="tw:flex-1 tw:pb-6">
        <div
          class="tw:text-sm tw:font-semibold"
          :class="statusOf(step, index) === 'upcoming' ? 'tw:text-secondary' : 'tw:text-on-main'"
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
    </li>
  </ol>
</template>
