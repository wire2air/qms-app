<script setup>
import { IconCheck, IconX as IconXCross, IconMapPin } from '@tabler/icons-vue'
import { required, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'

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

const form = ref({
  name: '',
  code: '',
  address: '',
  timezone: null,
})

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

const rules = computed(() => ({
  name: { required: helpers.withMessage('Required', required) },
  code: { required: helpers.withMessage('Required', required) },
}))

const validator = useValidator(rules, form)

const isSubmitting = ref(false)
const isEdit = computed(() => !!props.id)

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
  const valid = await validator.value.$validate()
  if (!valid || !codeAvailable.value) return

  isSubmitting.value = true
  try {
    if (!isEdit.value) {
      const newSite = await createSite({
        name: form.value.name,
        code: form.value.code,
        address: form.value.address,
        timezone: form.value.timezone,
        displayOrder: await getDisplayOrder(),
      })
      emit('created', newSite)
    } else {
      site.value.name = form.value.name
      site.value.address = form.value.address
      site.value.timezone = form.value.timezone
      await site.value.save()
      emit('updated', site.value)
    }
    open.value = false
  } finally {
    isSubmitting.value = false
  }
}

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    form.value = { name: '', code: '', address: '', timezone: null }
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
    <div class="tw:flex tw:flex-col tw:gap-4">
      <BaseTextInput
        v-model="form.name"
        name="name"
        label="Site Name"
        placeholder="e.g. New York Headquarters"
        :required="true"
        @blur="onNameBlur"
      />

      <div class="tw:relative">
        <BaseTextInput
          v-model="form.code"
          name="code"
          label="Code"
          placeholder="e.g. NY-HQ"
          :required="true"
          :disabled="isEdit"
          :errorMsg="!codeAvailable ? 'Code already in use' : ''"
        />
        <template v-if="!isEdit && form.code">
          <IconCheck
            v-if="codeAvailable"
            class="tw:absolute tw:right-3 tw:top-9 tw:size-4 tw:text-green"
          />
          <IconXCross v-else class="tw:absolute tw:right-3 tw:top-9 tw:size-4 tw:text-red" />
        </template>
      </div>

      <BaseTextarea
        v-model="form.address"
        label="Address"
        placeholder="e.g. 123 Main St, New York, NY"
        :rows="2"
      />

      <TimezoneDropdown v-model="form.timezone" />
    </div>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Update Site' : 'Create Site'"
        :loading="isSubmitting"
        @cancel="open = false"
        @submit="onSubmit"
      />
    </template>
  </BaseDialog>
</template>
