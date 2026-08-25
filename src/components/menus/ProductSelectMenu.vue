<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { IndexedDB, syncBus } from '@syncEngine/index'
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

// ProductOption projection (view `product_options`) — id / sku / name only, so
// the picker resolves for users without products:read. Item CREATION below
// still goes through Product and still requires products:create.
const products = useLiveQuery(async (db) => db.ProductOption.where().exec(), {
  models: ['ProductOption'],
  initial: [],
})

// Ids currently selected — kept visible in the list even if inactive, so the
// dropdown doesn't drop an existing selection (BaseSelect clears a value
// that's not among its items).
const selectedIds = computed(() =>
  Array.isArray(modelValue.value)
    ? modelValue.value
    : modelValue.value
      ? [modelValue.value]
      : [],
)

// QMS users key off the SKU#, so the dropdown lists (and searches) each item
// as "SKU - Item name". The selected chip renders via ProductBadge(ById) which
// already leads with the SKU. id stays the product id. Only ACTIVE items are
// offered (plus any already-selected one), so retired/discontinued products
// aren't pickable for new work.
const productItems = computed(() =>
  products.value
    .filter((p) => p.statusId === 'ACTIVE' || selectedIds.value.includes(p.id))
    .map((p) => ({
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

async function onProductCreated(newProduct) {
  if (!newProduct?.id) return

  // The dialog wrote a Product; this menu reads ProductOption — a VIEW, and
  // the sync push only maps the `products` table back to the Product model,
  // so the new row reaches this list only on the next full reload. Until
  // then the selection points at an id the options don't carry and the
  // control renders blank — "the item list emptied out".
  //
  // A server refetch is not available for views (PostGraphile generates no
  // singular accessor without a primary key), so the option row is built
  // from the Product just created — the projection is a strict subset of
  // its fields — and written the same way the socket subscriber would.
  // Best-effort, and PLAIN values only: `newProduct` is a reactive model
  // instance, and neither a Vue proxy nor a Luxon DateTime survives the
  // structured clone IndexedDB does — a naive put throws DataCloneError and
  // would take the selection assignment below down with it.
  try {
    const iso = (v) => (v?.toISO ? v.toISO() : (v ?? new Date().toISOString()))
    await IndexedDB.put('productOptions', {
      id: newProduct.id,
      companyId: newProduct.companyId,
      name: newProduct.name,
      sku: newProduct.sku ?? '',
      statusId: newProduct.statusId ?? 'ACTIVE',
      createdAt: iso(newProduct.createdAt),
      updatedAt: iso(newProduct.updatedAt),
    })
    syncBus.emit({ modelName: 'ProductOption', modelId: newProduct.id, action: 'update', type: 'sync' })
  } catch (err) {
    // The option list refreshes on the next reload either way; the selection
    // below must not depend on this succeeding.
    console.warn(`productOptions upsert after create failed: ${err?.message}`)
  }

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

</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <div class="tw:flex-1 tw:min-w-0">
      <BaseSelect
        v-model="modelValue"
        :options="productItems"
        optionLabel="name"
        optionValue="id"
        :required="required"
        :multiple="multiple"
        :clearable="!required"
        :nullLabel="nullLabel"
      >
        <template v-if="$slots.button" #trigger="scope">
          <slot name="button" v-bind="scope" />
        </template>

        <template #selected="{ options, remove }">
          <div class="tw:flex tw:flex-wrap tw:gap-1">
            <ProductBadgeById
              v-for="o in options"
              :key="o.value"
              :productId="o.value"
              :clearable="multiple && (!required || options.length > 1)"
              @clear="() => remove(o)"
            />
          </div>
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
      </BaseSelect>
    </div>

    <ProductsCreateUpdateDialog
      v-if="showCreateDialog"
      v-model="showCreateDialog"
      @created="onProductCreated"
    />
  </div>
</template>
