<script setup>
import { IconPlus, IconX } from '@tabler/icons-vue'

const props = defineProps({
  config: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
  problem: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

function updateProblem(val) {
  emit('update:modelValue', { ...props.modelValue, problem: val })
}

function updateAnswer(whyId, answer) {
  const whys = (props.modelValue.whys ?? []).map((w) => (w.id === whyId ? { ...w, answer } : w))
  emit('update:modelValue', { ...props.modelValue, whys })
}

function addWhy() {
  const whys = [
    ...(props.modelValue.whys ?? []),
    { id: crypto.randomUUID(), prompt: 'Why did this happen?', answer: '', userAdded: true },
  ]
  emit('update:modelValue', { ...props.modelValue, whys })
}

function removeWhy(whyId) {
  const whys = (props.modelValue.whys ?? []).filter((w) => w.id !== whyId)
  emit('update:modelValue', { ...props.modelValue, whys })
}

const whys = computed(() => props.modelValue.whys ?? [])
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Problem statement -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <label
        class="tw:text-caption tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
      >
        {{ config.problemPrompt || 'Problem Statement' }}
      </label>
      <BaseTextarea
        :modelValue="modelValue.problem ?? ''"
        placeholder="Describe the problem..."
        :rows="2"
        :readonly="readonly"
        @update:modelValue="updateProblem"
      />
    </div>

    <!-- Why chain -->
    <div v-for="(why, idx) in whys" :key="why.id" class="tw:flex tw:gap-3 tw:group">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:shrink-0">
        <div
          class="tw:w-7 tw:h-7 tw:rounded-full tw:bg-primary tw:text-white tw:flex tw:items-center tw:justify-center tw:text-xs tw:font-bold"
        >
          {{ idx + 1 }}
        </div>
        <div v-if="idx < whys.length - 1" class="tw:w-px tw:flex-1 tw:bg-divider" />
      </div>

      <div class="tw:flex tw:flex-col tw:gap-1 tw:flex-1 tw:pb-3">
        <div class="tw:flex tw:items-center tw:justify-between">
          <label class="tw:text-sm tw:font-medium tw:text-on-main">
            {{ why.prompt || `Why #${idx + 1}?` }}
          </label>
          <button
            v-if="!readonly && why.userAdded"
            class="tw:text-gray-300 tw:hover:text-red-500 tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:cursor-pointer tw:bg-transparent tw:border-0"
            title="Remove this why"
            @click="removeWhy(why.id)"
          >
            <IconX :size="14" />
          </button>
        </div>
        <BaseTextarea
          :modelValue="why.answer ?? ''"
          placeholder="Your answer..."
          :rows="2"
          :readonly="readonly"
          @update:modelValue="(v) => updateAnswer(why.id, v)"
        />
      </div>
    </div>

    <!-- Add Why button -->
    <div v-if="!readonly" class="tw:flex tw:items-center tw:gap-2 tw:pl-10">
      <button
        class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:px-0"
        @click="addWhy"
      >
        <IconPlus :size="13" /> Add Why
      </button>
      <span class="tw:text-xs tw:text-secondary">
        — keep drilling if the answer isn't the root cause yet
      </span>
    </div>
  </div>
</template>
