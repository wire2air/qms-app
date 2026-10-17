<script setup>
import { db } from '@models/index'
import { IconPlus, IconStar, IconStarFilled, IconTrash } from '@tabler/icons-vue'

/**
 * Supplier → Items: the other side of the Item ↔ Supplier link
 * (products_on_suppliers). Same rows the Item Master dialog writes, so a link
 * made here shows up on the item and vice versa. "Preferred" marks this
 * supplier as the one an NC on that item pre-fills — one per item, so
 * preferring here un-prefers whichever supplier held it.
 */
const props = defineProps({
  supplierId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const toast = useToast()
const { confirm } = useConfirm()

const links = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) =>
    supplierId ? db.ProductSupplier.where('supplierId', supplierId).exec() : [],
  { models: ['ProductSupplier'], initial: [] },
)
const linkedProductIds = computed(() => links.value.map((l) => l.productId))

// Items sorted by SKU/name for a stable list (the link rows carry only ids).
const products = useLiveQueryWithDeps(
  [() => linkedProductIds.value.join('|')],
  async (db) => {
    const rows = await Promise.all(linkedProductIds.value.map((id) => db.Product.findByPk(id)))
    return rows.filter(Boolean).sort((a, b) => (a.sku || a.name).localeCompare(b.sku || b.name))
  },
  { models: ['Product'], initial: [] },
)
const rows = computed(() =>
  products.value.map((p) => ({ product: p, link: links.value.find((l) => l.productId === p.id) })),
)

const createLink = useLiveMutation(async (db, { productId, supplierId }) => {
  const row = db.ProductSupplier.create({ productId, supplierId, isPreferred: false })
  await row.save()
  return row
})

const pendingProductId = ref(null)
async function addItem(productId) {
  pendingProductId.value = null
  if (!productId || linkedProductIds.value.includes(productId)) return
  try {
    await createLink({ productId, supplierId: props.supplierId })
  } catch (e) {
    toast.error(e?.message || 'Failed to link item')
  }
}

async function removeItem(row) {
  const ok = await confirm({
    title: 'Unlink item',
    message: `Remove ${row.product.sku || row.product.name} from this supplier?`,
    okLabel: 'Unlink',
    danger: true,
  })
  if (!ok) return
  try {
    await row.link.delete()
  } catch (e) {
    toast.error(e?.message || 'Failed to unlink item')
  }
}

// One preferred link per item: clear the other supplier's flag first so the
// partial unique index never sees two.
const busyProductId = ref(null)
async function togglePreferred(row) {
  if (busyProductId.value) return
  busyProductId.value = row.product.id
  try {
    if (row.link.isPreferred) {
      row.link.isPreferred = false
      await row.link.save()
      return
    }
    const siblings = await db.ProductSupplier.where('productId', row.product.id).exec()
    for (const s of siblings) {
      if (s.id !== row.link.id && s.isPreferred) {
        s.isPreferred = false
        await s.save()
      }
    }
    row.link.isPreferred = true
    await row.link.save()
  } catch (e) {
    toast.error(e?.message || 'Failed to update preferred supplier')
  } finally {
    busyProductId.value = null
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap">
      <p class="tw:text-sm tw:text-secondary">
        Items this supplier provides. <strong>Preferred</strong> means a nonconformance raised on
        the item pre-fills this supplier.
      </p>
      <ProductSelectMenu
        v-if="canUpdate"
        v-model="pendingProductId"
        :allowCreate="false"
        nullLabel="— Link an item —"
        @update:modelValue="addItem"
      >
        <!-- The click bubbles to the select's popover wrapper and opens it. -->
        <template #button>
          <BaseButton variant="secondary" size="sm"> <IconPlus :size="16" /> Link item </BaseButton>
        </template>
      </ProductSelectMenu>
    </div>

    <p v-if="!rows.length" class="tw:text-sm tw:text-secondary tw:italic">
      No items linked to this supplier yet.
    </p>

    <ul v-else class="tw:divide-y tw:divide-divider tw:border tw:border-divider tw:rounded-lg">
      <li
        v-for="row in rows"
        :key="row.product.id"
        class="tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2"
      >
        <ProductBadgeById :productId="row.product.id" />
        <span
          v-if="row.link?.isPreferred"
          class="tw:text-micro tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-amber-50 tw:text-amber-700 tw:border tw:border-amber-200"
        >
          Preferred
        </span>
        <span class="tw:ml-auto tw:flex tw:items-center tw:gap-1">
          <button
            v-if="canUpdate && row.link"
            type="button"
            class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-amber-600 tw:hover:bg-main-hover"
            :disabled="busyProductId === row.product.id"
            :title="
              row.link.isPreferred ? 'Remove preferred' : 'Make preferred supplier for this item'
            "
            :aria-pressed="row.link.isPreferred"
            @click="togglePreferred(row)"
          >
            <IconStarFilled v-if="row.link.isPreferred" :size="16" class="tw:text-amber-500" />
            <IconStar v-else :size="16" />
          </button>
          <button
            v-if="canUpdate && row.link"
            type="button"
            class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-red-600 tw:hover:bg-main-hover"
            title="Unlink item"
            @click="removeItem(row)"
          >
            <IconTrash :size="16" />
          </button>
        </span>
      </li>
    </ul>
  </div>
</template>
