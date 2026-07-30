<script setup>
/**
 * Share a controlled document with a supplier's PORTAL USERS.
 *
 * This used to create a `SupplierDocument` row, which minted a permanent
 * public token and emailed a link that anyone could open and forward. That
 * surface was retired: sharing now writes `SharedWithUser` grants, so the
 * document is readable only by a named, logged-in supplier user, the grant is
 * revocable, and every read happens inside a session.
 *
 * The grant is on the DOCUMENT (`entityType: 'Document'`); RLS then exposes
 * only its EFFECTIVE version and that version's sections — drafts and
 * superseded revisions stay invisible, which is what document control
 * requires.
 */
import { IconAlertTriangle } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  supplierId: {
    type: String,
    required: true,
  },
})

const open = defineModel({
  type: Boolean,
  default: false,
})

// The supplier's portal users — the only parties that can receive a share.
const portalUsers = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    const users = await db.User.where().exec()
    return users
      .filter((u) => u.supplierId === supplierId && u.kind === 'EXTERNAL_SUPPLIER')
      .map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      }))
  },
  { models: ['User'], initial: [] },
)

// Documents that have an EFFECTIVE version — the only ones shareable.
const shareableDocuments = useLiveQuery(
  async (db) => {
    const versions = await db.DocumentVersion.where('statusId', 'EFFECTIVE').exec()
    const seen = new Set()
    const resolved = await Promise.all(
      versions.map(async (v) => {
        if (seen.has(v.documentId)) return null
        seen.add(v.documentId)
        const doc = await db.Document.findByPk(v.documentId)
        if (!doc) return null
        return { id: doc.id, name: `${doc.docNumber} — ${doc.title}` }
      }),
    )
    return resolved.filter(Boolean)
  },
  { models: ['DocumentVersion', 'Document'], initial: [] },
)

// Live grants for this supplier's users, so an already-shared document isn't
// offered twice to the same person.
const existingShares = useLiveQueryWithDeps(
  [() => portalUsers.value.map((u) => u.id).join(',')],
  async (db, [userIds]) => {
    if (!userIds) return []
    const ids = new Set(userIds.split(','))
    const rows = await db.SharedWithUser.where('entityType', 'Document').exec()
    return rows.filter((r) => ids.has(r.userId))
  },
  { models: ['SharedWithUser'], initial: [] },
)

const selectedDocumentId = ref(null)
const selectedUserIds = ref([])
const saving = ref(false)

// Users who already hold a live grant on the chosen document.
const alreadySharedUserIds = computed(() => {
  if (!selectedDocumentId.value) return new Set()
  return new Set(
    existingShares.value
      .filter((r) => r.entityId === selectedDocumentId.value)
      .map((r) => r.userId),
  )
})

const availableUsers = computed(() =>
  portalUsers.value.filter((u) => !alreadySharedUserIds.value.has(u.id)),
)

const canShare = computed(
  () => !!selectedDocumentId.value && selectedUserIds.value.length > 0 && !saving.value,
)

const addShare = useLiveMutation(async (db, { userId, entityId }) => {
  const row = db.SharedWithUser.create({
    userId,
    entityType: 'Document',
    entityId,
    grantedVia: 'MANUAL',
    grantedBy: currentSession.value?.userId ?? null,
  })
  await row.save()
  return row
})

async function handleShare() {
  if (!canShare.value) return
  saving.value = true
  try {
    for (const userId of selectedUserIds.value) {
      await addShare({ userId, entityId: selectedDocumentId.value })
    }
    open.value = false
  } finally {
    saving.value = false
  }
}

// Default to every portal user — sharing with "the supplier" is the common
// intent; narrowing is the exception.
watch([open, availableUsers], ([isOpen]) => {
  if (isOpen && !selectedUserIds.value.length) {
    selectedUserIds.value = availableUsers.value.map((u) => u.id)
  }
})

watch(open, (val) => {
  if (!val) {
    selectedDocumentId.value = null
    selectedUserIds.value = []
  }
})
</script>

<template>
  <BaseDialog v-model="open" title="Share Document" maxWidth="sm">
    <div class="tw:p-4 tw:space-y-4">
      <div
        v-if="!portalUsers.length"
        class="tw:flex tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:p-3"
      >
        <IconAlertTriangle :size="18" class="tw:shrink-0 tw:text-warn" />
        <p class="tw:text-sm tw:text-secondary">
          This supplier has no portal users yet. Documents are shared with named users who sign in
          to the portal — invite someone from the
          <RouterLink
            :to="getCompanyPath(`/suppliers/${props.supplierId}?tab=users`)"
            class="tw:text-primary tw:underline"
            @click="open = false"
          >
            Users tab
          </RouterLink>
          first.
        </p>
      </div>

      <template v-else>
        <BaseField label="Select Document">
          <BaseSelect
            v-model="selectedDocumentId"
            :options="shareableDocuments"
            optionLabel="name"
            optionValue="id"
            :required="true"
            placeholder="Choose a document"
          />
        </BaseField>

        <BaseField label="Share With">
          <BaseSelect
            v-model="selectedUserIds"
            :options="availableUsers"
            optionLabel="name"
            optionValue="id"
            :multiple="true"
            placeholder="Choose portal users"
          />
        </BaseField>

        <p v-if="selectedDocumentId && !availableUsers.length" class="tw:text-sm tw:text-secondary">
          Every portal user of this supplier already has this document.
        </p>

        <p class="tw:text-caption tw:text-secondary">
          Documents this one references are shared automatically, and are revoked with it.
        </p>
      </template>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="open = false">Cancel</BaseButton>
      <BaseButton v-if="portalUsers.length" :disabled="!canShare" @click="handleShare">
        <BaseSpinner v-if="saving" size="sm" color="white" />
        <span>{{ saving ? 'Sharing...' : 'Share' }}</span>
      </BaseButton>
    </div>
  </BaseDialog>
</template>
