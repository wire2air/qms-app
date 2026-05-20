<script setup>
import { IconSearch } from '@tabler/icons-vue'
import { computed, shallowRef } from 'vue'

const props = defineProps({
  /** @type {import('vue').PropType<Array<{as?: string, id: string | number, name: string}>>} */
  items: {
    type: Array,
    default: () => [],
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  required: {
    type: Boolean,
    default: false,
  },
  nullLabel: {
    type: String,
    default: 'All',
  },
  hideNullOption: {
    type: Boolean,
    default: false,
  },
})

const selected = defineModel({
  type: [String, Number, Array, null],
})

const search = shallowRef('')

/**
 * Ensure we always work with an array in multiple mode
 */
function getArray() {
  return Array.isArray(selected.value) ? selected.value : []
}

const showNullable = computed(() => !props.required && !props.multiple && !props.hideNullOption)

const isNullableSelected = computed(() => {
  if (props.multiple) return getArray().length === 0
  return selected.value === null || selected.value === undefined
})

function toggleNullable(close) {
  if (props.multiple) {
    selected.value = []
  } else {
    selected.value = null
  }
  close()
}

const filtered = computed(() => {
  const query = search.value.toLowerCase()

  return props.items.filter((item) => item.name.toLowerCase().includes(query))
})

function toggleSelection(id, close) {
  if (props.multiple) {
    const arr = getArray()

    if (arr.includes(id)) {
      // Prevent removing last item if required
      if (props.required && arr.length === 1) return
      selected.value = arr.filter((item) => item !== id)
    } else {
      selected.value = [...arr, id]
    }
  } else {
    // Prevent deselect if required
    if (props.required && selected.value === id) return
    selected.value = selected.value === id ? null : id
    close()
  }
}

function clear(id) {
  if (props.multiple) {
    const arr = getArray()

    if (!arr.includes(id)) return

    // Prevent clearing last item if required
    if (props.required && arr.length === 1) return

    selected.value = arr.filter((item) => item !== id)
  } else {
    if (props.required) return
    selected.value = null
  }
}

function isSelected(id) {
  if (props.multiple) {
    return getArray().includes(id)
  }
  return selected.value === id
}

watch(
  () => props.items,
  (newItems) => {
    // Skip while items haven't loaded — preserves an upstream selection
    // until the list is actually known.
    if (!newItems || newItems.length === 0) return

    // Drop a stale selection that's no longer in the list (e.g. a dependent
    // filter like siteId changed and the previously chosen department is gone).
    const validIds = new Set(newItems.map((i) => i.id))
    if (props.multiple) {
      const arr = getArray()
      const filtered = arr.filter((id) => validIds.has(id))
      if (filtered.length !== arr.length) selected.value = filtered
    } else if (
      selected.value !== null &&
      selected.value !== undefined &&
      !validIds.has(selected.value)
    ) {
      selected.value = null
    }

    if (
      props.required &&
      !selected.value &&
      (Array.isArray(selected.value) ? selected.value.length === 0 : true)
    ) {
      if (props.multiple) {
        if (getArray().length === 0) {
          selected.value = [newItems[0].id]
        }
      } else if (selected.value === null || selected.value === undefined) {
        selected.value = newItems[0].id
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <BasePopover placement="bottom" :arrow="false" :flip="true">
    <template #button>
      <BaseBadge v-if="showNullable && isNullableSelected" selectable>
        {{ nullLabel }}
      </BaseBadge>
      <slot v-else name="button" :selected="selected" :clear="clear" />
    </template>

    <template #content="{ close }">
      <div
        class="tw:w-64 tw:bg-white tw:rounded-xl tw:shadow-xl tw:border tw:border-divider tw:overflow-hidden"
      >
        <!-- Search Header -->
        <div class="tw:p-3 tw:border-b tw:border-divider tw:bg-sidebar/50">
          <div class="tw:relative">
            <IconSearch
              class="tw:absolute tw:left-2.5 tw:top-2.5 tw:size-4 tw:text-secondary tw:pointer-events-none"
            />
            <input
              v-model="search"
              type="text"
              autofocus
              placeholder="Search..."
              class="tw:w-full tw:pl-9 tw:pr-3 tw:py-2 tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:text-sm tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/20 tw:focus:border-primary tw:transition-all"
            />
          </div>
        </div>

        <!-- Count Summary -->
        <div
          class="tw:px-4 tw:py-2 tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:bg-white"
        >
          {{ search ? `${filtered.length} of ${props.items.length}` : props.items.length }}
          {{ props.items.length === 1 ? 'item' : 'items' }}
        </div>

        <!-- Items -->
        <slot
          name="items"
          :close="close"
          :isSelected="isSelected"
          :toggleSelection="toggleSelection"
        >
          <div class="tw:max-h-64 tw:overflow-y-auto tw:p-1">
            <!-- Nullable "All" item -->
            <button
              v-if="showNullable"
              class="tw:w-full tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2.5 tw:rounded-lg tw:text-sm tw:transition-colors"
              :class="
                isNullableSelected
                  ? 'tw:bg-primary/10 tw:text-primary'
                  : 'tw:text-on-main tw:hover:bg-primary/5'
              "
              @click="toggleNullable(close)"
            >
              <span class="tw:font-medium">{{ nullLabel }}</span>
              <div
                v-if="isNullableSelected"
                class="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-primary tw:shrink-0"
              />
            </button>

            <button
              v-for="item in filtered"
              :key="item.id"
              class="tw:w-full tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2.5 tw:rounded-lg tw:text-sm tw:transition-colors"
              :class="
                isSelected(item.id)
                  ? 'tw:bg-primary/10 tw:text-primary'
                  : 'tw:text-on-main tw:hover:bg-primary/5'
              "
              @click="toggleSelection(item.id, close)"
            >
              <span class="tw:font-medium tw:text-start">
                <slot name="item" :item="item">
                  {{ item.name }}
                </slot>
              </span>
              <div
                v-if="isSelected(item.id)"
                class="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-primary tw:shrink-0"
              />
            </button>

            <div
              v-if="filtered.length === 0"
              class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:text-sm"
            >
              No matches found
            </div>
          </div>
        </slot>

        <!-- Footer slot -->
        <slot name="footer" :close="close" />
      </div>
    </template>
  </BasePopover>
</template>
