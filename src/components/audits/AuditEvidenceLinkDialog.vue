<script setup>
/**
 * Link an existing record as audit evidence — the no-upload path that
 * mirrors audit_evidence_links. Polymorphic across nine entity types
 * (matches the BE CHECK constraint).
 *
 * Scope FK matches AuditEvidenceUploadDialog: 'audit' / 'finding' /
 * 'response'. POSTs to /v1/services/auditEvidenceLinks.
 */
import { IconLink } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  auditInstanceId: { type: String, required: true },
  scope: { type: String, default: 'audit' }, // 'audit' | 'finding' | 'response'
  scopeId: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue', 'linked'])

const toast = useToast()

// Kind catalog mirrors the BE CHECK constraint. modelName is the
// SyncEngine model; numberAccessor / titleAccessor are the row's
// display fields.
const KIND_CATALOG = [
  {
    id: 'Document',
    label: 'Document',
    modelName: 'Document',
    numberAccessor: (r) => r.docNumber,
    titleAccessor: (r) => r.title,
  },
  {
    id: 'FieldRecord',
    label: 'Log Book Entry',
    modelName: 'FieldRecord',
    numberAccessor: (r) => r.recordNumber || r.id?.slice(0, 8),
    titleAccessor: (r) => r.title || r.recordNumber || r.id,
  },
  {
    id: 'Capa',
    label: 'CAPA',
    modelName: 'Capa',
    numberAccessor: (r) => r.capaNumber,
    titleAccessor: (r) => r.title,
  },
  {
    id: 'Nonconformance',
    label: 'NC',
    modelName: 'Nonconformance',
    numberAccessor: (r) => r.ncNumber,
    titleAccessor: (r) => r.title,
  },
  {
    id: 'ChangeRequest',
    label: 'Change Request',
    modelName: 'ChangeRequest',
    numberAccessor: (r) => r.crNumber,
    titleAccessor: (r) => r.title,
  },
  {
    id: 'TrainingInstance',
    label: 'Training Instance',
    modelName: 'TrainingInstance',
    numberAccessor: (r) => r.id?.slice(0, 8),
    titleAccessor: (r) => r.name || r.title || r.id,
  },
  {
    id: 'SupplierAsset',
    label: 'Supplier Document',
    modelName: 'SupplierAsset',
    numberAccessor: (r) => r.documentType || '—',
    titleAccessor: (r) => r.title || r.id,
  },
]

const kindId = ref(KIND_CATALOG[0].id)
const search = ref('')
const selectedTargetId = ref(null)
const caption = ref('')
const linking = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      kindId.value = KIND_CATALOG[0].id
      search.value = ''
      selectedTargetId.value = null
      caption.value = ''
    }
  },
)
watch(kindId, () => {
  search.value = ''
  selectedTargetId.value = null
})

const activeKind = computed(() => KIND_CATALOG.find((k) => k.id === kindId.value))

const candidates = useLiveQueryWithDeps(
  [() => kindId.value, () => search.value],
  async (db, [kind, q]) => {
    const cfg = KIND_CATALOG.find((k) => k.id === kind)
    if (!cfg || !db[cfg.modelName]) return []
    let rows = await db[cfg.modelName].where().exec()

    // Document kind: only surface documents that currently have an
    // EFFECTIVE version. Auditors should be able to link the
    // controlled, in-force document as evidence — not drafts, not
    // retired/superseded copies. DRAFT/SUPERSEDED docs would point at
    // a non-authoritative artifact and pollute the audit trail.
    if (kind === 'Document') {
      const effectiveVersions = await db.DocumentVersion.where(
        'statusId',
        'EFFECTIVE',
      ).exec()
      const effectiveDocIds = new Set(effectiveVersions.map((v) => v.documentId))
      rows = rows.filter((r) => effectiveDocIds.has(r.id))
    }

    const sorted = rows.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
    const lower = (q || '').toLowerCase().trim()
    const filtered = lower
      ? sorted.filter((r) => {
          const num = String(cfg.numberAccessor(r) || '').toLowerCase()
          const title = String(cfg.titleAccessor(r) || '').toLowerCase()
          return num.includes(lower) || title.includes(lower)
        })
      : sorted
    return filtered.slice(0, 50)
  },
  { initial: [] },
)

function close() {
  emit('update:modelValue', false)
}

async function handleLink() {
  if (!selectedTargetId.value || linking.value) return
  linking.value = true
  try {
    const payload = {
      auditInstanceId: props.auditInstanceId,
      entityType: kindId.value,
      entityId: selectedTargetId.value,
      caption: caption.value.trim() || null,
    }
    if (props.scope === 'finding' && props.scopeId) {
      payload.auditFindingId = props.scopeId
    } else if (props.scope === 'response' && props.scopeId) {
      payload.auditRequirementResponseId = props.scopeId
    }
    await post('/v1/services/auditEvidenceLinks', payload)
    toast.success('Evidence linked')
    emit('linked')
    close()
  } catch (e) {
    toast.error(e.message || 'Failed to link evidence')
  } finally {
    linking.value = false
  }
}
</script>

<template>
  <BaseDialog :modelValue="modelValue" title="Link Existing Record as Evidence" maxWidth="lg" @update:modelValue="close">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <BaseField label="Record Type">
        <BaseInlineSelect v-model="kindId" :items="KIND_CATALOG" :required="true" />
      </BaseField>

      <BaseField>
        <template #label>Search {{ activeKind?.label ?? 'records' }}</template>
        <template #default="{ id: fieldId }">
          <BaseTextInput :id="fieldId" v-model="search" placeholder="Search by number or title…" />
        </template>
      </BaseField>

      <div
        v-if="!candidates.length"
        class="tw:py-10 tw:text-center tw:text-sm tw:text-secondary tw:italic"
      >
        No {{ activeKind?.label?.toLowerCase() ?? 'records' }} match this search.
      </div>

      <div
        v-else
        class="tw:flex tw:flex-col tw:divide-y tw:divide-divider tw:max-h-72 tw:overflow-y-auto tw:border tw:border-divider tw:rounded-lg"
      >
        <button
          v-for="row in candidates"
          :key="row.id"
          type="button"
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:text-left tw:cursor-pointer tw:transition-colors tw:bg-white tw:border-0 tw:w-full"
          :class="
            selectedTargetId === row.id
              ? 'tw:bg-primary/5 tw:border-l-4 tw:border-primary'
              : 'tw:hover:bg-main-hover/40'
          "
          @click="selectedTargetId = row.id"
        >
          <div class="tw:flex tw:flex-col tw:gap-0.5 tw:flex-1 tw:min-w-0">
            <div class="tw:flex tw:items-center tw:gap-2">
              <code class="tw:text-xs tw:font-mono tw:text-secondary">
                {{ activeKind.numberAccessor(row) }}
              </code>
              <span class="tw:text-sm tw:font-medium tw:truncate">
                {{ activeKind.titleAccessor(row) }}
              </span>
            </div>
          </div>
          <IconLink
            v-if="selectedTargetId === row.id"
            :size="16"
            class="tw:text-primary tw:shrink-0 tw:mt-1"
          />
        </button>
      </div>

      <BaseField v-slot="{ id: fieldId }" label="Caption">
        <BaseTextarea
          :id="fieldId"
          v-model="caption"
          :rows="2"
          placeholder="What does this record prove?"
        />
      </BaseField>
    </div>
    <template #footer>
      <BaseDialogFooter
        submitLabel="Link"
        :loading="linking"
        :disabled="!selectedTargetId"
        @cancel="close"
        @submit="handleLink"
      />
    </template>
  </BaseDialog>
</template>
