<script setup>
const props = defineProps({
  items: {
    type: Array,
    required: true,
  },
  command: {
    type: Function,
    required: true,
  },
})

const selectedIndex = ref(0)

watch(
  () => props.items,
  () => {
    selectedIndex.value = 0
  },
)

function onKeyDown({ event }) {
  if (event.key === 'ArrowUp') {
    upHandler()
    return true
  }

  if (event.key === 'ArrowDown') {
    downHandler()
    return true
  }

  if (event.key === 'Enter') {
    enterHandler()
    return true
  }

  return false
}

function upHandler() {
  selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length
}

function downHandler() {
  selectedIndex.value = (selectedIndex.value + 1) % props.items.length
}

function enterHandler() {
  selectItem(selectedIndex.value)
}

function selectItem(index) {
  const item = props.items[index]
  if (item) {
    props.command(item)
  }
}

defineExpose({ onKeyDown })
</script>

<template>
  <div class="mention-dropdown">
    <template v-if="items.length">
      <button
        v-for="(item, index) in items"
        :key="item.id"
        :class="{ 'is-selected': index === selectedIndex }"
        type="button"
        @click="selectItem(index)"
      >
        <span v-html="item.label"></span>
      </button>
    </template>
    <div v-else class="mention-dropdown-empty">No results</div>
  </div>
</template>

<style scoped>
.mention-dropdown {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 0.5rem;
  box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow-y: auto;
  padding: 0.25rem;
}

.mention-dropdown button {
  align-items: center;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: inherit;
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25;
  padding: 0.5rem 0.625rem;
  text-align: left;
  transition: background 0.15s ease;
  width: 100%;
}

.mention-dropdown button:hover,
.mention-dropdown button.is-selected {
  background: #f1f1f1;
}

.mention-dropdown-empty {
  color: var(--secondary);
  font-size: 0.8125rem;
  padding: 0.5rem 0.625rem;
}
</style>
