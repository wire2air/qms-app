<script setup>
import { IconForms, IconPlus } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
// Complaint forms are admin/public-intake config, not a synced model.
import { get, put, del } from '@/api'

/**
 * Channel Forms admin (Complaint Settings → Forms). Each form is a
 * public intake page at /support/<slug> combining system fields with an
 * optional attached dynamic form template.
 */
const toast = useToast()

const loading = ref(true)
const loadError = ref(null)
const forms = ref([])

function applySettings(data) {
  forms.value = data.forms ?? []
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    applySettings(await get('/v1/services/customerComplaints/forms'))
  } catch (e) {
    loadError.value = e.message || 'Failed to load forms'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const showEditDialog = ref(false)
const editingForm = ref(null)

function onCreate() {
  editingForm.value = null
  showEditDialog.value = true
}

function onEdit(form) {
  editingForm.value = form
  showEditDialog.value = true
}

function onSaved(response) {
  applySettings(response)
}

async function onSetState(form, stateId) {
  try {
    applySettings(await put(`/v1/services/customerComplaints/forms/${form.id}`, { stateId }))
    toast.notify({
      type: 'positive',
      message: stateId === 'ACTIVE' ? `${form.name} enabled` : `${form.name} disabled`,
    })
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Action failed' })
  }
}

const deleteTarget = ref(null)
const deleting = ref(false)

async function handleDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try {
    applySettings(await del(`/v1/services/customerComplaints/forms/${deleteTarget.value.id}`))
    deleteTarget.value = null
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to delete form' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PageSection title="Complaint Forms" :icon="IconForms" variant="card">
    <template #actions>
      <BaseButton variant="primary" size="sm" @click="onCreate">
        <IconPlus :size="16" class="tw:mr-1" />
        New form
      </BaseButton>
    </template>

    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      Public intake forms your customers fill without logging in — each gets a unique URL you can
      share or embed. A form always collects the system fields (subject, description, contact
      details you enable); attach a dynamic form template to collect custom attributes like product,
      serial number or region. Submissions become complaint tickets with source
      <strong>Web Form</strong>.
    </p>

    <div v-if="loading" class="tw:text-sm tw:text-secondary">Loading…</div>
    <div v-else-if="loadError" class="tw:text-sm tw:text-red-600">{{ loadError }}</div>
    <div v-else-if="!forms.length" class="tw:text-sm tw:text-secondary tw:italic">
      No forms yet — create your first public complaint form.
    </div>

    <ComplaintFormsTable
      v-else
      :forms="forms"
      @edit="onEdit"
      @setState="onSetState"
      @delete="(row) => (deleteTarget = row)"
    />

    <ComplaintFormEditDialog v-model="showEditDialog" :form="editingForm" @saved="onSaved" />

    <BaseDialog
      :modelValue="!!deleteTarget"
      title="Delete Form"
      maxWidth="md"
      @update:modelValue="(v) => !v && (deleteTarget = null)"
    >
      <p class="tw:text-sm tw:text-on-main tw:p-1">
        Delete <strong>{{ deleteTarget?.name }}</strong
        >? Its public URL stops working immediately. Existing tickets created through it keep their
        data and reporting reference.
      </p>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Delete"
          submitVariant="danger"
          :loading="deleting"
          @cancel="close"
          @submit="handleDelete"
        />
      </template>
    </BaseDialog>
  </PageSection>
</template>
