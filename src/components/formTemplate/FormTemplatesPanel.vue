<script setup>
/**
 * Form templates list panel — the "Forms" tab of the App Builder workspace
 * (extracted from the old standalone formTemplatesHome page; /templates now
 * redirects there). Standalone form templates only (kind !== 'BLOCK') —
 * Form Blocks live on their own /form-blocks page.
 */
import { getCompanyPath } from '@/utils/routeHelpers'
import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'
import { isAllowed } from '@/utils/currentSession.js'
import { IconLayoutList, IconTable } from '@tabler/icons-vue'

const router = useRouter()
const showCreateDialog = ref(false)
const viewMode = useCompanyLocalStorage('templates-view-mode', 'list')
const { confirm } = useConfirm()
const toast = useToast()

// Create needs read too: the create mutation reads the new row back through the
// `formTemplates:read` RLS SELECT policy, so create-without-read fails at the DB.
const canCreateTemplate = computed(() =>
  isAllowed(['forms_templates:create', 'forms_templates:read']),
)
const canUpdateTemplate = computed(() => isAllowed(['forms_templates:update']))

// Share link for the LIST view. The table view hosts its own ShareFormDialog;
// the list had no route to it, and `templates-view-mode` defaults to 'list' — so
// on a fresh profile the Publish/Revoke control that governs whether a form is
// reachable by anonymous callers was behind an unlabelled view switcher. Since
// `is_public` defaults false and was deliberately not backfilled, that made
// publishing effectively undiscoverable. Kept as a second mount rather than
// hoisting the table's, so the table's existing behaviour is untouched.
const shareTemplate = ref(null)
const showShare = ref(false)
function onShareTemplate(template) {
  shareTemplate.value = template
  showShare.value = true
}

// Multi-select dimensions (Linear-style filter menu) — arrays of ids.
const filters = ref({
  search: '',
  documentTypeId: [],
  siteId: [],
  statusId: [],
})

const templates = useLiveQueryWithDeps(
  [
    () => filters.value.search,
    () => filters.value.statusId,
    () => filters.value.siteId,
    () => filters.value.documentTypeId,
  ],
  async (db, [search, statusId, siteId, documentTypeId]) => {
    // Standalone forms only — Form Blocks live on their own page.
    let results = (await db.FormTemplate.where().exec()).filter((t) => t.kind !== 'BLOCK')

    if (statusId) {
      const statusIds = Array.isArray(statusId) ? statusId : [statusId]
      if (statusIds.length) results = results.filter((t) => statusIds.includes(t.statusId))
    }
    if (documentTypeId) {
      const ids = Array.isArray(documentTypeId) ? documentTypeId : [documentTypeId]
      if (ids.length) results = results.filter((t) => ids.includes(t.documentTypeId))
    }

    if (siteId) {
      const siteIds = Array.isArray(siteId) ? siteId : [siteId]
      if (siteIds.length) {
        const siteOnTemplates = await db.SiteOnTemplate.where().exec()
        const templateIdsForSites = new Set(
          siteOnTemplates.filter((s) => siteIds.includes(s.siteId)).map((s) => s.templateId),
        )
        results = results.filter((t) => templateIdsForSites.has(t.id))
      }
    }

    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (t) => t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
      )
    }

    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['FormTemplate', 'SiteOnTemplate'], initial: [] },
)

const viewSwitches = [
  { icon: IconLayoutList, value: 'list', tooltip: 'List View' },
  { icon: IconTable, value: 'table', tooltip: 'Table View' },
]

function handleTemplateCreated(template) {
  const path = getCompanyPath(`/templates/${template.id}`)
  router.push({ path, query: { mode: 'schema' } })
}

// ── Clone (user request 2026-08-14) ─────────────────────────────────────────
// Copies schema/type/config + site applicability into a fresh DRAFT so the
// author can tweak before activating. internalName is never copied — it's the
// promoted-module marker and unique per company.
const cloneTemplateMutation = useLiveMutation(async (db, source) => {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  const clone = db.FormTemplate.create({
    title: `${source.title} (Copy)`,
    code: `${source.code}-COPY-${rand}`,
    schema: JSON.parse(JSON.stringify(source.schema ?? [])),
    documentTypeId: source.documentTypeId ?? null,
    internalName: null,
    statusId: 'DRAFT',
    kind: source.kind ?? 'FORM',
    blockCategory: source.blockCategory ?? null,
    config: JSON.parse(JSON.stringify(source.config ?? {})),
  })
  await clone.save()
  // Carry site applicability over so the clone shows up in the same places.
  const siteLinks = await db.SiteOnTemplate.where('templateId', source.id).exec()
  for (const link of siteLinks) {
    const copy = db.SiteOnTemplate.create({ templateId: clone.id, siteId: link.siteId })
    await copy.save()
  }
  return clone
})

async function onCloneTemplate(source) {
  try {
    const clone = await cloneTemplateMutation(source)
    toast.success(`Cloned as "${clone.title}" (draft)`)
    router.push(getCompanyPath(`/templates/${clone.id}`))
  } catch (err) {
    toast.error(err?.message || 'Failed to clone template')
  }
}

// Templates are never deleted — archived rows are the version history, and
// records/workflows built from a template keep referencing it by id. A DB
// trigger enforces the same rule server-side.
async function onArchiveTemplate(template) {
  try {
    if (template.statusId === 'ARCHIVED') {
      template.statusId = 'ACTIVE'
      await template.save()
      return
    }
    const ok = await confirm({
      title: 'Archive Template',
      message: `Archive '${template.title}' (${template.code})? It disappears from pickers and new usage, but existing records and workflows built from it keep working. You can restore it anytime.`,
      okLabel: 'Archive',
    })
    if (!ok) return
    template.statusId = 'ARCHIVED'
    await template.save()
  } catch (err) {
    toast.error(err?.message || 'Failed to update template status')
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <FormTemplatesFilterToolbar v-model:filters="filters">
      <template #actions>
        <BaseSwitcher v-model="viewMode" :switches="viewSwitches" />
        <BaseButton v-if="canCreateTemplate" size="sm" @click="showCreateDialog = true">
          Create Form
        </BaseButton>
      </template>
    </FormTemplatesFilterToolbar>

    <FormTemplatesTable
      v-if="viewMode === 'table'"
      :rows="templates"
      :canUpdate="canUpdateTemplate"
      :canClone="canCreateTemplate"
      @archive="onArchiveTemplate"
      @clone="onCloneTemplate"
    />
    <div v-else class="tw:flex-1 tw:overflow-y-auto">
      <FormTemplatesList
        :templates="templates"
        :canUpdate="canUpdateTemplate"
        :canClone="canCreateTemplate"
        @archive="onArchiveTemplate"
        @clone="onCloneTemplate"
        @share="onShareTemplate"
      />
    </div>

    <FormTemplateCreateTemplate v-model="showCreateDialog" @next="handleTemplateCreated" />
    <ShareFormDialog v-model="showShare" :template="shareTemplate" />
  </div>
</template>
