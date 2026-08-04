<script setup>
import { IconCheck, IconX as IconXCross, IconMapPin } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  id: {
    type: [String, Number],
    default: null,
  },
})

const emit = defineEmits(['created', 'updated'])

const open = defineModel({
  type: Boolean,
  default: false,
})

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')

const form = ref({
  name: '',
  code: '',
  address: '',
  timezone: null,
  // Defaults true: a newly created site is one you intend to use.
  isActive: true,
})

const isEdit = computed(() => !!props.id)

// Load existing site if editing
const site = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.Site.findByPk(id)
  },
  { models: ['Site'] },
)

// Code availability check using live query
const codeAvailable = useLiveQueryWithDeps(
  [() => props.id, () => form.value.code],
  async (db, [id, code]) => {
    if (!code || code.trim().length < 2) return true
    const all = await db.Site.where().exec()
    return !all.some((s) => s.code === code && s.id !== id)
  },

  { models: ['Site'], initial: true },
)

// Live "in use" message for the Code field — shown the moment a taken code is
// typed (create mode). The same condition is enforced on submit via codeUnique.
const codeInUseError = computed(() =>
  !isEdit.value && form.value.code && !codeAvailable.value ? 'Code already in use' : '',
)

// Submit-time rule mirroring the live check so a taken code blocks submit.
function codeUnique() {
  return codeAvailable.value || 'Code already in use'
}

// Name uniqueness (case-insensitive, per company) — backed by the DB
// sites_company_name_unique partial index. Excludes the current row in edit mode.
const nameAvailable = useLiveQueryWithDeps(
  [() => props.id, () => form.value.name],
  async (db, [id, name]) => {
    const n = (name || '').trim().toLowerCase()
    if (!n) return true
    const all = await db.Site.where().exec()
    return !all.some((s) => (s.name || '').trim().toLowerCase() === n && s.id !== id)
  },
  { models: ['Site'], initial: true },
)
const nameInUseError = computed(() =>
  form.value.name && !nameAvailable.value ? 'A site with this name already exists' : '',
)
function nameUnique() {
  return nameAvailable.value || 'A site with this name already exists'
}

// Populate form when site loads in edit mode
watch(
  site,
  (s) => {
    if (s) {
      form.value = {
        name: s.name,
        code: s.code,
        address: s.address,
        timezone: s.timezone,
        // Older rows predate the column; treat a missing value as active
        // rather than silently presenting an existing site as deactivated.
        isActive: s.isActive !== false,
      }
    }
  },
  { immediate: true },
)

const getCodeSuggestion = useLiveMutation(async (db, suggested) => {
  const all = await db.Site.where().exec()

  // Ensure uniqueness
  let code = suggested
  let counter = 1
  while (all.some((s) => s.code === code)) {
    code = `${suggested}-${counter}`
    counter++
  }

  return code
})

// Auto-suggest code when name changes (create mode only)
async function onNameBlur() {
  if (!form.value.name || form.value.code || isEdit.value) return

  const suggested = form.value.name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 10)

  form.value.code = await getCodeSuggestion(suggested)
}

const createSite = useLiveMutation(async (db, newSite) => {
  const created = db.Site.create(newSite)
  await created.save()
  return created
})

const getDisplayOrder = useLiveMutation(async (db) => {
  const lastItem = await db.Site.where().orderBy('displayOrder', 'desc').first()
  return (lastItem?.displayOrder || 0) + 1000
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    if (!isEdit.value) {
      const newSite = await createSite({
        name: form.value.name,
        code: form.value.code,
        address: form.value.address,
        timezone: form.value.timezone,
        isActive: form.value.isActive,
        displayOrder: await getDisplayOrder(),
      })
      // createSite returns undefined when the save failed (useLiveMutation has
      // already surfaced a toast). Keep the dialog open so the user can retry.
      if (!newSite) return
      emit('created', newSite)
    } else {
      site.value.name = form.value.name
      site.value.address = form.value.address
      site.value.timezone = form.value.timezone
      site.value.isActive = form.value.isActive
      await site.value.save()
      emit('updated', site.value)
    }
    open.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to save site'
  } finally {
    isSubmitting.value = false
  }
}

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    form.value = { name: '', code: '', address: '', timezone: null, isActive: true }
    saveError.value = ''
  }
})
</script>

<template>
  <BaseDialog v-model="open" maxWidth="md">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-9 tw:h-9 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconMapPin class="tw:size-5 tw:text-primary" />
        </div>
        <span>{{ isEdit ? 'Edit Site' : 'Create New Site' }}</span>
      </div>
    </template>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <BaseField
        label="Site Name"
        required
        :value="form.name"
        :rules="[required(), nameUnique]"
        :error="nameInUseError"
      >
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="form.name"
            placeholder="e.g. New York Headquarters"
            @blur="onNameBlur"
          />
        </template>
      </BaseField>

      <BaseField
        label="Code"
        required
        :value="form.code"
        :rules="[required(), codeUnique]"
        :error="codeInUseError"
      >
        <template #default="field">
          <div class="tw:relative">
            <BaseTextInput
              v-bind="field"
              v-model="form.code"
              placeholder="e.g. NY-HQ"
              :disabled="isEdit"
            />
            <template v-if="!isEdit && form.code">
              <IconCheck
                v-if="codeAvailable"
                class="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:size-4 tw:text-green"
              />
              <IconXCross
                v-else
                class="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:size-4 tw:text-red"
              />
            </template>
          </div>
        </template>
      </BaseField>

      <BaseTextarea
        v-model="form.address"
        label="Address"
        placeholder="e.g. 123 Main St, New York, NY"
        :rows="2"
      />

      <TimezoneDropdown v-model="form.timezone" />

      <!--
        `is_active` shipped as a column with no way to set it, which made the
        rule it governs unreachable AND undiagnosable: sites quietly stopped
        appearing in the user-assignment pickers with nothing in the UI to
        explain why, and no way to undo it short of a direct DB write.

        Deliberately NOT a delete. Deactivating retains every existing
        assignment — a site being wound down must not silently revoke the
        regional manager still closing it out — it only blocks NEW ones. That
        distinction is the whole point of the flag, so the helper text states it.
      -->
      <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
        <div class="tw:min-w-0">
          <BaseLabel dataKey="site.isActive" label="Accepting new user assignments" />
          <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
            Turn this off while a site is winding down. People already assigned keep their
            access; the site just stops being offered for new assignments.
          </p>
        </div>
        <BaseSwitch v-model="form.isActive" label="Accepting new user assignments" />
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Update Site' : 'Create Site'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
