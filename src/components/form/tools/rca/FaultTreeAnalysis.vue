<script setup>
const props = defineProps({
  config: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const configNodeMap = computed(() => {
  const map = {}
  for (const n of props.config.nodes ?? []) map[n.id] = n
  return map
})

function fillNodeMap(fillNodes) {
  const map = {}
  for (const n of fillNodes ?? []) map[n.id] = n
  return map
}

function isOccurred(nodeId) {
  const map = fillNodeMap(props.modelValue.nodes)
  return map[nodeId]?.occurred ?? false
}

function toggleOccurred(nodeId) {
  if (props.readonly) return
  const existing = fillNodeMap(props.modelValue.nodes)
  const updated = (props.config.nodes ?? []).map((cn) => ({
    id: cn.id,
    occurred: cn.id === nodeId ? !isOccurred(nodeId) : (existing[cn.id]?.occurred ?? false),
  }))
  const criticalPath = updated.filter((n) => n.occurred && configNodeMap.value[n.id]?.type !== 'top').map((n) => n.id)
  emit('update:modelValue', { ...props.modelValue, nodes: updated, criticalPath })
}

const rootNode = computed(() => (props.config.nodes ?? []).find((n) => n.type === 'top'))
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div class="tw:text-xs tw:text-secondary">
      Mark each event/condition that occurred. The critical path will be identified from selected nodes.
    </div>

    <!-- Top event -->
    <div
      v-if="rootNode"
      class="tw:border-2 tw:border-primary tw:rounded-lg tw:p-3 tw:text-center"
    >
      <div class="tw:text-xs tw:font-semibold tw:text-primary tw:uppercase tw:mb-1">Top Event</div>
      <div class="tw:font-semibold tw:text-on-main">
        {{ rootNode.label || config.topEvent || 'Undesired Event' }}
      </div>
    </div>

    <!-- Nodes -->
    <div class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="node in config.nodes ?? []"
        :key="node.id"
      >
        <div
          v-if="node.type !== 'top'"
          class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:border tw:border-divider tw:rounded-lg tw:transition-colors"
          :class="isOccurred(node.id) ? 'tw:border-bad/50 tw:bg-bad/5' : ''"
        >
          <div class="tw:flex tw:flex-col tw:shrink-0 tw:items-start tw:gap-0.5">
            <span
              class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide"
              :class="node.type === 'basic' ? 'tw:text-orange-500' : 'tw:text-blue-500'"
            >
              {{ node.type === 'basic' ? 'Basic' : 'Event' }}
            </span>
            <span class="tw:text-micro tw:text-secondary">
              Gate: {{ node.gate }}
            </span>
          </div>

          <span class="tw:flex-1 tw:text-sm tw:text-on-main">
            {{ node.label || node.id }}
          </span>

          <div class="tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-xs tw:text-secondary">Occurred?</span>
            <BaseSwitch
              :modelValue="isOccurred(node.id)"
              :disabled="readonly"
              @update:modelValue="() => toggleOccurred(node.id)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Critical path summary -->
    <div
      v-if="(modelValue.criticalPath ?? []).length"
      class="tw:bg-bad/10 tw:border tw:border-bad/20 tw:rounded-lg tw:p-3"
    >
      <div class="tw:text-xs tw:font-semibold tw:text-bad tw:uppercase tw:mb-1">Critical Path</div>
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <span
          v-for="nodeId in modelValue.criticalPath"
          :key="nodeId"
          class="tw:text-xs tw:bg-bad/20 tw:text-bad tw:rounded tw:px-2 tw:py-0.5"
        >
          {{ configNodeMap[nodeId]?.label || nodeId }}
        </span>
      </div>
    </div>
  </div>
</template>
