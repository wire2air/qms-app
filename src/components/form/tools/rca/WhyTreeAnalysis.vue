<script setup>
import { IconPlus, IconX } from '@tabler/icons-vue'

const props = defineProps({
  config: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
  problem: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const nodes = computed(() => props.modelValue.nodes ?? [])
const problemText = computed(() => props.problem || props.modelValue?.problem || '')

// Track the most recently added node to auto-focus its input
const newNodeId = ref(null)
const vFocus = {
  mounted(el, binding) {
    if (binding.value) el.focus()
  },
}

// Depth-first traversal of the tree → flat ordered list for v-for rendering
const flatNodes = computed(() => {
  const result = []
  function traverse(parentId, depth) {
    nodes.value
      .filter((n) => n.parentId === parentId)
      .forEach((n) => {
        result.push({ ...n, depth })
        traverse(n.id, depth + 1)
      })
  }
  traverse('root', 0)
  return result
})

const hasNodes = computed(() => nodes.value.length > 0)
const rootCauseCount = computed(() => nodes.value.filter((n) => n.isRootCause).length)

// ── Mutations ────────────────────────────────────────────────────────────────

function addNode(parentId) {
  if (props.readonly) return
  const id = crypto.randomUUID()
  newNodeId.value = id
  emit('update:modelValue', {
    ...props.modelValue,
    nodes: [...nodes.value, { id, text: '', parentId, isRootCause: false }],
  })
}

function removeNode(nodeId) {
  if (props.readonly) return
  const toRemove = new Set()
  function collect(id) {
    toRemove.add(id)
    nodes.value.filter((n) => n.parentId === id).forEach((c) => collect(c.id))
  }
  collect(nodeId)
  emit('update:modelValue', {
    ...props.modelValue,
    nodes: nodes.value.filter((n) => !toRemove.has(n.id)),
  })
}

function updateNodeText(nodeId, text) {
  if (props.readonly) return
  const updated = nodes.value.map((n) => (n.id === nodeId ? { ...n, text } : n))
  emit('update:modelValue', { ...props.modelValue, nodes: updated })
}

function toggleRootCause(nodeId) {
  if (props.readonly) return
  const updated = nodes.value.map((n) =>
    n.id === nodeId ? { ...n, isRootCause: !n.isRootCause } : n,
  )
  emit('update:modelValue', { ...props.modelValue, nodes: updated })
}
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
        :modelValue="problemText"
        placeholder="Describe what happened..."
        :rows="2"
        :readonly="readonly || !!problem"
        @update:modelValue="
          (v) => !problem && emit('update:modelValue', { ...modelValue, problem: v })
        "
      />
      <div v-if="problem" class="tw:text-xs tw:text-secondary tw:italic">Linked from form</div>
    </div>

    <!-- Instructions -->
    <p class="tw:text-xs tw:text-secondary tw:-mt-2">
      Add a "why" for the problem, then keep drilling down. Mark each terminal cause as
      <strong>Root Cause</strong> when you can't go deeper.
    </p>

    <!-- Tree nodes -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <div
        v-for="item in flatNodes"
        :key="item.id"
        class="tw:flex tw:items-center tw:gap-2 tw:group"
        :style="{ paddingLeft: item.depth * 28 + 'px' }"
      >
        <!-- Depth indicator -->
        <div
          class="tw:shrink-0 tw:w-5 tw:h-5 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-micro tw:font-bold tw:border"
          :class="
            item.isRootCause
              ? 'tw:bg-amber-100 tw:text-amber-700 tw:border-amber-300'
              : 'tw:bg-primary/10 tw:text-primary tw:border-primary/20'
          "
        >
          {{ item.depth + 1 }}
        </div>

        <!-- Text input -->
        <input
          v-focus="item.id === newNodeId"
          class="tw:flex-1 tw:min-w-0 tw:px-2 tw:py-1.5 tw:text-sm tw:border tw:rounded-lg tw:outline-none tw:transition-colors"
          :class="
            item.isRootCause
              ? 'tw:border-amber-300 tw:bg-amber-50 tw:text-amber-900'
              : 'tw:border-divider tw:bg-main tw:text-on-main tw:focus:border-primary'
          "
          :placeholder="item.depth === 0 ? 'Why did this happen?' : 'Why did that happen?'"
          :value="item.text"
          :readonly="readonly"
          @input="(e) => updateNodeText(item.id, e.target.value)"
        />

        <!-- Root cause toggle -->
        <button
          v-if="!readonly"
          class="tw:shrink-0 tw:text-xs tw:px-2 tw:py-1 tw:rounded tw:border tw:transition-colors tw:cursor-pointer"
          :class="
            item.isRootCause
              ? 'tw:bg-amber-100 tw:border-amber-300 tw:text-amber-700'
              : 'tw:border-divider tw:text-secondary tw:hover:border-amber-300 tw:hover:text-amber-600 tw:opacity-0 tw:group-hover:opacity-100'
          "
          :title="item.isRootCause ? 'Unmark as root cause' : 'Mark as root cause'"
          @click="toggleRootCause(item.id)"
        >
          {{ item.isRootCause ? '★ Root Cause' : '★' }}
        </button>

        <!-- Add child why -->
        <button
          v-if="!readonly"
          class="tw:shrink-0 tw:flex tw:items-center tw:gap-0.5 tw:text-xs tw:text-primary tw:hover:underline tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:cursor-pointer tw:bg-transparent tw:border-0 tw:px-0"
          title="Ask why"
          @click="addNode(item.id)"
        >
          <IconPlus :size="12" /> Why?
        </button>

        <!-- Remove node -->
        <button
          v-if="!readonly"
          class="tw:shrink-0 tw:text-gray-300 tw:hover:text-red-500 tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:cursor-pointer tw:bg-transparent tw:border-0"
          title="Remove"
          @click="removeNode(item.id)"
        >
          <IconX :size="14" />
        </button>
      </div>

      <!-- Empty state -->
      <div v-if="!hasNodes && !readonly" class="tw:text-sm tw:text-secondary tw:py-2">
        Click <strong>+ Add Why</strong> to start the causal chain.
      </div>
    </div>

    <!-- Add root-level why -->
    <div v-if="!readonly">
      <button
        class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:px-0"
        @click="addNode('root')"
      >
        <IconPlus :size="13" /> Add Why
      </button>
    </div>

    <!-- Summary -->
    <div v-if="rootCauseCount" class="tw:text-xs tw:text-secondary tw:text-right">
      {{ rootCauseCount }} root cause{{ rootCauseCount !== 1 ? 's' : '' }} identified
    </div>
  </div>
</template>
