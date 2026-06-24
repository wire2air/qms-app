<script setup>
import { IconCheck, IconX as IconXCross, IconBuilding } from '@tabler/icons-vue'
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
  siteId: null,
  description: '',
  supervisorUserId: null,
})

const isEdit = computed(() => !!props.id)

// Load existing department if editing
const department = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.Department.findByPk(id)
  },
  { models: ['Department'] },
)

// Code availability check using live query
const codeAvailable = useLiveQueryWithDeps(
  [() => props.id, () => form.value.code],
  async (db, [id, code]) => {
    if (!code || code.trim().length < 2) return true
    const all = await db.Department.where().exec()
    return !all.some((d) => d.code === code && d.id !== id)
  },

  { models: ['Department'], initial: true },
)

// Live "in use" message for the Code field (create mode); enforced on submit
// via codeUnique.
const codeInUseError = computed(() =>
  !isEdit.value && form.value.code && !codeAvailable.value ? 'Code already in use' : '',
)

function codeUnique() {
  return codeAvailable.value || 'Code already in use'
}

// Populate form when department loads in edit mode
watch(
  department,
  (d) => {
    if (d) {
      form.value = {
        name: d.name,
        code: d.code,
        siteId: d.siteId,
        description: d.description || '',
        supervisorUserId: d.supervisorUserId || null,
      }
    }
  },
  { immediate: true },
)

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    form.value = { name: '', code: '', siteId: null, description: '', supervisorUserId: null }
    saveError.value = ''
  }
})

// Auto-suggest code when name changes (create mode only)
const getCodeSuggestion = useLiveMutation(async (db, suggested) => {
  const all = await db.Department.where().exec()
  let code = suggested
  let counter = 1
  while (all.some((d) => d.code === code)) {
    code = `${suggested}-${counter}`
    counter++
  }
  return code
})

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

const createDepartment = useLiveMutation(async (db, data) => {
  const d = db.Department.create(data)
  await d.save()
  return d
})

const getDisplayOrder = useLiveMutation(async (db) => {
  const lastItem = await db.Department.where().orderBy('displayOrder', 'desc').first()
  return (lastItem?.displayOrder || 0) + 1000
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    if (!isEdit.value) {
      const newDept = await createDepartment({
        name: form.value.name,
        code: form.value.code,
        siteId: form.value.siteId,
        description: form.value.description,
        supervisorUserId: form.value.supervisorUserId || null,
        displayOrder: await getDisplayOrder(),
      })
      emit('created', newDept)
    } else {
      department.value.name = form.value.name
      department.value.siteId = form.value.siteId
      department.value.description = form.value.description
      department.value.supervisorUserId = form.value.supervisorUserId || null
      await department.value.save()
      emit('updated', department.value)
    }
    open.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to save department'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" maxWidth="md">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-9 tw:h-9 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconBuilding class="tw:size-5 tw:text-primary" />
        </div>
        <span>{{ isEdit ? 'Edit Department' : 'Create New Department' }}</span>
      </div>
    </template>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <BaseField label="Department Name" required :value="form.name" :rules="[required()]">
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="form.name"
            placeholder="e.g. Quality Assurance"
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
              placeholder="e.g. QA"
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

      <BaseField label="Site" size="sm" required :value="form.siteId" :rules="[required()]">
        <SiteSelectMenu v-model="form.siteId" :required="true" />
      </BaseField>

      <div>
        <label class="tw:text-sm tw:font-medium tw:text-on-main tw:block tw:mb-1">Supervisor</label>
        <UserSelectMenu v-model="form.supervisorUserId" />
        <div class="tw:text-caption tw:text-secondary tw:mt-1">
          Accountable for this department — receives calibration / maintenance escalations for its
          equipment.
        </div>
      </div>

      <BaseTextarea
        v-model="form.description"
        label="Description"
        placeholder="e.g. Quality assurance and testing department"
        :rows="2"
      />
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Update Department' : 'Create Department'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
