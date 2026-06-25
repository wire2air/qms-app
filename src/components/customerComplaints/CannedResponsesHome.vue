<script setup>
import { IconMessage2, IconPlus, IconPencil, IconTrash } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'

/**
 * Canned responses admin (Complaint Settings → Canned Responses).
 * Synced entity — CRUD via syncEngine. Placeholders supported in the
 * body: {{customer.name}}, {{ticket.number}}, {{agent.name}} —
 * substituted when the agent inserts the response into a reply.
 */
const toast = useToast()
const { confirm } = useConfirm()

const responses = useLiveQuery(
  async (db) => {
    const rows = await db.ComplaintCannedResponse.where().exec()
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  },

  { models: ['ComplaintCannedResponse'], initial: [] },
)

const showEditDialog = ref(false)
const editing = ref(null)
const draft = ref({ name: '', bodyHtml: '' })
const formRef = ref(null)
const saveError = ref('')
const saving = ref(false)

// Mustache placeholders kept out of the template (Vue would try to
// compile them) — bound via JS strings instead.
const PLACEHOLDERS = ['{{customer.name}}', '{{ticket.number}}', '{{agent.name}}']
const editorPlaceholder = `Hello ${PLACEHOLDERS[0]}, we checked your complaint ${PLACEHOLDERS[1]}…`

function htmlToPlainText(html) {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html')
  return (doc.body.textContent ?? '').trim()
}

function onCreate() {
  editing.value = null
  draft.value = { name: '', bodyHtml: '' }
  saveError.value = ''
  showEditDialog.value = true
}

function onEdit(response) {
  editing.value = response
  draft.value = { name: response.name, bodyHtml: response.bodyHtml || response.body }
  saveError.value = ''
  showEditDialog.value = true
}

const createResponse = useLiveMutation(async (db, payload) => {
  const response = db.ComplaintCannedResponse.create(payload)
  await response.save()
  return response
})

async function onValidSubmit() {
  const body = htmlToPlainText(draft.value.bodyHtml)
  saving.value = true
  saveError.value = ''
  try {
    if (editing.value) {
      editing.value.name = draft.value.name.trim()
      editing.value.body = body
      editing.value.bodyHtml = draft.value.bodyHtml
      await editing.value.save()
    } else {
      await createResponse({
        name: draft.value.name.trim(),
        body,
        bodyHtml: draft.value.bodyHtml,
      })
    }
    showEditDialog.value = false
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

async function handleDelete(response) {
  if (
    !(await confirm({
      title: 'Delete Canned Response',
      message: `Delete "${response.name}"?`,
      okLabel: 'Delete',
      danger: true,
    }))
  )
    return
  try {
    await response.delete()
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to delete' })
  }
}
</script>

<template>
  <PageSection title="Canned Responses" :icon="IconMessage2" variant="card">
    <template #actions>
      <BaseButton variant="primary" size="sm" @click="onCreate">
        <IconPlus :size="16" class="tw:mr-1" />
        New response
      </BaseButton>
    </template>

    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      Saved replies agents insert from the ticket reply box. Use placeholders:
      <code v-for="(ph, i) in PLACEHOLDERS" :key="ph" class="tw:font-mono tw:text-xs"
        >{{ ph }}{{ i < PLACEHOLDERS.length - 1 ? ', ' : '' }}</code
      >
      — substituted at insert time.
    </p>

    <div v-if="responses.length" class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="response in responses"
        :key="response.id"
        class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
      >
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:text-sm tw:font-medium">{{ response.name }}</div>
          <div class="tw:text-xs tw:text-secondary tw:truncate">{{ response.body }}</div>
        </div>
        <button class="tw:text-secondary tw:hover:text-primary" @click="onEdit(response)">
          <IconPencil :size="16" />
        </button>
        <button class="tw:text-secondary tw:hover:text-red-600" @click="handleDelete(response)">
          <IconTrash :size="16" />
        </button>
      </div>
    </div>
    <div v-else class="tw:text-sm tw:text-secondary tw:italic">
      No canned responses yet — create your first saved reply.
    </div>

    <BaseDialog
      v-model="showEditDialog"
      :title="editing ? 'Edit Canned Response' : 'New Canned Response'"
      maxWidth="lg"
    >
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
          <BaseField label="Name" required :value="draft.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="draft.name"
                placeholder="e.g. Refund Response"
              />
            </template>
          </BaseField>
          <BaseField
            label="Content"
            required
            :value="htmlToPlainText(draft.bodyHtml)"
            :rules="[required()]"
          >
            <template #default="field">
              <div class="canned-editor" v-bind="field">
                <BaseRichTextEditor v-model="draft.bodyHtml" :placeholder="editorPlaceholder" />
              </div>
            </template>
          </BaseField>
        </div>
      </BaseForm>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Save"
          :loading="saving"
          :error="saveError"
          @cancel="close"
          @submit="formRef.submit()"
        />
      </template>
    </BaseDialog>
  </PageSection>
</template>

<style scoped>
.canned-editor :deep(.rich-text-editor-content) {
  min-height: 8rem;
  max-height: 16rem;
  overflow-y: auto;
}
</style>
