<script setup>
import { IconLink, IconLinkOff, IconTrash, IconLinkPlus } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  documentId: {
    type: String,
    required: true,
  },
  versionId: {
    type: String,
    default: null,
  },
})

const toast = useToast()

const confirmRemove = ref({ open: false, link: null })

const links = useLiveQueryWithDeps(
  [() => props.versionId],
  async (db, [versionId]) => {
    if (!versionId) return []
    const all = await db.DocumentLink.where().exec()
    return all.filter((l) => l.fromDocumentVersionId === versionId)
  },

  { models: ['DocumentLink'], initial: [] },
)

const allDocuments = useLiveQuery(async (db) => db.Document.where().exec(), {
  models: ['Document'],
  initial: [],
})
const allVersions = useLiveQuery(async (db) => db.DocumentVersion.where().exec(), {
  models: ['DocumentVersion'],
  initial: [],
})

const documentsById = computed(() => {
  const map = {}
  for (const d of allDocuments.value) map[d.id] = d
  return map
})

const versionsById = computed(() => {
  const map = {}
  for (const v of allVersions.value) map[v.id] = v
  return map
})

// Only documents with at least one EFFECTIVE version are pickable as
// link targets — auditors / authors shouldn't link to drafts or
// retired/superseded copies. `allDocuments` itself stays unfiltered so
// the `documentsById` resolution map can still render the title of an
// already-linked document that has since been superseded.
const effectiveDocumentIds = computed(() => {
  const ids = new Set()
  for (const v of allVersions.value) {
    if (v.statusId === 'EFFECTIVE') ids.add(v.documentId)
  }
  return ids
})

const availableDocuments = computed(() =>
  (allDocuments.value ?? [])
    .filter((d) => d.id !== props.documentId && effectiveDocumentIds.value.has(d.id))
    .map((d) => ({ id: d.id, name: `${d.docNumber} - ${d.title}` })),
)

const showAddDialog = ref(false)
const linkForm = ref({
  targetDocumentId: '',
  linkType: 'RELATED',
})

function getTargetDocument(link) {
  const version = versionsById.value[link.toDocumentVersionId]
  if (!version) return null
  return documentsById.value[version.documentId]
}

async function onAddLink() {
  if (!linkForm.value.targetDocumentId) {
    toast.warning('Select a document to link')
    return
  }

  const add = useLiveMutation(async (db) => {
    const latestVersion = await db.DocumentVersion.where(
      'documentId',
      linkForm.value.targetDocumentId,
    )
      .orderBy('createdAt', 'desc')
      .first()

    if (!latestVersion) throw new Error('Target document has no versions')

    const link = db.DocumentLink.create({
      fromDocumentVersionId: props.versionId,
      toDocumentVersionId: latestVersion.id,
      relationshipType: linkForm.value.linkType,
      createdBy: currentSession.value?.userId || '',
    })
    await link.save()
    return link
  })

  try {
    await add()
    toast.success('Link created')
    showAddDialog.value = false
    linkForm.value = { targetDocumentId: '', linkType: 'RELATED' }
  } catch (err) {
    toast.error(err.message || 'Failed to create link')
  }
}

async function onDeleteLink(link) {
  confirmRemove.value = { open: true, link }
}

async function confirmDeleteLink() {
  if (!confirmRemove.value.link) return
  await confirmRemove.value.link.delete()
  toast.success('Link removed')
  confirmRemove.value = { open: false, link: null }
}

function openAddDialog() {
  showAddDialog.value = true
}

function getLinkTypeBadgeClass(linkType) {
  const map = {
    RELATED: 'tw:bg-blue-100 tw:text-blue-700',
    SUPERSEDES: 'tw:bg-orange-100 tw:text-orange-700',
    REFERENCES: 'tw:bg-sky-100 tw:text-sky-700',
    PARENT: 'tw:bg-green-100 tw:text-green-700',
    CHILD: 'tw:bg-green-100 tw:text-green-700',
  }
  return map[linkType] || 'tw:bg-gray-100 tw:text-gray-600'
}
</script>

<template>
  <div class="tw:p-6">
    <BaseSectionHeader title="Document Links" :level="3" size="section-title" class="tw:mb-4">
      <template #actions>
        <BaseButton variant="outline" @click="openAddDialog">
          <IconLinkPlus :size="16" class="tw:mr-1" />
          Add Link
        </BaseButton>
      </template>
    </BaseSectionHeader>

    <!-- Links List -->
    <div v-if="links.length > 0" class="tw:space-y-2">
      <div
        v-for="link in links"
        :key="link.id"
        class="tw:flex tw:items-center tw:justify-between tw:p-3 tw:bg-main-hover tw:rounded-lg tw:border tw:border-divider"
      >
        <div class="tw:flex tw:items-center tw:gap-3">
          <IconLink :size="20" class="tw:text-primary tw:shrink-0" />
          <div>
            <div class="tw:text-sm tw:font-semibold tw:text-on-sidebar">
              {{ getTargetDocument(link)?.docNumber || link.toDocumentVersionId }}
              <span class="tw:font-normal tw:text-secondary">
                {{ getTargetDocument(link)?.title ? `— ${getTargetDocument(link).title}` : '' }}
              </span>
            </div>
          </div>
          <span
            :class="getLinkTypeBadgeClass(link.relationshipType)"
            class="tw:text-xs tw:font-bold tw:px-2 tw:py-0.5 tw:rounded tw:ml-2"
          >
            {{ link.relationshipType }}
          </span>
        </div>
        <button
          class="tw:p-1.5 tw:rounded tw:hover:bg-red-50 tw:text-secondary tw:hover:text-red-600"
          @click="onDeleteLink(link)"
        >
          <IconTrash :size="16" />
        </button>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="tw:text-center tw:py-8 tw:text-secondary">
      <IconLinkOff :size="40" class="tw:text-secondary tw:mb-2 tw:mx-auto" />
      <div>No linked documents.</div>
      <div class="tw:text-xs tw:mt-1">
        Link related documents, references, or parent/child relationships.
      </div>
    </div>

    <!-- Add Link Dialog -->
    <BaseDialog v-model="showAddDialog" title="Add Document Link" persistent>
      <div class="tw:space-y-4">
        <BaseField label="Target Document">
          <BaseSelectMenu
            v-model="linkForm.targetDocumentId"
            :items="availableDocuments"
            :required="true"
          />
        </BaseField>
        <BaseField label="Link Type">
          <BaseSelectMenu
            v-model="linkForm.linkType"
            :items="[
              { id: 'RELATED', name: 'Related' },
              { id: 'SUPERSEDES', name: 'Supersedes' },
              { id: 'REFERENCES', name: 'References' },
              { id: 'PARENT', name: 'Parent' },
              { id: 'CHILD', name: 'Child' },
            ]"
            :required="true"
          />
        </BaseField>
      </div>
      <template #footer>
        <BaseDialogFooter
          submitLabel="Add Link"
          :disabled="!linkForm.targetDocumentId"
          @cancel="showAddDialog = false"
          @submit="onAddLink"
        />
      </template>
    </BaseDialog>

    <!-- Confirm Remove Dialog -->
    <BaseConfirmDialog
      v-model="confirmRemove.open"
      title="Remove Link"
      message="Are you sure you want to remove this link?"
      okLabel="Remove"
      @ok="confirmDeleteLink"
    />
  </div>
</template>
