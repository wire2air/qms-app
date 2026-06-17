<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  allowCreate: {
    type: Boolean,
    default: true,
  },
  nullLabel: {
    type: String,
    default: '— All items —',
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const products = useLiveQuery(async (db) => db.Product.where().exec(), {
  models: ['Product'],
  initial: [],
})

// QMS users key off the SKU#, so the dropdown lists (and searches) each item
// as "SKU - Item name". The selected chip renders via ProductBadge(ById) which
// already leads with the SKU. id stays the product id.
const productItems = computed(() =>
  products.value.map((p) => ({
    id: p.id,
    name: p.sku ? `${p.sku} - ${p.name}` : p.name,
  })),
)

const canCreateProduct = computed(() => props.allowCreate && isAllowed(['products:create']))

const showCreateDialog = ref(false)
const createIconRef = ref(null)

function openCreateDialog(closePopover) {
  closePopover?.()
  showCreateDialog.value = true
}

function onProductCreated(newProduct) {
  if (!newProduct?.id) return

  if (props.multiple) {
    const arr = Array.isArray(modelValue.value) ? modelValue.value : []
    if (!arr.includes(newProduct.id)) {
      modelValue.value = [...arr, newProduct.id]
    }
  } else {
    modelValue.value = newProduct.id
  }

  nextTick(() => createIconRef.value?.focus?.())
}

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <div class="tw:flex-1 tw:min-w-0">
      <BaseSelectMenu
        v-model="modelValue"
        :items="productItems"
        :required="required"
        :multiple="multiple"
        v-bind="nullLabel !== undefined ? { nullLabel } : {}"
      >
        <template #button="scope">
          <slot name="button" v-bind="scope">
            <!-- MULTIPLE MODE -->
            <template v-if="multiple">
              <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
                <ProductBadgeById
                  v-for="id in getArray()"
                  :key="id"
                  :productId="id"
                  :clearable="!required || getArray().length > 1"
                  @clear="() => scope.clear(id)"
                />
              </div>
              <BaseBadge v-else class="tw:text-sm tw:font-medium tw:text-placeholder" selectable>
                — All items —
              </BaseBadge>
            </template>

            <!-- SINGLE MODE -->
            <template v-else>
              <ProductBadgeById
                v-if="modelValue"
                :productId="modelValue"
                :clearable="!required"
                selectable
                @clear="() => scope.clear(modelValue)"
              />
              <BaseBadge v-else class="tw:text-sm tw:font-medium tw:text-placeholder" selectable>
                — All items —
              </BaseBadge>
            </template>
          </slot>
        </template>

        <template v-if="canCreateProduct" #footer="{ close }">
          <button
            type="button"
            class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
            @click="openCreateDialog(close)"
          >
            <IconPlus :size="16" />
            Add New Item
          </button>
        </template>
      </BaseSelectMenu>
    </div>

    <ProductsCreateUpdateDialog
      v-if="showCreateDialog"
      v-model="showCreateDialog"
      @created="onProductCreated"
    />
  </div>
</template>
