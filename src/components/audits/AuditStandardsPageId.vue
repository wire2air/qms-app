<script setup>
/**
 * Audit Standard detail page.
 *
 * Layout: header with name + breadcrumb + code + status + version
 * badge, main area carries the requirements editor (when there's an
 * editable DRAFT), right rail shows metadata. Inline auto-save for
 * the parent metadata fields (name + description) on the standard
 * row itself, mirroring the NC / CAPA / CR detail page pattern.
 *
 * Version lifecycle (DRAFT → UNDER_REVIEW → EFFECTIVE → REJECTED →
 * SUPERSEDED) + Submit-for-Approval action ship in Phase B-3 along
 * with the AuditStandardVersionService. Today we render whatever
 * version state the bootstrap or BE create-flow produces.
 */
import { IconClipboardList, IconArrowBack } from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { patch } from '@/api'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()
const router = useRouter()

const standard = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.AuditStandard.findByPk(id),
)
const loading = computed(() => standard.value === undefined)

const canUpdate = computed(() => isAllowed(['auditStandards:update']))
const canDelete = computed(() => isAllowed(['auditStandards:delete']))
const isOwner = computed(() => !!currentSession.value?.isOwner)
const isEditable = computed(() => canUpdate.value || isOwner.value)

const breadcrumbs = computed(() => [
  { label: 'Audits', to: getCompanyPath('/audits?tab=standards') },
  { label: 'Standards', to: getCompanyPath('/audits?tab=standards') },
  { label: standard.value?.name || standard.value?.code || 'Loading…' },
])

// ─── Versions for this standard ─────────────────────────────────────
const versions = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [standardId]) => {
    if (!standardId) return []
    const rows = await db.AuditStandardVersion.where('auditStandardId', standardId).exec()
    return rows.sort((a, b) => {
      const av = (a.versionMajor ?? 0) * 1000 + (a.versionMinor ?? 0)
      const bv = (b.versionMajor ?? 0) * 1000 + (b.versionMinor ?? 0)
      return bv - av
    })
  },
  { initial: [] },
)
const effectiveVersion = computed(() => versions.value.find((v) => v.statusId === 'EFFECTIVE'))
const draftVersion = computed(() => versions.value.find((v) => v.statusId === 'DRAFT'))
const editableVersion = computed(() => draftVersion.value ?? versions.value.find((v) => v.statusId === 'REJECTED'))

const activeVersion = computed(() => editableVersion.value ?? effectiveVersion.value ?? versions.value[0] ?? null)

function versionBadgeClass(status) {
  switch (status) {
    case 'DRAFT':
      return 'tw:bg-gray-100 tw:text-gray-700'
    case 'UNDER_REVIEW':
      return 'tw:bg-amber-100 tw:text-amber-700'
    case 'EFFECTIVE':
      return 'tw:bg-emerald-100 tw:text-emerald-700'
    case 'REJECTED':
      return 'tw:bg-red-100 tw:text-red-700'
    case 'SUPERSEDED':
      return 'tw:bg-purple-100 tw:text-purple-700'
    default:
      return 'tw:bg-gray-100 tw:text-gray-600'
  }
}

// ─── Inline metadata editing (auto-save via PATCH /v1/services/auditStandards/:id) ──
const isFirstLoad = ref(true)
const saving = ref(false)
const saveError = ref(null)

const debouncedSave = useDebounceFn(async () => {
  if (!standard.value) return
  if (!isEditable.value) return
  saving.value = true
  saveError.value = null
  try {
    await patch(`/v1/services/auditStandards/${standard.value.id}`, {
      name: standard.value.name,
      description: standard.value.description ?? null,
      auditStandardTypeId: standard.value.auditStandardTypeId ?? null,
    })
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
    toast.error(saveError.value)
  } finally {
    saving.value = false
  }
}, 500)

watch(
  standard,
  () => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (standard.value) debouncedSave()
  },
  { deep: true },
)

// ─── Click-to-edit toggles ───────────────────────────────────────────
const editingName = ref(false)
const editingDescription = ref(false)

// ─── Delete ─────────────────────────────────────────────────────────
const showDeleteDialog = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!standard.value?.id) return
  deleting.value = true
  try {
    await standard.value.delete()
    toast.success('Standard archived')
    showDeleteDialog.value = false
    router.push(getCompanyPath('/audits?tab=standards'))
  } catch (e) {
    toast.error(e.message || 'Failed to archive standard')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          v-if="standard"
          variant="outline"
          size="sm"
          @click="router.push(getCompanyPath('/audits?tab=standards'))"
        >
          <IconArrowBack :size="16" class="tw:mr-1" />
          Back
        </BaseButton>
        <BaseButton
          v-if="canDelete && standard"
          variant="danger"
          size="sm"
          :disabled="deleting"
          @click="showDeleteDialog = true"
        >
          Delete
        </BaseButton>
      </div>
    </SafeTeleport>

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <div
        class="tw:animate-spin tw:rounded-full tw:size-12 tw:border-4 tw:border-primary tw:border-t-transparent"
      />
    </div>

    <BaseEmptyState
      v-else-if="!standard"
      title="Standard not found"
      description="This audit standard could not be found."
    />

    <div v-else class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_280px] tw:gap-4 tw:items-start">
          <!-- Left column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- Details card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                Standard Details
              </div>

              <BaseTextInput
                v-if="editingName && isEditable"
                v-model="standard.name"
                placeholder="Standard name"
                autofocus
                class="tw:mb-2"
                @blur="editingName = false"
              />
              <div
                v-else
                class="tw:text-base tw:font-semibold tw:text-on-main tw:mb-2"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                @click="isEditable && (editingName = true)"
              >
                {{ standard.name }}
              </div>

              <div
                v-if="editingDescription && isEditable"
                class="tw:mb-4"
              >
                <BaseTextarea
                  v-model="standard.description"
                  :rows="3"
                  placeholder="Optional description"
                  @blur="editingDescription = false"
                />
              </div>
              <div
                v-else
                class="tw:mb-4 tw:text-sm tw:text-secondary tw:leading-relaxed"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                @click="isEditable && (editingDescription = true)"
              >
                {{
                  standard.description ||
                  (isEditable ? 'Add a description…' : '—')
                }}
              </div>

              <div class="tw:grid tw:grid-cols-2 tw:gap-3">
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Type</div>
                  <AuditStandardTypeSelectMenu
                    v-if="isEditable"
                    v-model="standard.auditStandardTypeId"
                  />
                  <AuditStandardTypeBadgeById
                    v-else-if="standard.auditStandardTypeId"
                    :standardTypeId="standard.auditStandardTypeId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Effective</div>
                  <span class="tw:text-sm tw:font-medium">
                    {{ standard.effectiveDate ? standard.effectiveDate.formatDate('date') : '—' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Requirements editor (or read-only view) -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4">
                <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
                  Requirements
                  <span
                    v-if="activeVersion"
                    class="tw:font-normal tw:normal-case tw:text-secondary tw:ml-2"
                  >
                    v{{ activeVersion.versionMajor }}.{{ activeVersion.versionMinor }}
                  </span>
                </div>
                <span
                  v-if="activeVersion"
                  class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
                  :class="versionBadgeClass(activeVersion.statusId)"
                >
                  {{ activeVersion.statusId }}
                </span>
              </div>

              <AuditRequirementsEditor
                v-if="editableVersion && isEditable"
                :version="editableVersion"
              />
              <AuditRequirementsEditor
                v-else-if="activeVersion"
                :version="activeVersion"
                readonly
              />
              <div
                v-else
                class="tw:py-12 tw:text-center tw:text-sm tw:text-secondary tw:italic"
              >
                No version yet — try creating a new draft.
              </div>
            </div>
          </div>

          <!-- Right column / Overview -->
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                Overview
              </div>
              <div class="tw:flex tw:flex-col">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Code</span>
                  <code class="tw:text-xs tw:font-mono tw:text-on-main tw:bg-main-hover tw:px-2 tw:py-0.5 tw:rounded">
                    {{ standard.code }}
                  </code>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Status</span>
                  <BaseBadge
                    :class="
                      standard.statusId === 'ACTIVE'
                        ? 'tw:bg-emerald-100 tw:text-emerald-700'
                        : standard.statusId === 'INACTIVE'
                          ? 'tw:bg-gray-100 tw:text-gray-700'
                          : 'tw:bg-purple-100 tw:text-purple-700'
                    "
                  >
                    {{ standard.statusId }}
                  </BaseBadge>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Versions</span>
                  <span class="tw:text-xs tw:font-medium">{{ versions.length }}</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Created</span>
                  <span class="tw:text-xs">
                    {{ standard.createdAt ? standard.createdAt.formatDate('date') : '—' }}
                  </span>
                </div>
                <div v-if="saving" class="tw:text-[11px] tw:text-secondary tw:italic tw:pt-1">
                  Saving…
                </div>
                <div v-else-if="saveError" class="tw:text-[11px] tw:text-red-600 tw:pt-1">
                  {{ saveError }}
                </div>
              </div>
            </div>

            <!-- Versions list -->
            <div
              v-if="versions.length"
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4"
            >
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3 tw:flex tw:items-center tw:gap-2"
              >
                <IconClipboardList :size="14" />
                Versions
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div
                  v-for="v in versions"
                  :key="v.id"
                  class="tw:flex tw:items-center tw:justify-between tw:py-1.5 tw:text-xs"
                >
                  <span class="tw:font-mono">v{{ v.versionMajor }}.{{ v.versionMinor }}</span>
                  <span
                    class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-1.5 tw:py-0.5"
                    :class="versionBadgeClass(v.statusId)"
                  >
                    {{ v.statusId }}
                  </span>
                </div>
              </div>
              <div class="tw:text-[10px] tw:text-secondary tw:italic tw:pt-2 tw:border-t tw:border-divider tw:mt-2">
                Submit-for-approval flow lands in Phase B-3.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <BaseDialog v-model="showDeleteDialog" title="Archive Standard" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Archive <strong>{{ standard?.name }}</strong>?
        Existing audit instances referencing this standard keep their reference and
        snapshot. Active audits filed against it stay valid; the standard just won't
        appear in pickers for new audits.
      </p>
      <p
        v-if="!canDelete"
        class="tw:text-xs tw:text-amber-700 tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded tw:p-2 tw:mb-3"
      >
        You don't have the auditStandards:delete permission. Soft-delete only.
      </p>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="deleting" @click="showDeleteDialog = false">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :disabled="deleting" @click="handleDelete">
          {{ deleting ? 'Archiving…' : 'Archive' }}
        </BaseButton>
      </div>
    </BaseDialog>
  </div>
</template>
