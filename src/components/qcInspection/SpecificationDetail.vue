<script setup>
/**
 * Specification detail — characteristics + lifecycle.
 *   DRAFT      → header fields (name/code/material/scope/notes) and the
 *                characteristics grid are editable inline; Approve via PIN.
 *   EFFECTIVE  → read-only + "New version" (clones into a fresh DRAFT).
 *   SUPERSEDED → read-only; reachable from the version history.
 * Right column = overview (scope, status, version, created/approved by, dates).
 */
import { IconArrowLeft, IconPlus, IconTrash } from '@tabler/icons-vue'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useRecordTrail } from '@/composables/useRecordTrail.js'

const props = defineProps({
  id: { type: String, required: true },
  // When embedded (e.g. inside the Item Master → Specifications tab) the
  // component stays in place: back / version-history / new-version emit events
  // instead of routing to the standalone QC Inspection page.
  embedded: { type: Boolean, default: false },
  // Label for the top back link — the embedding page sets it to reflect where
  // the user came from (e.g. "Back to <Item> specifications").
  backLabel: { type: String, default: 'Back to Specifications' },
})
const emit = defineEmits(['back', 'openSpec'])
const router = useRouter()
const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()
const { visit: visitTrail } = useRecordTrail()
const acting = ref(false)
const saving = ref(false)
const showEsign = ref(false)

function goBack() {
  if (props.embedded) emit('back')
  else router.push(getCompanyPath('/qc-inspection?tab=specifications'))
}
function openSpec(id) {
  if (props.embedded) emit('openSpec', id)
  else router.push(getCompanyPath(`/qc-inspection/specifications/${id}`))
}

const canManage = computed(() => isAllowed(['qcInspection:spec:write']))

const spec = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.Specification.findByPk(id),
  { models: ['Specification'] },
)

// Standalone (not embedded in the product page): join the record trail and show
// a module breadcrumb instead of an ad-hoc back button.
watch(
  spec,
  (s) => {
    if (s?.id && !props.embedded) {
      visitTrail({ type: 'Spec', id: s.id, label: s.name || s.code, path: route.path })
    }
  },
  { immediate: true },
)
const moduleCrumbs = computed(() => [
  { label: 'QC Inspection', to: getCompanyPath('/qc-inspection') },
  { label: 'Specifications', to: getCompanyPath('/qc-inspection?tab=specifications') },
  { label: spec.value?.name || spec.value?.code || 'Specification' },
])

const creator = useLiveQueryWithDeps(
  [() => spec.value?.createdBy],

  async (db, [userId]) => (userId ? db.User.findByPk(userId) : null),
  { models: ['User'] },
)
const approver = useLiveQueryWithDeps(
  [() => spec.value?.approvedByUserId],

  async (db, [userId]) => (userId ? db.User.findByPk(userId) : null),
  { models: ['User'] },
)
// force:true so a spec still shows its linked item even if that item was
// later soft-deleted (otherwise the Overview would just show "—").
const product = useLiveQueryWithDeps(
  [() => spec.value?.productId],

  async (db, [productId]) => (productId ? db.Product.findByPk(productId, { force: true }) : null),
  { models: ['Product'] },
)
const productType = useLiveQueryWithDeps(
  [() => spec.value?.productTypeId],

  async (db, [typeId]) => (typeId ? db.ProductType.findByPk(typeId) : null),
  { models: ['ProductType'] },
)

// Walk parentSpecificationId chain to build version history
const versionHistory = useLiveQueryWithDeps(
  [() => spec.value?.parentSpecificationId],
  async (db, [parentId]) => {
    if (!parentId) return []
    const history = []
    let currentId = parentId
    while (currentId) {
      const s = await db.Specification.findByPk(currentId)
      if (!s) break
      history.push(s)
      currentId = s.parentSpecificationId
    }
    return history
  },

  { models: ['Specification'], initial: [] },
)

const characteristics = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    const rows = await db.SpecificationCharacteristic.where('specificationId', id).exec()
    return rows.sort((a, b) => a.sortOrder - b.sortOrder)
  },

  { models: ['SpecificationCharacteristic'], initial: [] },
)

const isDraft = computed(() => spec.value?.statusId === 'DRAFT')
const canEditDraft = computed(() => isDraft.value && canManage.value)

const MATERIAL_LABELS = {
  RAW: 'Raw material',
  PACKAGING: 'Packaging',
  BULK: 'Bulk',
  FINISHED: 'Finished good',
}
const MATERIAL_ITEMS = Object.entries(MATERIAL_LABELS).map(([id, name]) => ({ id, name }))
const TEST_TYPES = ['NUMERIC', 'PASS_FAIL', 'TEXT']

function userName(user) {
  if (!user) return '—'
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '—'
}

// ── Editable header (DRAFT only) ────────────────────────────────────────────
const header = ref(null)
const headerDirty = ref(false)
watch(
  spec,
  (s) => {
    if (!s) return
    // Don't clobber in-flight edits when a sync echo lands.
    if (headerDirty.value) return
    header.value = {
      name: s.name ?? '',
      code: s.code ?? '',
      materialKind: s.materialKind ?? 'RAW',
      scope: s.productId ? 'product' : 'productType',
      productId: s.productId ?? null,
      productTypeId: s.productTypeId ?? null,
      notes: s.notes ?? '',
    }
  },
  { immediate: true },
)
function markHeaderDirty() {
  headerDirty.value = true
}

// ── Editable characteristics (DRAFT only) ───────────────────────────────────
const editedChars = ref([])
const charsDirty = ref(false)
watch(
  characteristics,
  (list) => {
    if (charsDirty.value) return
    editedChars.value = list.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code ?? '',
      testType: c.testType,
      targetValue: c.targetValue ?? null,
      lsl: c.lsl ?? null,
      usl: c.usl ?? null,
      uom: c.uom ?? '',
      defectClass: c.defectClass ?? (c.isCritical ? 'CRITICAL' : 'MAJOR'),
      requiresInstrument: c.requiresInstrument ?? false,
      preferredEquipmentId: c.preferredEquipmentId ?? null,
      testMethod: c.testMethod ?? '',
      sortOrder: c.sortOrder ?? 0,
    }))
  },
  { immediate: true },
)
function markCharsDirty() {
  charsDirty.value = true
}

const isDirty = computed(() => headerDirty.value || charsDirty.value)

function addCharacteristic() {
  // New rows go to the TOP so they're immediately visible (and flagged red
  // until saved). _key is a stable client key so unshifting doesn't shuffle
  // v-model bindings (index keys would).
  editedChars.value.unshift({
    id: null,
    _key: crypto.randomUUID(),
    name: '',
    code: '',
    testType: 'NUMERIC',
    targetValue: null,
    lsl: null,
    usl: null,
    uom: '',
    defectClass: 'MAJOR',
    requiresInstrument: false,
    preferredEquipmentId: null,
    testMethod: '',
    sortOrder: 0,
  })
  charsDirty.value = true
}
// Pre-fill characteristics from Test Library entries (overridable). Accepts an
// array (multi-select) and prepends them all, preserving pick order.
function addFromLibrary(entries) {
  const list = Array.isArray(entries) ? entries : [entries]
  const mapped = list.map((t) => ({
    id: null,
    _key: crypto.randomUUID(),
    name: t.name ?? '',
    code: t.code ?? '',
    testType: t.testType || 'PASS_FAIL',
    targetValue: t.targetValue ?? null,
    lsl: t.lsl ?? null,
    usl: t.usl ?? null,
    uom: t.uom ?? '',
    defectClass: t.defaultSeverity || 'MAJOR',
    requiresInstrument: !!t.requiresInstrument,
    preferredEquipmentId: t.preferredEquipmentId ?? null,
    testMethod: t.testMethod ?? '',
    sortOrder: 0,
  }))
  editedChars.value.unshift(...mapped)
  charsDirty.value = true
}

async function removeCharacteristic(index) {
  const c = editedChars.value[index]
  // Confirm before removing a test that has content (a saved row or a row the
  // user already named). A brand-new empty row is removed without a prompt.
  const hasContent = c && (c.id != null || c.name?.trim())
  if (hasContent) {
    const ok = await confirm({
      title: 'Remove test',
      message: `Remove "${c.name?.trim() || 'this test'}" from the specification? It is removed when you Save.`,
      okLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
  }
  editedChars.value.splice(index, 1)
  charsDirty.value = true
}

async function saveDraft() {
  if (saving.value) return
  saving.value = true
  try {
    const h = header.value
    const body = {
      name: h.name?.trim(),
      code: h.code?.trim() || null,
      materialKind: h.materialKind,
      productId: h.scope === 'product' ? h.productId : null,
      productTypeId: h.scope === 'productType' ? h.productTypeId : null,
      notes: h.notes?.trim() || null,
      characteristics: editedChars.value.map((c, i) => ({
        name: c.name,
        code: c.code || null,
        testType: c.testType,
        targetValue: c.testType === 'NUMERIC' ? (c.targetValue ?? null) : null,
        lsl: c.testType === 'NUMERIC' ? (c.lsl ?? null) : null,
        usl: c.testType === 'NUMERIC' ? (c.usl ?? null) : null,
        uom: c.testType === 'NUMERIC' ? (c.uom || null) : null,
        defectClass: c.defectClass || 'MAJOR',
        isCritical: c.defectClass === 'CRITICAL',
        requiresInstrument: c.requiresInstrument ?? false,
        preferredEquipmentId: c.requiresInstrument ? c.preferredEquipmentId || null : null,
        testMethod: c.testMethod?.trim() || null,
        sortOrder: i,
      })),
    }
    await patch(`/v1/services/qcInspection/specifications/${props.id}`, body)
    toast.success('Draft saved')
    headerDirty.value = false
    charsDirty.value = false
  } catch (err) {
    toast.error(err?.message || 'Save failed')
  } finally {
    saving.value = false
  }
}

function limitText(c) {
  if (c.testType !== 'NUMERIC') return c.testType === 'PASS_FAIL' ? 'Pass / Fail' : c.testType
  const parts = []
  if (c.targetValue != null) parts.push(`target ${c.targetValue}`)
  if (c.lsl != null) parts.push(`≥ ${c.lsl}`)
  if (c.usl != null) parts.push(`≤ ${c.usl}`)
  return [parts.join(', '), c.uom].filter(Boolean).join(' ') || '—'
}

async function onEsignVerified({ method, token }) {
  if (acting.value) return
  acting.value = true
  try {
    await post(`/v1/services/qcInspection/specifications/${props.id}/approve`, {
      esign: { method, token },
    })
    toast.success('Specification approved — now effective')
  } catch (err) {
    toast.error(err?.message || 'Approval failed')
  } finally {
    acting.value = false
  }
}

async function newVersion() {
  if (acting.value) return
  acting.value = true
  try {
    const { specification } = await post(
      `/v1/services/qcInspection/specifications/${props.id}/version`,
      {},
    )
    toast.success(`Draft v${specification.version} created`)
    openSpec(specification.id)
  } catch (err) {
    toast.error(err?.message || 'Could not create a new version')
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div
    v-if="spec && header"
    class="tw:flex tw:flex-col tw:gap-5"
    :class="embedded ? '' : 'tw:p-5 tw:max-w-6xl tw:mx-auto'"
  >
    <!-- Embedded (in the product page): a back link to the item's spec list.
         Standalone (QC module route): a module breadcrumb + record trail. -->
    <button
      v-if="embedded"
      type="button"
      class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer tw:self-start"
      @click="goBack"
    >
      <IconArrowLeft :size="16" /> {{ backLabel }}
    </button>
    <div v-else class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap tw:text-sm">
      <BaseBreadcrumbs :items="moduleCrumbs" />
      <RecordTrailBreadcrumb />
    </div>

    <!-- Header -->
    <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
      <div class="tw:min-w-0 tw:flex-1">
        <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
          <BaseTextInput
            v-if="canEditDraft"
            v-model="header.name"
            class="tw:max-w-md"
            placeholder="Specification name"
            @update:modelValue="markHeaderDirty"
          />
          <h1 v-else class="tw:text-2xl tw:font-bold tw:text-on-main">{{ spec.name }}</h1>
          <SpecificationStatusBadgeById :statusId="spec.statusId" />
        </div>
        <div v-if="!canEditDraft" class="tw:text-sm tw:text-secondary tw:mt-1">
          {{ MATERIAL_LABELS[spec.materialKind] || spec.materialKind }} · v{{ spec.version }}
          <span v-if="spec.code"> · {{ spec.code }}</span>
        </div>
      </div>
      <div v-if="canManage" class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
        <BaseButton
          v-if="canEditDraft && isDirty"
          variant="primary"
          size="sm"
          :loading="saving"
          @click="saveDraft"
        >
          Save
        </BaseButton>
        <BaseButton
          v-if="isDraft"
          variant="outline"
          size="sm"
          :loading="acting"
          @click="showEsign = true"
        >
          Approve
        </BaseButton>
        <BaseButton
          v-if="spec.statusId === 'EFFECTIVE'"
          variant="outline"
          size="sm"
          :loading="acting"
          @click="newVersion"
        >
          New version
        </BaseButton>
      </div>
    </div>

    <!-- Draft edit notice -->
    <div
      v-if="isDraft"
      class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:px-4 tw:py-2 tw:text-sm tw:text-amber-800"
    >
      This specification is a draft — all fields below are editable. Approve when ready.
    </div>

    <!-- Two-column: characteristics left, overview right -->
    <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-5 tw:items-start">
      <!-- Characteristics (2/3) -->
      <div
        class="tw:lg:col-span-2 tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden"
      >
        <div
          class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
        >
          <h3 class="tw:font-bold tw:text-on-main">Characteristics</h3>
          <div v-if="canEditDraft" class="tw:flex tw:items-center tw:gap-3">
            <TestLibraryAddMenu
              :productTypeId="header.scope === 'productType' ? header.productTypeId : null"
              @pick="addFromLibrary"
            />
            <BaseButton variant="outline" size="sm" @click="addCharacteristic">
              <template #icon><IconPlus :size="14" /></template>
              Add
            </BaseButton>
          </div>
        </div>

        <!-- DRAFT: editable rows -->
        <template v-if="canEditDraft">
          <div
            v-for="(c, idx) in editedChars"
            :key="c.id || c._key"
            class="tw:p-3 tw:border-t tw:transition-colors"
            :class="c.id == null
              ? 'tw:bg-red-50 tw:border-red-200'
              : (idx % 2 === 1 ? 'tw:bg-main-hover tw:border-divider' : 'tw:border-divider')"
          >
            <div
              v-if="c.id == null"
              class="tw:flex tw:items-center tw:gap-1.5 tw:mb-2 tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wide tw:text-red-600"
            >
              <span class="tw:inline-block tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-red-500"></span>
              New test — fill in &amp; Save
            </div>
            <div class="tw:flex tw:items-end tw:gap-3 tw:flex-wrap">
              <div class="tw:flex-1 tw:min-w-40">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Test name</label>
                <BaseTextInput
                  v-model="c.name"
                  size="sm"
                  placeholder="e.g. pH, Appearance"
                  @update:modelValue="markCharsDirty"
                />
              </div>
              <div class="tw:w-36">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Type</label>
                <BaseInlineSelect
                  v-model="c.testType"
                  :items="TEST_TYPES.map((t) => ({ id: t, name: t }))"
                  :required="true"
                  class="tw:w-full"
                  @update:modelValue="markCharsDirty"
                />
              </div>
              <div class="tw:w-32">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Defect class</label>
                <DefectSeveritySelectMenu v-model="c.defectClass" :required="true" @update:modelValue="markCharsDirty" />
              </div>
              <label class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:pb-2 tw:whitespace-nowrap">
                <BaseCheckbox v-model="c.requiresInstrument" @update:modelValue="markCharsDirty" /> Instrument
              </label>
              <button
                type="button"
                class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="removeCharacteristic(idx)"
              >
                <IconTrash :size="16" />
              </button>
            </div>
            <div v-if="c.testType === 'NUMERIC'" class="tw:flex tw:flex-wrap tw:gap-3 tw:mt-2">
              <div class="tw:w-24">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">LSL (min)</label>
                <BaseTextInput
                  v-model.number="c.lsl"
                  type="number"
                  size="sm"
                  @update:modelValue="markCharsDirty"
                />
              </div>
              <div class="tw:w-24">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Target</label>
                <BaseTextInput
                  v-model.number="c.targetValue"
                  type="number"
                  size="sm"
                  @update:modelValue="markCharsDirty"
                />
              </div>
              <div class="tw:w-24">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">USL (max)</label>
                <BaseTextInput
                  v-model.number="c.usl"
                  type="number"
                  size="sm"
                  @update:modelValue="markCharsDirty"
                />
              </div>
              <div class="tw:w-24">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">UOM</label>
                <BaseTextInput
                  v-model="c.uom"
                  size="sm"
                  placeholder="e.g. pH, %"
                  @update:modelValue="markCharsDirty"
                />
              </div>
            </div>
            <div v-if="c.requiresInstrument" class="tw:mt-2 tw:w-72">
              <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Preferred instrument</label>
              <EquipmentSelectMenu
                v-model="c.preferredEquipmentId"
                nullLabel="— None (pick at capture) —"
                @update:modelValue="markCharsDirty"
              />
            </div>
            <div class="tw:mt-2">
              <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Test method / reference attachments</label>
              <RichTextAttachments
                v-model="c.testMethod"
                placeholder="e.g. Calibrated micrometer, 0.001 mm resolution, 20°C"
                @update:modelValue="markCharsDirty"
              />
            </div>
          </div>
          <div
            v-if="!editedChars.length"
            class="tw:px-5 tw:py-6 tw:text-center tw:text-secondary tw:italic tw:border-t tw:border-divider"
          >
            No characteristics yet — click Add to get started.
          </div>
        </template>

        <!-- Read-only table -->
        <template v-else>
          <table class="tw:w-full tw:text-sm">
            <thead class="tw:text-secondary tw:text-xs tw:uppercase tw:bg-main-hover">
              <tr class="tw:border-b tw:border-divider">
                <th class="tw:text-left tw:px-5 tw:py-2">Test</th>
                <th class="tw:text-left tw:px-5 tw:py-2">Type</th>
                <th class="tw:text-left tw:px-5 tw:py-2">Spec</th>
                <th class="tw:text-left tw:px-5 tw:py-2">Instrument</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(c, idx) in characteristics"
                :key="c.id"
                class="tw:border-t tw:border-divider tw:hover:bg-sidebar-selected tw:transition-colors"
                :class="idx % 2 === 1 ? 'tw:bg-main-hover' : ''"
              >
                <td class="tw:px-5 tw:py-2.5 tw:font-medium tw:text-on-main">
                  {{ c.name }}
                  <DefectSeverityBadgeById :severityId="c.defectClass || (c.isCritical ? 'CRITICAL' : 'MAJOR')" class="tw:ml-1 tw:text-[10px]" />
                  <div v-if="c.testMethod" class="tw:mt-1">
                    <RichTextAttachments :modelValue="c.testMethod" :readonly="true" />
                  </div>
                </td>
                <td class="tw:px-5 tw:py-2.5 tw:text-secondary">{{ c.testType }}</td>
                <td class="tw:px-5 tw:py-2.5 tw:text-secondary">{{ limitText(c) }}</td>
                <td class="tw:px-5 tw:py-2.5 tw:text-secondary">
                  <EquipmentBadgeById v-if="c.preferredEquipmentId" :equipmentId="c.preferredEquipmentId" />
                  <template v-else>{{ c.requiresInstrument ? 'Required' : '—' }}</template>
                </td>
              </tr>
              <tr v-if="!characteristics.length">
                <td colspan="4" class="tw:px-5 tw:py-6 tw:text-center tw:text-secondary tw:italic">
                  No characteristics.
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <!-- Overview (1/3) -->
      <div
        class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:divide-y tw:divide-divider"
      >
        <div class="tw:px-4 tw:py-3">
          <h3 class="tw:font-semibold tw:text-on-main tw:text-sm">Overview</h3>
        </div>
        <div class="tw:px-4 tw:py-3 tw:space-y-3 tw:text-sm">
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-1">Status</div>
            <SpecificationStatusBadgeById :statusId="spec.statusId" />
          </div>
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Version</div>
            <div class="tw:text-on-main tw:font-mono">v{{ spec.version }}</div>
          </div>
          <!-- Code -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Code</div>
            <BaseTextInput
              v-if="canEditDraft"
              v-model="header.code"
              size="sm"
              placeholder="e.g. SPEC-001"
              @update:modelValue="markHeaderDirty"
            />
            <div v-else class="tw:text-on-main tw:font-mono">{{ spec.code || '—' }}</div>
          </div>
          <!-- Material kind -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Material</div>
            <BaseInlineSelect
              v-if="canEditDraft"
              v-model="header.materialKind"
              :items="MATERIAL_ITEMS"
              :required="true"
              class="tw:w-full"
              @update:modelValue="markHeaderDirty"
            />
            <div v-else class="tw:text-on-main">
              {{ MATERIAL_LABELS[spec.materialKind] || spec.materialKind }}
            </div>
          </div>
          <!-- Scope -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Applies To</div>
            <template v-if="canEditDraft">
              <BaseInlineSelect
                v-model="header.scope"
                :items="[
                  { id: 'product', name: 'Specific product' },
                  { id: 'productType', name: 'Product type' },
                ]"
                :required="true"
                class="tw:w-full tw:mb-2"
                @update:modelValue="markHeaderDirty"
              />
              <ProductSelectMenu
                v-if="header.scope === 'product'"
                v-model="header.productId"
                class="tw:w-full"
                @update:modelValue="markHeaderDirty"
              />
              <ProductTypeSelectMenu
                v-else
                v-model="header.productTypeId"
                class="tw:w-full"
                @update:modelValue="markHeaderDirty"
              />
            </template>
            <template v-else>
              <div v-if="product" class="tw:text-on-main">
                {{ product.name }}
                <span v-if="product.sku" class="tw:text-xs tw:text-secondary tw:font-mono"
                  >· {{ product.sku }}</span
                >
                <span v-if="product.deletedAt" class="tw:text-xs tw:text-bad tw:ml-1">(deleted)</span>
              </div>
              <div v-else-if="productType" class="tw:text-on-main">
                {{ productType.name }}
                <span class="tw:text-xs tw:text-secondary">(product type)</span>
              </div>
              <div v-else class="tw:text-secondary">—</div>
            </template>
          </div>
          <!-- Created -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Created</div>
            <div class="tw:text-on-main">
              {{ spec.createdAt?.formatDate('date') || '—' }} · {{ userName(creator) }}
            </div>
          </div>
          <!-- Approved -->
          <div v-if="spec.approvedAt">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Approved</div>
            <div class="tw:text-on-main">
              {{ spec.approvedAt?.formatDate('date') }} · {{ userName(approver) }}
            </div>
          </div>
          <!-- Effective window -->
          <div v-if="spec.effectiveFrom">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Effective From</div>
            <div class="tw:text-on-main">{{ spec.effectiveFrom?.formatDate('date') }}</div>
          </div>
          <div v-if="spec.effectiveUntil">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Effective Until</div>
            <div class="tw:text-on-main">{{ spec.effectiveUntil?.formatDate('date') }}</div>
          </div>
          <!-- Notes -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Notes</div>
            <BaseTextarea
              v-if="canEditDraft"
              v-model="header.notes"
              :rows="3"
              placeholder="Optional notes"
              @update:modelValue="markHeaderDirty"
            />
            <div v-else-if="spec.notes" class="tw:text-on-main tw:whitespace-pre-wrap">
              {{ spec.notes }}
            </div>
            <div v-else class="tw:text-secondary">—</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Version history -->
    <div
      v-if="versionHistory.length"
      class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden"
    >
      <div class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover">
        <h3 class="tw:font-bold tw:text-on-main">Version History</h3>
      </div>
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-5 tw:py-2">Version</th>
            <th class="tw:text-left tw:px-5 tw:py-2">Status</th>
            <th class="tw:text-left tw:px-5 tw:py-2">Effective</th>
            <th class="tw:text-left tw:px-5 tw:py-2">Superseded</th>
          </tr>
        </thead>
        <tbody>
          <BaseClickableRow
            v-for="prev in versionHistory"
            :key="prev.id"
            tag="tr"
            class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
            :aria-label="`Open specification version ${prev.version}`"
            @click="openSpec(prev.id)"
          >
            <td class="tw:px-5 tw:py-2.5 tw:font-mono tw:font-medium tw:text-on-main">
              v{{ prev.version }}
            </td>
            <td class="tw:px-5 tw:py-2.5">
              <SpecificationStatusBadgeById :statusId="prev.statusId" />
            </td>
            <td class="tw:px-5 tw:py-2.5 tw:text-secondary">
              {{ prev.effectiveFrom?.formatDate('date') || '—' }}
            </td>
            <td class="tw:px-5 tw:py-2.5 tw:text-secondary">
              {{ prev.effectiveUntil?.formatDate('date') || '—' }}
            </td>
          </BaseClickableRow>
        </tbody>
      </table>
    </div>

    <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
  </div>

  <div v-else class="tw:p-10 tw:text-center tw:text-secondary">Loading…</div>
</template>
