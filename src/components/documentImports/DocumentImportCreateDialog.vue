<script setup>
/**
 * Start a bulk import: settings once, then a pile of files.
 *
 * The per-file work happens HERE, in the browser, before the worker is asked
 * for anything:
 *
 *   1. read the page-one header locally (extractHeaderFields) → title,
 *      document number, department name. No AI, no network, works offline.
 *   2. upload the PDF
 *   3. create the item row carrying all of the above
 *
 * Only then is the batch queued. That split is deliberate: parsing in the
 * browser means the worker does pure record creation, so it is fast, it never
 * needs pdfjs server-side, and a retry re-runs nothing but the insert.
 *
 * Files are processed one at a time rather than in parallel — a client
 * migrating 200 documents would otherwise open 200 simultaneous uploads and
 * fall over. Progress is reported per file because on a run that size, "please
 * wait" is not an acceptable answer.
 */
import { IconUpload, IconX, IconFileText, IconAlertTriangle } from '@tabler/icons-vue'
import { extractPdfHeader } from '@/composables/usePdfImport.js'
import { uploadFile } from '@/composables/useFileUpload.js'
import { currentSession } from '@/utils/currentSession.js'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

// `form` is the DATA; `formRef` is the BaseForm COMPONENT. They must be
// separate refs — `ref="form"` would overwrite the data with the instance.
const formRef = ref(null)
function blankForm(user = null) {
  return {
    name: `Import ${new Date().toISOString().slice(0, 10)}`,
    // Seeded from the author here rather than by a watcher. A one-shot
    // `watch(me)` fires when the user record resolves — usually at page load,
    // long before the dialog opens — and the reset below then wiped it, so the
    // SECOND time you opened the dialog Site was silently blank (bug
    // 2026-08-17: a 152-file batch failed every single item on
    // "Document.siteId cannot be null").
    siteId: user?.siteId ?? null,
    departmentId: user?.departmentId ?? null,
    documentTemplateId: null,
    prefix: null,
  }
}

const form = ref(blankForm())
const files = ref([])
const busy = ref(false)
const progress = ref({ current: 0, total: 0, message: '' })
const failures = ref([])

watch(show, (open) => {
  if (!open) return
  form.value = blankForm(me.value)
  files.value = []
  busy.value = false
  progress.value = { current: 0, total: 0, message: '' }
  failures.value = []
})

// Default the site to the author's own, same as the single-document create form.
const me = useLiveQuery(
  async (db) => {
    const id = currentSession.value?.userId
    return id ? db.User.findByPk(id) : null
  },
  { models: ['User'], initial: null },
)
// Only covers the race where the dialog is opened before the user record has
// loaded. Never overwrites a choice already made.
watch(me, (u) => {
  if (!u || !form.value) return
  if (!form.value.siteId && u.siteId) form.value.siteId = u.siteId
  if (!form.value.departmentId && u.departmentId) form.value.departmentId = u.departmentId
})

function pickFiles() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/pdf,.pdf'
  input.multiple = true
  input.onchange = (e) => {
    const picked = Array.from(e.target.files ?? [])

    // The accept attribute is a HINT — "All Files" in the OS picker walks
    // straight past it, and someone selecting a whole migration folder gets
    // .avif images and invoices along with the SOPs (seen 2026-08-17). Filter
    // for real, and say what was dropped rather than silently importing a
    // payment receipt as a controlled document.
    const pdfs = picked.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    const skipped = picked.length - pdfs.length

    // De-dupe by name+size: re-picking the same folder is the obvious mistake,
    // and it would import everything twice.
    const seen = new Set(files.value.map((f) => `${f.name}:${f.size}`))
    let added = 0
    for (const f of pdfs) {
      const key = `${f.name}:${f.size}`
      if (!seen.has(key)) {
        seen.add(key)
        files.value.push(f)
        added += 1
      }
    }

    if (skipped) {
      toast.warning(
        `${skipped} file${skipped !== 1 ? 's were' : ' was'} not a PDF and ${skipped !== 1 ? 'were' : 'was'} skipped.`,
      )
    }
    if (!added && !skipped && picked.length) {
      toast.info('Those files are already in this batch.')
    }
  }
  input.click()
}

function removeFile(i) {
  files.value.splice(i, 1)
}

const createBatch = useLiveMutation(async (db, payload) => {
  const batch = db.DocumentImportBatch.create(payload)
  await batch.save()
  return batch
})

const createItem = useLiveMutation(async (db, payload) => {
  const item = db.DocumentImportItem.create(payload)
  await item.save()
  return item
})

// Site and template are both hard requirements of the document that gets
// created, so block here rather than let the worker fail once per file.
const canSubmit = computed(
  () =>
    !busy.value &&
    files.value.length > 0 &&
    !!form.value?.documentTemplateId &&
    !!form.value?.siteId,
)

async function submit() {
  if (!canSubmit.value) return

  busy.value = true
  failures.value = []
  progress.value = { current: 0, total: files.value.length, message: 'Creating batch…' }

  try {
    const batch = await createBatch({
      name: form.value.name?.trim() || 'Untitled import',
      siteId: form.value.siteId ?? null,
      departmentId: form.value.departmentId ?? null,
      documentTemplateId: form.value.documentTemplateId,
      prefix: form.value.prefix || null,
      statusId: 'DRAFT',
      totalItems: files.value.length,
    })

    let queued = 0
    for (const [i, file] of files.value.entries()) {
      progress.value = { current: i + 1, total: files.value.length, message: file.name }
      try {
        // Local, free, deterministic — and the reason the worker needs no
        // parser. Header failures are not fatal: the file still imports, just
        // titled from its filename.
        let head = null
        try {
          head = await extractPdfHeader(file, { maxPages: 3 })
        } catch {
          head = null
        }

        const { success, asset, error: uploadError } = await uploadFile(file, 'ASSET')
        if (!success || !asset) throw new Error(uploadError || 'Upload failed')

        await createItem({
          batchId: batch.id,
          assetId: asset.id,
          fileName: file.name,
          title: head?.title || file.name.replace(/\.pdf$/i, ''),
          sourceDocumentNumber: head?.documentNumber ?? null,
          departmentName: head?.department ?? null,
          statusId: 'PENDING',
        })
        queued += 1
      } catch (e) {
        // One bad file must not abandon the other 199. Collected and shown so
        // the user knows exactly what did not make it into the batch.
        failures.value.push({ name: file.name, message: e?.message || 'Could not prepare file' })
      }
    }

    if (queued === 0) {
      toast.error('None of the selected files could be prepared — nothing was queued.')
      return
    }

    progress.value = {
      current: files.value.length,
      total: files.value.length,
      message: 'Queueing…',
    }
    await post(`/v1/services/documentImports/${batch.id}/process`)

    toast.success(
      failures.value.length
        ? `${queued} file${queued !== 1 ? 's' : ''} queued — ${failures.value.length} could not be prepared.`
        : `${queued} file${queued !== 1 ? 's' : ''} queued. Documents are being created in the background.`,
    )
    if (!failures.value.length) show.value = false
  } catch (e) {
    toast.error(e?.message || 'Could not start the import')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="New bulk import" size="2xl" persistent showClose>
    <BaseForm ref="formRef" hideFooter @submit="submit">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseCaption>
          Every document in this batch is created as a DRAFT with these settings, tagged
          <strong>import</strong>, with the original PDF attached. Nothing is submitted for
          approval.
        </BaseCaption>

        <BaseField label="Batch name" required :value="form.name" :rules="[required()]">
          <BaseTextInput v-model="form.name" :disabled="busy" />
        </BaseField>

        <BaseFieldRow :columns="2">
          <BaseField
            label="Site"
            required
            :value="form.siteId"
            :rules="[required()]"
            hint="Every imported document is filed against this site."
          >
            <SiteSelectMenu v-model="form.siteId" :required="false" :disabled="busy" />
          </BaseField>
          <BaseField
            label="Department"
            hint="Used when a document's own header doesn't name one we can match exactly."
          >
            <DepartmentSelectMenu v-model="form.departmentId" :required="false" :disabled="busy" />
          </BaseField>
        </BaseFieldRow>

        <BaseFieldRow :columns="2">
          <BaseField
            label="Document Template"
            required
            :value="form.documentTemplateId"
            :rules="[required()]"
            hint="Supplies the approval flow. Must have a published flow, or the batch cannot create anything."
          >
            <DocumentTemplateSelectMenu
              v-model="form.documentTemplateId"
              :required="true"
              :disabled="busy"
            />
          </BaseField>
          <BaseField
            label="Document prefix"
            hint="Numbers are minted when each draft is submitted."
          >
            <BaseTextInput v-model="form.prefix" placeholder="e.g. SOP" :disabled="busy" />
          </BaseField>
        </BaseFieldRow>

        <div class="tw:flex tw:flex-col tw:gap-2">
          <div class="tw:flex tw:items-center tw:justify-between">
            <p class="tw:text-sm tw:font-medium tw:text-on-main">
              Files <span class="tw:text-secondary">({{ files.length }})</span>
            </p>
            <BaseButton variant="outline" size="sm" :disabled="busy" @click="pickFiles">
              <template #icon><IconUpload :size="14" /></template>
              Add PDFs
            </BaseButton>
          </div>

          <div
            v-if="files.length"
            class="tw:max-h-56 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-divider tw:divide-y tw:divide-divider"
          >
            <div
              v-for="(f, i) in files"
              :key="`${f.name}:${f.size}`"
              class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-1.5 tw:text-sm"
            >
              <IconFileText :size="14" class="tw:shrink-0 tw:text-secondary" />
              <span class="tw:truncate tw:flex-1">{{ f.name }}</span>
              <span class="tw:shrink-0 tw:text-xs tw:text-secondary">
                {{ (f.size / 1024 / 1024).toFixed(1) }} MB
              </span>
              <button
                type="button"
                class="tw:shrink-0 tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
                :disabled="busy"
                aria-label="Remove file"
                @click="removeFile(i)"
              >
                <IconX :size="13" />
              </button>
            </div>
          </div>
          <p v-else class="tw:text-xs tw:text-secondary">
            No files chosen yet. Select as many PDFs as you like — they are read locally, then
            uploaded one at a time.
          </p>
        </div>

        <div v-if="busy" class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:flex tw:justify-between tw:text-xs tw:text-secondary">
            <span class="tw:truncate">{{ progress.message }}</span>
            <span v-if="progress.total">{{ progress.current }} / {{ progress.total }}</span>
          </div>
          <div class="tw:h-1.5 tw:w-full tw:overflow-hidden tw:rounded-full tw:bg-main-hover">
            <div
              class="tw:h-full tw:bg-primary tw:transition-all"
              :style="{
                width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
              }"
            />
          </div>
        </div>

        <div
          v-if="failures.length"
          class="tw:flex tw:flex-col tw:gap-1 tw:rounded-lg tw:border tw:border-red-200 tw:bg-red-50 tw:p-3 tw:text-sm tw:text-red-800"
        >
          <div class="tw:flex tw:items-center tw:gap-1.5 tw:font-medium">
            <IconAlertTriangle :size="15" />
            {{ failures.length }} file{{ failures.length !== 1 ? 's' : '' }} could not be prepared
          </div>
          <p v-for="f in failures" :key="f.name" class="tw:text-xs">
            <strong>{{ f.name }}</strong> — {{ f.message }}
          </p>
        </div>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Start import"
        :loading="busy"
        :disabled="!canSubmit"
        @cancel="close"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
