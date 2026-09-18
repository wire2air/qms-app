<script setup>
/**
 * Create an import batch — settings only.
 *
 * Files are added afterwards, inside the batch (user decision 2026-08-17).
 * Splitting it that way means a client can set a batch up, drag files in over
 * several sittings, see what was read off each one, and start when the list
 * looks right — rather than committing to a folder in a single modal and
 * finding out afterwards.
 *
 * The batch is created in DRAFT and does nothing until explicitly started.
 */
import { currentSession } from '@/utils/currentSession.js'
import { required } from '@shared/components/form/validators.js'

// Emitted so the caller can open the new batch straight away — creating an
// empty container and leaving the user on the list would be a dead end.
const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const formRef = ref(null)
const saving = ref(false)

const me = useLiveQuery(
  async (db) => {
    const id = currentSession.value?.userId
    return id ? db.User.findByPk(id) : null
  },
  { models: ['User'], initial: null },
)

function blankForm(user = null) {
  return {
    name: `Import ${new Date().toISOString().slice(0, 10)}`,
    // Seeded here, not by a one-shot watcher — that fires when the user record
    // resolves (usually at page load) and the reset below then wiped it, so
    // every batch after the first silently had no site (bug 2026-08-17).
    siteId: user?.siteId ?? null,
    departmentId: user?.departmentId ?? null,
    documentTemplateId: null,
    prefix: null,
  }
}

const form = ref(blankForm())

watch(show, (open) => {
  if (!open) return
  form.value = blankForm(me.value)
  saving.value = false
})

// Only covers the race where the dialog opens before the user record loads.
// Never overwrites a choice already made.
watch(me, (u) => {
  if (!u || !form.value) return
  if (!form.value.siteId && u.siteId) form.value.siteId = u.siteId
  if (!form.value.departmentId && u.departmentId) form.value.departmentId = u.departmentId
})

const createBatch = useLiveMutation(async (db, payload) => {
  const batch = db.DocumentImportBatch.create(payload)
  await batch.save()
  return batch
})

async function submit() {
  if (saving.value) return
  saving.value = true
  try {
    const batch = await createBatch({
      name: form.value.name?.trim() || 'Untitled import',
      siteId: form.value.siteId,
      departmentId: form.value.departmentId ?? null,
      documentTemplateId: form.value.documentTemplateId,
      prefix: form.value.prefix || null,
      statusId: 'DRAFT',
      totalItems: 0,
    })
    show.value = false
    emit('created', batch.id)
  } catch (e) {
    toast.error(e?.message || 'Could not create the batch')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="New import batch" maxWidth="lg">
    <BaseForm ref="formRef" hideFooter @submit="submit">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseCaption>
          These settings apply to every document in the batch. You'll add files next.
        </BaseCaption>

        <BaseField label="Batch name" required :value="form.name" :rules="[required()]">
          <BaseTextInput v-model="form.name" :disabled="saving" />
        </BaseField>

        <BaseFieldRow :columns="2">
          <!-- Required: Document.siteId is allowNull:false, so a batch without
               one can only ever fail, once per file. -->
          <BaseField
            label="Site"
            required
            :value="form.siteId"
            :rules="[required()]"
            hint="Every imported document is filed against this site."
          >
            <SiteSelectMenu v-model="form.siteId" :required="false" :disabled="saving" />
          </BaseField>
          <BaseField
            label="Department"
            hint="Used when a document's own header doesn't name one we can match exactly."
          >
            <DepartmentSelectMenu
              v-model="form.departmentId"
              :required="false"
              :disabled="saving"
            />
          </BaseField>
        </BaseFieldRow>

        <BaseFieldRow :columns="2">
          <BaseField
            label="Document Template"
            required
            :value="form.documentTemplateId"
            :rules="[required()]"
            hint="Supplies the approval flow. Must have a published flow."
          >
            <DocumentTemplateSelectMenu
              v-model="form.documentTemplateId"
              :required="true"
              :disabled="saving"
            />
          </BaseField>
          <BaseField
            label="Document prefix"
            hint="Numbers are minted when each draft is submitted."
          >
            <BaseTextInput v-model="form.prefix" placeholder="e.g. SOP" :disabled="saving" />
          </BaseField>
        </BaseFieldRow>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Create & add files"
        :loading="saving"
        :disabled="saving"
        @cancel="close"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
