<script setup>
/**
 * Admin card: manage Root Cause Categories (per-tenant lookup).
 *
 * Lives under RCA Templates → Categories tab. Reads via the syncEngine
 * (the `root_cause_categories` table is replicated). Writes go through
 * REST endpoints in `routes/rootCauseCategories.js`, gated by the
 * company owner or holders of `rootCauseCategories:manage`. Soft-delete
 * (paranoid) preserves historical root_cause references — the
 * denormalized `category_label` + `category_color` on root_causes
 * rows keep historical reports legible even after deactivation.
 *
 * Mirror of NcDispositionTypesCard. The difference: this lookup has
 * a `color` column (rendered as the badge background tint), so the
 * dialog includes a colour picker.
 */

import { IconPlus, IconPencil, IconTrash, IconRestore } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession.js'
import { post, patch, del } from '@/api'

const toast = useToast()
const { confirm } = useConfirm()

const canManage = computed(
  () => !!currentSession.value?.isOwner || isAllowed(['rootCauseCategories:manage']),
)

const categories = useLiveQuery(
  async (db) => db.RootCauseCategory.where().orderBy('displayOrder', 'asc').exec(),

  { models: ['RootCauseCategory'], initial: [] },
)

const deactivated = useLiveQuery(
  async (db) => {
    const all = await db.RootCauseCategory.where('id', undefined, { force: true }).exec()
    return all.filter((c) => c.deletedAt)
  },

  { models: ['RootCauseCategory'], initial: [] },
)

// ─── Dialog state ────────────────────────────────────────────────────────────
const showEditDialog = ref(false)
const editing = ref(null)
const form = ref({
  code: '',
  name: '',
  description: '',
  color: '',
  displayOrder: 1000,
})
const saving = ref(false)
const codeDirty = ref(false)
const codeEditable = ref(false)

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()
}

watch(
  () => form.value.name,
  (newName) => {
    if (editing.value) return
    if (codeDirty.value) return
    form.value.code = slugify(newName)
  },
)

function openAdd() {
  editing.value = null
  codeDirty.value = false
  codeEditable.value = false
  form.value = {
    code: '',
    name: '',
    description: '',
    color: '',
    displayOrder: (categories.value?.length ?? 0) * 100 + 100,
  }
  showEditDialog.value = true
}

function openEdit(row) {
  editing.value = row
  codeDirty.value = true
  codeEditable.value = false
  form.value = {
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    color: row.color ?? '',
    displayOrder: row.displayOrder ?? 1000,
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
      await patch(`/v1/services/rootCauseCategories/${editing.value.id}`, {
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        color: form.value.color?.trim() || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Category updated')
    } else {
      if (!form.value.code.trim()) {
        toast.warning('Code is required')
        saving.value = false
        return
      }
      await post('/v1/services/rootCauseCategories', {
        code: form.value.code.trim().toUpperCase(),
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        color: form.value.color?.trim() || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Category created')
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
    !(await confirm({
      title: 'Deactivate category',
      message: `Deactivate "${row.name}"? Historical root_causes rows referencing this category will keep their denormalized label + colour; new RCAs won't see it in the picker.`,
      okLabel: 'Deactivate',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await del(`/v1/services/rootCauseCategories/${row.id}`)
    toast.success('Category deactivated')
  } catch (e) {
    toast.error(e.message || 'Failed to deactivate')
  }
}

async function handleRestore(row) {
  try {
    await post(`/v1/services/rootCauseCategories/${row.id}/restore`, {})
    toast.success('Category restored')
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
        <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Root Cause Categories</h2>
        <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
          Categories the supplier / analyst picks when finalising a Root Cause Analysis. Seeded with
          the Fishbone 6Ms (People / Machine / Method / Material / Measurement / Environment) +
          System / Process. Edit or add tenant-specific categories below — colour drives the badge
          styling on root_causes rows and reports.
        </p>
      </div>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="openAdd">
        <template #icon><IconPlus :size="16" /></template>
        Add Category
      </BaseButton>
    </div>

    <div
      v-if="!canManage"
      class="tw:p-4 tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-xs tw:text-amber-800"
    >
      You don't have the "Manage Root Cause Categories" permission. View only.
    </div>

    <div class="tw:p-4">
      <table class="tw:w-full tw:text-sm">
        <thead>
          <tr
            class="tw:text-left tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wider tw:border-b tw:border-divider"
          >
            <th class="tw:px-3 tw:py-2">Name</th>
            <th class="tw:px-3 tw:py-2">Code</th>
            <th class="tw:px-3 tw:py-2 tw:text-center">Colour</th>
            <th class="tw:px-3 tw:py-2 tw:text-center">Order</th>
            <th class="tw:px-3 tw:py-2 tw:text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in categories" :key="row.id" class="tw:border-b tw:border-divider">
            <td class="tw:px-3 tw:py-3">
              <div class="tw:font-medium tw:text-on-sidebar">{{ row.name }}</div>
              <div v-if="row.description" class="tw:text-xs tw:text-secondary tw:mt-0.5">
                {{ row.description }}
              </div>
            </td>
            <td class="tw:px-3 tw:py-3">
              <code
                class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-main-hover tw:text-secondary"
              >
                {{ row.code }}
              </code>
            </td>
            <td class="tw:px-3 tw:py-3 tw:text-center">
              <RootCauseCategoryBadge :category="row" />
            </td>
            <td class="tw:px-3 tw:py-3 tw:text-center tw:text-secondary">
              {{ row.displayOrder }}
            </td>
            <td class="tw:px-3 tw:py-3 tw:text-right">
              <div v-if="canManage" class="tw:flex tw:items-center tw:justify-end tw:gap-1">
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
          <tr v-if="!categories.length">
            <td
              colspan="5"
              class="tw:px-3 tw:py-6 tw:text-center tw:text-sm tw:text-secondary tw:italic"
            >
              No active categories. Add one above.
            </td>
          </tr>
        </tbody>
      </table>

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
              <code
                class="tw:text-[10px] tw:px-1.5 tw:py-0.5 tw:ml-2 tw:rounded tw:bg-white tw:text-secondary"
              >
                {{ row.code }}
              </code>
            </div>
            <button
              v-if="canManage"
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

    <BaseDialog
      v-model="showEditDialog"
      :title="editing ? 'Edit Category' : 'Add Category'"
      maxWidth="md"
    >
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <BaseField v-slot="{ id: fieldId }" label="Name" required>
          <BaseTextInput :id="fieldId" v-model="form.name" placeholder="e.g. Training Gap" />
        </BaseField>
        <div v-if="!editing">
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
            <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">
              Code <span class="tw:text-red-500">*</span>
              <span class="tw:font-normal tw:normal-case tw:text-secondary tw:ml-1">
                (auto-derived from name)
              </span>
            </p>
            <button
              type="button"
              class="tw:text-[11px] tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="codeEditable = !codeEditable"
            >
              {{ codeEditable ? 'Lock' : 'Edit' }}
            </button>
          </div>
          <BaseTextInput
            v-model="form.code"
            placeholder="TRAINING_GAP"
            :disabled="!codeEditable"
            @input="codeDirty = true"
          />
          <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
            SCREAMING_SNAKE_CASE. Stable identifier denormalized onto every root_causes row using
            this category — cannot be changed later. We generate it from the name; click
            <strong>Edit</strong> to override.
          </p>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Description">
          <BaseTextarea
            :id="fieldId"
            v-model="form.description"
            :rows="2"
            placeholder="Optional description shown alongside the option in the picker"
          />
        </BaseField>
        <div class="tw:grid tw:grid-cols-2 tw:gap-3">
          <BaseField
            label="Colour"
            hint="Used as the badge background tint. Leave empty for neutral grey."
          >
            <BaseColorPicker v-model="form.color" allowNull />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Display Order">
            <BaseTextInput
              :id="fieldId"
              v-model.number="form.displayOrder"
              type="number"
              :min="0"
            />
          </BaseField>
        </div>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="editing ? 'Save' : 'Add'"
          :loading="saving"
          @cancel="close"
          @submit="handleSave"
        />
      </template>
    </BaseDialog>
  </div>
</template>
