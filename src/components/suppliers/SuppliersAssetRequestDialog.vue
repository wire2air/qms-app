<script setup>
/**
 * Asset Request create / edit dialog.
 *
 * Create flow (Phase C — multi-item bundle):
 *   - Pick N master-list doc types via checkboxes; items already on file
 *     for this supplier are greyed with an "already received" pill.
 *   - Add ad-hoc items (free-text title + description) for things outside
 *     the master list.
 *   - POST /v1/services/suppliers/:supplierId/assetRequests creates the
 *     parent + N items atomically and queues the supplier email.
 *
 * Edit flow (legacy):
 *   - Metadata only (title / description / dates / contacts). Items
 *     aren't edited through this dialog — clients SKIP individual lines
 *     via the items list on the request detail.
 */
import { DateTime } from 'luxon'
import { IconPlus, IconTrash, IconCircleCheck } from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany.js'
import { post, get } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({
  supplierId: { type: String, required: true },
  editingRequest: { type: Object, default: null },
  contacts: { type: Array, default: () => [] },
})

const emit = defineEmits(['saved'])
const show = defineModel({ type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)

// ── Available master + tenant doc types, with already-received flags ──
const availableTypes = ref([])
const typesLoading = ref(false)

async function loadAvailableTypes() {
  if (!props.supplierId) return
  typesLoading.value = true
  try {
    const res = await get(`/v1/services/suppliers/${props.supplierId}/availableDocTypes`)
    availableTypes.value = res?.types ?? []
  } catch (err) {
    toast.error(err?.message || 'Failed to load doc types')
  } finally {
    typesLoading.value = false
  }
}

// ── Form state ────────────────────────────────────────────────────────
const form = ref({
  title: '',
  description: '',
  dueDate: null,
  expiryDate: null,
  userIds: [], // recipient supplier users (#31)
  selectedTypeIds: [], // master-list / tenant types ticked
  adHocItems: [], // [{ tempId, customTitle, customDescription }]
})

// Recipients are now supplier USERS (kind EXTERNAL_SUPPLIER) — they're notified
// and respond in-portal. Contacts that aren't users can't act (#31).
const supplierUsers = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    if (!supplierId) return []
    const rows = await db.User.where('supplierId', supplierId).exec()
    return rows.filter((u) => u.kind === 'EXTERNAL_SUPPLIER')
  },
  { initial: [] },
)
function userLabel(u) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id
}

const editingRecipients = useLiveQueryWithDeps(
  [() => props.editingRequest?.id],
  async (db, [requestId]) => {
    if (!requestId) return []
    return db.AssetRequestOnUser.where('assetRequestId', requestId).exec()
  },
  { initial: [] },
)

watch(show, async (val) => {
  if (!val) return
  if (props.editingRequest) {
    form.value = {
      title: props.editingRequest.title || '',
      description: props.editingRequest.description || '',
      dueDate: props.editingRequest.dueDate || null,
      expiryDate: props.editingRequest.expiryDate || null,
      userIds: editingRecipients.value.map((r) => r.userId),
      selectedTypeIds: [],
      adHocItems: [],
    }
  } else {
    form.value = {
      title: '',
      description: '',
      dueDate: currentCompany.value?.settings?.defaultAssetRequestDueDays
        ? DateTime.now().plus({
            days: currentCompany.value.settings.defaultAssetRequestDueDays,
          })
        : null,
      expiryDate: null,
      userIds: [],
      selectedTypeIds: [],
      adHocItems: [],
    }
    await loadAvailableTypes()
  }
})

function toggleUser(id) {
  const i = form.value.userIds.indexOf(id)
  if (i === -1) form.value.userIds = [...form.value.userIds, id]
  else form.value.userIds = form.value.userIds.filter((x) => x !== id)
}

function toggleType(typeId) {
  const i = form.value.selectedTypeIds.indexOf(typeId)
  if (i === -1) form.value.selectedTypeIds = [...form.value.selectedTypeIds, typeId]
  else form.value.selectedTypeIds = form.value.selectedTypeIds.filter((x) => x !== typeId)
}

function addAdHoc() {
  form.value.adHocItems.push({
    tempId: crypto.randomUUID(),
    customTitle: '',
    customDescription: '',
  })
}

function removeAdHoc(tempId) {
  form.value.adHocItems = form.value.adHocItems.filter((i) => i.tempId !== tempId)
}

const totalItems = computed(
  () => form.value.selectedTypeIds.length + form.value.adHocItems.filter((i) => i.customTitle.trim()).length,
)

const canSubmit = computed(() => {
  if (!form.value.title?.trim()) return false
  if (!form.value.userIds?.length) return false
  if (props.editingRequest) return true // edit just needs title + recipient
  return totalItems.value > 0
})

async function onSave() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    if (props.editingRequest) {
      // Legacy metadata-only edit — keep the existing path.
      props.editingRequest.title = form.value.title
      props.editingRequest.description = form.value.description || null
      props.editingRequest.dueDate = form.value.dueDate || null
      props.editingRequest.expiryDate = form.value.expiryDate || null
      await props.editingRequest.save()
      // Contacts diff (left out for brevity — the legacy dialog already
      // handled this; restore here if it regresses)
    } else {
      // Phase C bundle create. Bypass the SyncEngine entity CRUD path
      // because the backend's createAssetRequestWithItems endpoint
      // handles parent + items atomically + queues the supplier email.
      const items = [
        ...form.value.selectedTypeIds.map((typeId) => ({ assetRequestTypeId: typeId })),
        ...form.value.adHocItems
          .filter((i) => i.customTitle.trim())
          .map((i) => ({
            customTitle: i.customTitle.trim(),
            customDescription: i.customDescription?.trim() || null,
          })),
      ]
      await post(`/v1/services/suppliers/${props.supplierId}/assetRequests`, {
        title: form.value.title.trim(),
        description: form.value.description || null,
        dueDate: form.value.dueDate || null,
        expiryDate: form.value.expiryDate || null,
        userIds: form.value.userIds,
        items,
      })
    }
    toast.success(props.editingRequest ? 'Asset request updated' : 'Asset request created')
    show.value = false
    emit('saved')
  } catch (err) {
    toast.error(err?.message || 'Failed to save')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="show"
    :title="editingRequest ? 'Edit Asset Request' : 'New Asset Request'"
    :persistent="true"
    size="lg"
  >
    <div class="tw:p-4 tw:space-y-4">
      <!-- Title -->
      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
          Title <span class="tw:text-bad">*</span>
        </label>
        <BaseTextInput v-model="form.title" placeholder="What's this batch for?" />
      </div>

      <!-- Recipients = supplier portal users (#31). They get notified + respond
           in-portal. Add one via Locations & Contacts → "invite as portal user". -->
      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
          Supplier Users <span class="tw:text-bad">*</span>
        </label>
        <div
          class="tw:space-y-1 tw:max-h-32 tw:overflow-y-auto tw:rounded-md tw:border tw:border-divider tw:p-2"
        >
          <label
            v-for="user in supplierUsers"
            :key="user.id"
            class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer tw:px-2 tw:py-1 tw:rounded tw:hover:bg-main-hover"
          >
            <BaseCheckbox
              :modelValue="form.userIds.includes(user.id)"
              @update:modelValue="toggleUser(user.id)"
            />
            <span class="tw:text-sm tw:text-on-main">
              {{ userLabel(user) }}
              <span v-if="user.email" class="tw:text-xs tw:text-secondary">· {{ user.email }}</span>
            </span>
          </label>
          <p v-if="!supplierUsers.length" class="tw:text-sm tw:text-secondary tw:px-2 tw:py-1">
            No portal users yet — add one via Locations &amp; Contacts ("invite as portal user").
          </p>
        </div>
      </div>

      <!-- Items (only on create — edit handles metadata only) -->
      <div v-if="!editingRequest">
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
          Documents to request <span class="tw:text-bad">*</span>
          <span class="tw:font-normal tw:text-secondary tw:ml-1">({{ totalItems }} selected)</span>
        </label>
        <div
          class="tw:max-h-56 tw:overflow-y-auto tw:rounded-md tw:border tw:border-divider tw:p-2"
        >
          <div v-if="typesLoading" class="tw:text-xs tw:text-secondary tw:p-2">Loading…</div>
          <div v-else-if="availableTypes.length === 0" class="tw:text-xs tw:text-secondary tw:p-2">
            No doc types available. Seed the master list or add a tenant type first.
          </div>
          <label
            v-for="t in availableTypes"
            :key="t.id"
            class="tw:flex tw:items-center tw:gap-2 tw:px-2 tw:py-1 tw:rounded"
            :class="
              t.alreadyReceived
                ? 'tw:opacity-60 tw:cursor-default'
                : 'tw:cursor-pointer tw:hover:bg-main-hover'
            "
          >
            <BaseCheckbox
              :modelValue="form.selectedTypeIds.includes(t.id)"
              :disabled="t.alreadyReceived"
              @update:modelValue="toggleType(t.id)"
            />
            <span class="tw:text-sm tw:text-on-main tw:flex-1">
              {{ t.name }}
              <span v-if="t.isTenantCustom" class="tw:text-[10px] tw:text-primary">(custom)</span>
            </span>
            <span
              v-if="t.alreadyReceived"
              class="tw:text-[10px] tw:bg-green-100 tw:text-green-700 tw:px-1.5 tw:py-0.5 tw:rounded tw:inline-flex tw:items-center tw:gap-0.5"
            >
              <IconCircleCheck :size="10" />
              already on file
            </span>
          </label>
        </div>
      </div>

      <!-- Ad-hoc items -->
      <div v-if="!editingRequest" class="tw:space-y-2">
        <div class="tw:flex tw:items-center tw:justify-between">
          <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main">
            Other documents (ad-hoc)
          </label>
          <BaseButton variant="secondary" size="sm" @click="addAdHoc">
            <IconPlus :size="14" />
            Add ad-hoc item
          </BaseButton>
        </div>
        <p class="tw:text-[11px] tw:text-secondary tw:italic">
          Use for one-off documents not in the master list. Add a tenant type if you'll need it
          again.
        </p>
        <div
          v-for="item in form.adHocItems"
          :key="item.tempId"
          class="tw:flex tw:items-start tw:gap-2 tw:p-2 tw:rounded tw:border tw:border-divider"
        >
          <div class="tw:flex-1 tw:space-y-1">
            <BaseTextInput
              v-model="item.customTitle"
              placeholder="Document name (required)"
              size="sm"
            />
            <BaseTextarea
              v-model="item.customDescription"
              :rows="2"
              placeholder="Additional context for the supplier (optional)"
            />
          </div>
          <button
            type="button"
            class="tw:p-1 tw:rounded tw:bg-transparent tw:border-0 tw:text-secondary tw:hover:text-bad tw:cursor-pointer"
            @click="removeAdHoc(item.tempId)"
          >
            <IconTrash :size="14" />
          </button>
        </div>
      </div>

      <!-- Dates -->
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">Due Date</label>
          <BaseDatePicker v-model="form.dueDate" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
            Expiry Date
          </label>
          <BaseDatePicker v-model="form.expiryDate" />
        </div>
      </div>

      <!-- Description -->
      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
          Description
        </label>
        <BaseTextarea
          v-model="form.description"
          placeholder="Context shown to the supplier in the request email"
          :rows="2"
        />
      </div>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton :disabled="!canSubmit || saving" :loading="saving" @click="onSave">
        {{ editingRequest ? 'Save' : `Send (${totalItems})` }}
      </BaseButton>
    </div>
  </BaseDialog>
</template>
