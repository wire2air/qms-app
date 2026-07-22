<script setup>
/**
 * Specification detail — characteristics + lifecycle.
 *   DRAFT      → header fields (name/code/material/scope/notes) and the
 *                characteristics grid are editable inline; Approve via PIN.
 *   EFFECTIVE  → read-only + "New version" (clones into a fresh DRAFT).
 *   SUPERSEDED → read-only; reachable from the version history.
 * Right column = overview (scope, status, version, created/approved by, dates).
 */
import { IconPlus, IconTrash, IconCircleCheck } from '@tabler/icons-vue'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useRecordTrail } from '@/composables/useRecordTrail.js'

const props = defineProps({
  id: { type: String, required: true },
})
const router = useRouter()
const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()
const { visit: visitTrail } = useRecordTrail()
const acting = ref(false)
const saving = ref(false)
const showEsign = ref(false)

function openSpec(id) {
  router.push(getCompanyPath(`/qc-inspection/specifications/${id}`))
}

const canManage = computed(() => isAllowed(['inspection_spec:write']))

const spec = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.Specification.findByPk(id),
  { models: ['Specification'] },
)
const loading = computed(() => spec.value === undefined)

// Join the record trail for cross-record breadcrumbs.
watch(
  spec,
  (s) => {
    if (s?.id) {
      visitTrail({ type: 'Spec', id: s.id, label: s.name || s.code, path: route.path })
    }
  },
  { immediate: true },
)

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'QC Inspection', to: getCompanyPath('/qc-inspection') },
  { label: 'Specifications', to: getCompanyPath('/qc-inspection?tab=specifications') },
  { label: spec.value?.name || spec.value?.code || 'Specification' },
])
const detailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'wide',
    breadcrumbs: breadcrumbs.value,
  }),
)

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
const productFamily = useLiveQueryWithDeps(
  [() => spec.value?.productFamilyId],
  async (db, [famId]) => (famId ? db.ProductFamily.findByPk(famId) : null),
  { models: ['ProductFamily'] },
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

const TEST_TYPES = ['NUMERIC', 'PASS_FAIL', 'TEXT']

// Read-only characteristics table (EFFECTIVE/SUPERSEDED specs).
const charColumns = [
  { name: 'test', label: 'Test', field: 'name', align: 'left' },
  { name: 'type', label: 'Type', field: 'testType', align: 'left' },
  { name: 'spec', label: 'Spec', field: 'name', align: 'left' },
  { name: 'instrument', label: 'Instrument', field: 'name', align: 'left' },
]

// Version history table.
const versionColumns = [
  { name: 'version', label: 'Version', field: 'version', align: 'left' },
  { name: 'status', label: 'Status', field: 'statusId', align: 'left' },
  { name: 'effective', label: 'Effective', field: 'name', align: 'left' },
  { name: 'superseded', label: 'Superseded', field: 'name', align: 'left' },
]

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
      scope: s.productId ? 'product' : s.productFamilyId ? 'family' : 'productType',
      productId: s.productId ?? null,
      productFamilyId: s.productFamilyId ?? null,
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
      productId: h.scope === 'product' ? h.productId : null,
      productFamilyId: h.scope === 'family' ? h.productFamilyId : null,
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
  <BaseDetailLayout
    :config="detailConfig"
    :record="spec"
    :loading="loading"
    :notFound="!loading && !spec"
    :rail="true"
    notFoundTitle="Specification not found"
    notFoundDescription="This specification could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="canEditDraft && header"
        v-model="header.name"
        class="tw:max-w-md"
        placeholder="Specification name"
        @update:modelValue="markHeaderDirty"
      />
      <span v-else class="tw:text-base tw:font-semibold tw:text-on-main">{{ spec?.name }}</span>
    </template>

    <template #status>
      <SpecificationStatusBadgeById v-if="spec" :statusId="spec.statusId" />
    </template>

    <template #meta>
      <span v-if="spec">v{{ spec.version }}<span v-if="spec.code"> · {{ spec.code }}</span></span>
    </template>

    <template v-if="canManage" #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          v-if="canEditDraft && isDirty"
          variant="primary"
          size="sm"
          :loading="saving"
          @click="saveDraft"
        >
          Save
        </BaseButton>
        <BaseButton v-if="isDraft" variant="primary" :loading="acting" @click="showEsign = true">
          <template #icon><IconCircleCheck :size="18" /></template>
          Approve &amp; make effective
        </BaseButton>
        <BaseButton
          v-if="spec?.statusId === 'EFFECTIVE'"
          variant="outline"
          :loading="acting"
          @click="newVersion"
        >
          New version
        </BaseButton>
      </div>
    </template>

    <!-- Main content: characteristics + version history -->
    <div v-if="spec && header" class="tw:flex tw:flex-col tw:gap-5">
      <div
        v-if="isDraft"
        class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:px-4 tw:py-2 tw:text-sm tw:text-amber-800"
      >
        This specification is a draft — all fields below are editable. Approve when ready.
      </div>

      <!-- Characteristics -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
        <div
          class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
        >
          <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Characteristics</h3>
          <div v-if="canEditDraft" class="tw:flex tw:items-center tw:gap-3">
            <TestLibraryAddMenu
              :productFamilyId="header.scope === 'family' ? header.productFamilyId : null"
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
              class="tw:flex tw:items-center tw:gap-1.5 tw:mb-2 tw:text-caption tw:font-bold tw:uppercase tw:tracking-wider tw:text-red-600"
            >
              <span class="tw:inline-block tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-red-500"></span>
              New test — fill in &amp; Save
            </div>
            <div class="tw:flex tw:items-end tw:gap-3 tw:flex-wrap">
              <BaseField v-slot="{ id: fieldId }" label="Test name" class="tw:flex-1 tw:min-w-40">
                <BaseTextInput
                  :id="fieldId"
                  v-model="c.name"
                  size="sm"
                  placeholder="e.g. pH, Appearance"
                  @update:modelValue="markCharsDirty"
                />
              </BaseField>
              <BaseField label="Type" class="tw:w-36">
                <BaseInlineSelect
                  v-model="c.testType"
                  :items="TEST_TYPES.map((t) => ({ id: t, name: t }))"
                  :required="true"
                  class="tw:w-full"
                  @update:modelValue="markCharsDirty"
                />
              </BaseField>
              <BaseField label="Defect class" class="tw:w-32">
                <DefectSeveritySelectMenu v-model="c.defectClass" :required="true" @update:modelValue="markCharsDirty" />
              </BaseField>
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
              <BaseField v-slot="{ id: fieldId }" label="LSL (min)" class="tw:w-24">
                <BaseTextInput
                  :id="fieldId"
                  v-model.number="c.lsl"
                  type="number"
                  size="sm"
                  @update:modelValue="markCharsDirty"
                />
              </BaseField>
              <BaseField v-slot="{ id: fieldId }" label="Target" class="tw:w-24">
                <BaseTextInput
                  :id="fieldId"
                  v-model.number="c.targetValue"
                  type="number"
                  size="sm"
                  @update:modelValue="markCharsDirty"
                />
              </BaseField>
              <BaseField v-slot="{ id: fieldId }" label="USL (max)" class="tw:w-24">
                <BaseTextInput
                  :id="fieldId"
                  v-model.number="c.usl"
                  type="number"
                  size="sm"
                  @update:modelValue="markCharsDirty"
                />
              </BaseField>
              <BaseField v-slot="{ id: fieldId }" label="UOM" class="tw:w-24">
                <BaseTextInput
                  :id="fieldId"
                  v-model="c.uom"
                  size="sm"
                  placeholder="e.g. pH, %"
                  @update:modelValue="markCharsDirty"
                />
              </BaseField>
            </div>
            <BaseField v-if="c.requiresInstrument" label="Preferred instrument" class="tw:mt-2 tw:w-full tw:sm:w-72">
              <EquipmentSelectMenu
                v-model="c.preferredEquipmentId"
                nullLabel="— None (pick at capture) —"
                @update:modelValue="markCharsDirty"
              />
            </BaseField>
            <BaseField label="Test method / reference attachments" class="tw:mt-2">
              <RichTextAttachments
                v-model="c.testMethod"
                placeholder="e.g. Calibrated micrometer, 0.001 mm resolution, 20°C"
                @update:modelValue="markCharsDirty"
              />
            </BaseField>
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
          <DataTable
            :rows="characteristics"
            :columns="charColumns"
            rowKey="id"
            :mobileCards="false"
            :stickyHeader="false"
            hidePagination
            noDataLabel="No characteristics."
          >
            <template #body-cell-test="{ row }">
              <div class="tw:font-medium tw:text-on-main">
                {{ row.name }}
                <DefectSeverityBadgeById :severityId="row.defectClass || (row.isCritical ? 'CRITICAL' : 'MAJOR')" class="tw:ml-1 tw:text-micro" />
                <div v-if="row.testMethod" class="tw:mt-1">
                  <RichTextAttachments :modelValue="row.testMethod" :readonly="true" />
                </div>
              </div>
            </template>
            <template #body-cell-type="{ row }">
              <span class="tw:text-secondary">{{ row.testType }}</span>
            </template>
            <template #body-cell-spec="{ row }">
              <span class="tw:text-secondary">{{ limitText(row) }}</span>
            </template>
            <template #body-cell-instrument="{ row }">
              <EquipmentBadgeById v-if="row.preferredEquipmentId" :equipmentId="row.preferredEquipmentId" />
              <span v-else class="tw:text-secondary">{{ row.requiresInstrument ? 'Required' : '—' }}</span>
            </template>
          </DataTable>
        </template>
      </div>

      <!-- Version history -->
      <div
        v-if="versionHistory.length"
        class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden"
      >
        <div class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover">
          <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Version History</h3>
        </div>
        <DataTable
          :rows="versionHistory"
          :columns="versionColumns"
          rowKey="id"
          :mobileCards="false"
          :stickyHeader="false"
          hidePagination
          noDataLabel="No previous versions."
        >
          <template #body-cell-version="{ row }">
            <button
              type="button"
              class="tw:font-medium tw:text-on-main tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0"
              :aria-label="`Open specification version ${row.version}`"
              @click="openSpec(row.id)"
            >
              v{{ row.version }}
            </button>
          </template>
          <template #body-cell-status="{ row }">
            <SpecificationStatusBadgeById :statusId="row.statusId" />
          </template>
          <template #body-cell-effective="{ row }">
            <span class="tw:text-secondary">{{ row.effectiveFrom?.formatDate('date') || '—' }}</span>
          </template>
          <template #body-cell-superseded="{ row }">
            <span class="tw:text-secondary">{{ row.effectiveUntil?.formatDate('date') || '—' }}</span>
          </template>
        </DataTable>
      </div>

      <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
    </div>

    <!-- Rail: general / scope / lifecycle / notes. The slot is ALWAYS provided
         (never v-if on the #rail template) so BaseDetailLayout detects it and
         renders the rail; content is guarded inside instead. -->
    <template #rail>
      <template v-if="spec && header">
      <BaseRailCard title="General">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <div>
            <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Status</p>
            <SpecificationStatusBadgeById :statusId="spec.statusId" />
          </div>
          <div>
            <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Version</p>
            <BaseText variant="body" weight="medium">v{{ spec.version }}</BaseText>
          </div>
          <div>
            <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Code</p>
            <BaseTextInput
              v-if="canEditDraft"
              v-model="header.code"
              size="sm"
              placeholder="e.g. SPEC-001"
              @update:modelValue="markHeaderDirty"
            />
            <BaseText v-else variant="body" weight="medium">{{ spec.code || '—' }}</BaseText>
          </div>
        </div>
      </BaseRailCard>

      <BaseRailCard title="Scope">
        <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Applies to</p>
        <template v-if="canEditDraft">
          <SegmentedControl
            v-model="header.scope"
            :options="[
              { label: 'Item', value: 'product' },
              { label: 'Item group', value: 'family' },
              { label: 'Item type', value: 'productType' },
            ]"
            class="tw:mb-2"
            @update:modelValue="markHeaderDirty"
          />
          <ProductSelectMenu
            v-if="header.scope === 'product'"
            v-model="header.productId"
            class="tw:w-full"
            @update:modelValue="markHeaderDirty"
          />
          <ProductFamilySelectMenu
            v-else-if="header.scope === 'family'"
            v-model="header.productFamilyId"
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
          <BaseText v-if="product" variant="body">
            {{ product.name }}
            <span v-if="product.sku" class="tw:text-xs tw:text-secondary">· {{ product.sku }}</span>
            <span v-if="product.deletedAt" class="tw:text-xs tw:text-bad tw:ml-1">(deleted)</span>
          </BaseText>
          <BaseText v-else-if="productFamily" variant="body">
            {{ productFamily.name }}
            <span class="tw:text-xs tw:text-secondary">(item group)</span>
          </BaseText>
          <BaseText v-else-if="productType" variant="body">
            {{ productType.name }}
            <span class="tw:text-xs tw:text-secondary">(item type)</span>
          </BaseText>
          <BaseText v-else color="secondary">—</BaseText>
        </template>
      </BaseRailCard>

      <BaseRailCard title="Lifecycle">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <div>
            <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Created</p>
            <BaseText variant="body">{{ spec.createdAt?.formatDate('date') || '—' }} · {{ userName(creator) }}</BaseText>
          </div>
          <div v-if="spec.approvedAt">
            <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Approved</p>
            <BaseText variant="body">{{ spec.approvedAt?.formatDate('date') }} · {{ userName(approver) }}</BaseText>
          </div>
          <div v-if="spec.effectiveFrom">
            <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Effective from</p>
            <BaseText variant="body">{{ spec.effectiveFrom?.formatDate('date') }}</BaseText>
          </div>
          <div v-if="spec.effectiveUntil">
            <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Effective until</p>
            <BaseText variant="body">{{ spec.effectiveUntil?.formatDate('date') }}</BaseText>
          </div>
        </div>
      </BaseRailCard>

      <BaseRailCard title="Notes">
        <BaseTextarea
          v-if="canEditDraft"
          v-model="header.notes"
          :rows="3"
          placeholder="Optional notes"
          @update:modelValue="markHeaderDirty"
        />
        <BaseText v-else-if="spec.notes" variant="body" class="tw:whitespace-pre-wrap">{{ spec.notes }}</BaseText>
        <BaseText v-else color="secondary">—</BaseText>
      </BaseRailCard>
      </template>
    </template>
  </BaseDetailLayout>
</template>
