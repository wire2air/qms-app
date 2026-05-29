<script setup>
/**
 * Admin card: manage NC Disposition Types.
 *
 * Lives under Company Settings → Lookups tab. Reads via the syncEngine
 * (the `nc_disposition_types` table is replicated). Writes go through
 * REST endpoints in `routes/ncDispositionTypes.js`, gated by company
 * owner. Soft-delete (paranoid) preserves historical NC references.
 */

import { IconPlus, IconPencil, IconTrash, IconRestore, IconCircleCheckFilled } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { post, patch, del } from '@/api'

const toast = useToast()

const isOwner = computed(() => !!currentSession.value?.isOwner)

// Active dispositions (paranoid filter — deletedAt is null).
const dispositions = useLiveQuery(
  async (db) =>
    db.NcDispositionType.where().orderBy('displayOrder', 'asc').exec(),
  { initial: [] },
)

// Deactivated (soft-deleted) — read with force=true to bypass paranoid.
// Used for the "Deactivated" collapsible section + Restore action.
const deactivated = useLiveQuery(
  async (db) => {
    const all = await db.NcDispositionType.where('id', undefined, { force: true }).exec()
    return all.filter((d) => d.deletedAt)
  },
  { initial: [] },
)

// ─── Dialog state ────────────────────────────────────────────────────────────
const showEditDialog = ref(false)
const editing = ref(null) // null = new row, otherwise existing row
const form = ref({
  code: '',
  name: '',
  description: '',
  displayOrder: 1000,
  tracksCost: false,
})
const saving = ref(false)

function openAdd() {
  editing.value = null
  form.value = {
    code: '',
    name: '',
    description: '',
    displayOrder: (dispositions.value?.length ?? 0) * 100 + 100,
    tracksCost: false,
  }
  showEditDialog.value = true
}

function openEdit(row) {
  editing.value = row
  form.value = {
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    displayOrder: row.displayOrder ?? 1000,
    tracksCost: !!row.tracksCost,
  }
  showEditDialog.value = true
}

async function handleSave() {
  if (!form.value.name.trim()) {
    toast.warning('Name is required')
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await patch(`/v1/services/ncDispositionTypes/${editing.value.id}`, {
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        displayOrder: form.value.displayOrder,
        tracksCost: form.value.tracksCost,
      })
      toast.success('Disposition updated')
    } else {
      if (!form.value.code.trim()) {
        toast.warning('Code is required')
        saving.value = false
        return
      }
      await post('/v1/services/ncDispositionTypes', {
        code: form.value.code.trim().toUpperCase(),
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        displayOrder: form.value.displayOrder,
        tracksCost: form.value.tracksCost,
      })
      toast.success('Disposition created')
    }
    showEditDialog.value = false
  } catch (e) {
    toast.error(e.message || 'Failed to save')
  } finally {
    saving.value = false
  }
}

async function handleDeactivate(row) {
  if (
    !window.confirm(
      `Deactivate "${row.name}"? Existing NC rows referencing this disposition will keep their reference; new NCs won't see it in the picker.`,
    )
  ) {
    return
  }
  try {
    await del(`/v1/services/ncDispositionTypes/${row.id}`)
    toast.success('Disposition deactivated')
  } catch (e) {
    toast.error(e.message || 'Failed to deactivate')
  }
}

async function handleRestore(row) {
  try {
    await post(`/v1/services/ncDispositionTypes/${row.id}/restore`, {})
    toast.success('Disposition restored')
  } catch (e) {
    toast.error(e.message || 'Failed to restore')
  }
}

const showDeactivated = ref(false)
</script>

<template>
  <div
    class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <div>
        <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">NC Disposition Types</h2>
        <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
          The disposition options reviewers pick when closing out a nonconformance.
          Toggle <strong>Tracks cost</strong> for dispositions that generate Cost of NC
          (Scrap / Rework / Repair / Return-to-Supplier). Scoped to this company —
          changes only affect your tenant.
        </p>
      </div>
      <BaseButton v-if="isOwner" variant="primary" size="sm" @click="openAdd">
        <template #icon><IconPlus :size="16" /></template>
        Add Disposition
      </BaseButton>
    </div>

    <div v-if="!isOwner" class="tw:p-4 tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-xs tw:text-amber-800">
      Only the company owner can edit shared lookup data. You can view the list below.
    </div>

    <div class="tw:p-4">
      <table class="tw:w-full tw:text-sm">
        <thead>
          <tr class="tw:text-left tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wider tw:border-b tw:border-divider">
            <th class="tw:px-3 tw:py-2">Name</th>
            <th class="tw:px-3 tw:py-2">Code</th>
            <th class="tw:px-3 tw:py-2 tw:text-center">Tracks Cost</th>
            <th class="tw:px-3 tw:py-2 tw:text-center">Order</th>
            <th class="tw:px-3 tw:py-2 tw:text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in dispositions"
            :key="row.id"
            class="tw:border-b tw:border-divider"
          >
            <td class="tw:px-3 tw:py-3">
              <div class="tw:font-medium tw:text-on-sidebar">{{ row.name }}</div>
              <div v-if="row.description" class="tw:text-xs tw:text-secondary tw:mt-0.5">
                {{ row.description }}
              </div>
            </td>
            <td class="tw:px-3 tw:py-3">
              <code class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-main-hover tw:text-secondary">
                {{ row.code }}
              </code>
            </td>
            <td class="tw:px-3 tw:py-3 tw:text-center">
              <IconCircleCheckFilled
                v-if="row.tracksCost"
                :size="18"
                class="tw:text-green-600 tw:inline"
              />
              <span v-else class="tw:text-secondary">—</span>
            </td>
            <td class="tw:px-3 tw:py-3 tw:text-center tw:text-secondary">
              {{ row.displayOrder }}
            </td>
            <td class="tw:px-3 tw:py-3 tw:text-right">
              <div v-if="isOwner" class="tw:flex tw:items-center tw:justify-end tw:gap-1">
                <button
                  class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:hover:text-primary"
                  title="Edit"
                  @click="openEdit(row)"
                >
                  <IconPencil :size="16" />
                </button>
                <button
                  class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-red-50 tw:hover:text-red-600"
                  title="Deactivate"
                  @click="handleDeactivate(row)"
                >
                  <IconTrash :size="16" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!dispositions.length">
            <td colspan="5" class="tw:px-3 tw:py-6 tw:text-center tw:text-sm tw:text-secondary tw:italic">
              No active dispositions. Add one above.
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Deactivated section (collapsed by default) -->
      <div v-if="deactivated.length" class="tw:mt-4 tw:border-t tw:border-divider tw:pt-4">
        <button
          class="tw:text-xs tw:font-semibold tw:text-secondary tw:hover:text-on-sidebar"
          @click="showDeactivated = !showDeactivated"
        >
          {{ showDeactivated ? '▾' : '▸' }} Deactivated ({{ deactivated.length }})
        </button>
        <div v-if="showDeactivated" class="tw:mt-2 tw:flex tw:flex-col tw:gap-1">
          <div
            v-for="row in deactivated"
            :key="row.id"
            class="tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2 tw:rounded-lg tw:bg-main-hover/40 tw:text-sm"
          >
            <div>
              <span class="tw:font-medium tw:text-secondary tw:line-through">{{ row.name }}</span>
              <code class="tw:text-[10px] tw:px-1.5 tw:py-0.5 tw:ml-2 tw:rounded tw:bg-white tw:text-secondary">{{ row.code }}</code>
            </div>
            <button
              v-if="isOwner"
              class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
              @click="handleRestore(row)"
            >
              <IconRestore :size="14" />
              Restore
            </button>
          </div>
        </div>
      </div>
    </div>

    <BaseDialog v-model="showEditDialog" :title="editing ? 'Edit Disposition' : 'Add Disposition'" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <div v-if="!editing">
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Code <span class="tw:text-red-500">*</span>
          </p>
          <BaseTextInput
            v-model="form.code"
            placeholder="e.g. DONATE_TO_TRAINING"
          />
          <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
            SCREAMING_SNAKE_CASE. Used as the stable identifier on every NC row that
            references this disposition. Cannot be changed later.
          </p>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Name <span class="tw:text-red-500">*</span>
          </p>
          <BaseTextInput v-model="form.name" placeholder="e.g. Donate to Training" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Description</p>
          <BaseTextarea
            v-model="form.description"
            :rows="2"
            placeholder="Optional description shown alongside the option in the picker"
          />
        </div>
        <div class="tw:grid tw:grid-cols-2 tw:gap-3">
          <div>
            <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Display Order</p>
            <BaseTextInput v-model.number="form.displayOrder" type="number" :min="0" />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Tracks Cost</p>
            <label class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer">
              <BaseSwitch v-model="form.tracksCost" />
              <span class="tw:text-xs tw:text-secondary">
                Require Cost of NC when this disposition is picked
              </span>
            </label>
          </div>
        </div>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="saving" :disabled="saving" @click="handleSave">
          {{ editing ? 'Save' : 'Add' }}
        </BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
