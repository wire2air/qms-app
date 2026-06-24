<script setup>
import { IconSitemap } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  template: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const open = defineModel({ type: Boolean, default: false })

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref(null)
const isEdit = computed(() => !!props.template)

const DEFAULT_CONFIG = () => ({
  fishbone: {
    branches: [
      { id: crypto.randomUUID(), label: 'People', causes: [] },
      { id: crypto.randomUUID(), label: 'Machine', causes: [] },
      { id: crypto.randomUUID(), label: 'Method', causes: [] },
      { id: crypto.randomUUID(), label: 'Material', causes: [] },
      { id: crypto.randomUUID(), label: 'Measurement', causes: [] },
      { id: crypto.randomUUID(), label: 'Environment', causes: [] },
    ],
  },
  '5why': {
    problemPrompt: 'Describe what happened',
    whys: [
      { id: crypto.randomUUID(), prompt: 'Why did this occur?' },
      { id: crypto.randomUUID(), prompt: 'Why did that happen?' },
      { id: crypto.randomUUID(), prompt: 'Why?' },
      { id: crypto.randomUUID(), prompt: 'Why?' },
      { id: crypto.randomUUID(), prompt: 'What is the root cause?' },
    ],
  },
  isnot: {
    dimensions: ['What', 'Where', 'When', 'Who', 'How Much / How Many'],
  },
  whytree: {
    problemPrompt: 'Describe what happened',
  },
})

const form = reactive({
  name: '',
  description: '',
  config: DEFAULT_CONFIG(),
})

const TABS = [
  { value: 'fishbone', label: 'Fishbone' },
  { value: '5why', label: '5 Whys' },
  { value: 'isnot', label: 'Is / Is Not' },
  { value: 'whytree', label: 'Why Tree' },
]
const activeTab = ref('fishbone')

watch(
  () => props.template,
  (t) => {
    if (t) {
      form.name = t.name
      form.description = t.description ?? ''
      // Merge saved config with defaults so new methods always have a structure
      const defaults = DEFAULT_CONFIG()
      form.config = {
        fishbone: t.config?.fishbone ?? defaults.fishbone,
        '5why': t.config?.['5why'] ?? defaults['5why'],
        isnot: t.config?.isnot ?? defaults.isnot,
        whytree: t.config?.whytree ?? defaults.whytree,
      }
    }
  },
  { immediate: true },
)

watch(open, (val) => {
  if (!val) {
    form.name = ''
    form.description = ''
    form.config = DEFAULT_CONFIG()
    saveError.value = null
  }
})

const createTemplate = useLiveMutation(async (db, data) => {
  const t = db.RcaTemplate.create({
    name: data.name,
    description: data.description || null,
    config: data.config,
  })
  await t.save()
  return t
})

// Two-way adapter between template config (branch labels only) and FishboneAnalysis fill format
const fishboneEditValue = computed({
  get() {
    const cfg = form.config.fishbone
    return {
      problem: '',
      branches: (cfg.branches ?? []).map((b) => ({
        id: b.id,
        label: b.label,
        causes: [],
        userAdded: b.userAdded,
      })),
    }
  },
  set(val) {
    form.config.fishbone = {
      branches: (val.branches ?? []).map((b) => ({
        id: b.id,
        label: b.label,
        causes: [],
        userAdded: b.userAdded,
      })),
    }
  },
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = null
  try {
    if (isEdit.value) {
      props.template.name = form.name
      props.template.description = form.description || null
      props.template.config = form.config
      await props.template.save()
    } else {
      await createTemplate({ ...form })
    }
    open.value = false
    emit('close')
  } catch (err) {
    saveError.value = err?.message || 'Failed to save template'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" maxWidth="2xl" persistent>
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-9 tw:h-9 tw:bg-primary/10 tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconSitemap class="tw:size-5 tw:text-primary" />
        </div>
        <span>{{ isEdit ? 'Edit RCA Template' : 'New RCA Template' }}</span>
      </div>
    </template>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <div class="tw:flex tw:flex-col tw:gap-6">
        <!-- Name + Description -->
        <div class="tw:flex tw:flex-col tw:gap-4">
          <BaseField label="Template Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.name"
                placeholder="e.g. Equipment Failure Analysis"
              />
            </template>
          </BaseField>
          <BaseTextarea
            v-model="form.description"
            label="Description"
            placeholder="Optional — describe when to use this template"
            :rows="2"
          />
        </div>

        <!-- All 4 method configs in tabs -->
        <div class="tw:flex tw:flex-col tw:gap-4">
          <BaseText variant="overline">Configure Methods</BaseText>
          <p class="tw:text-xs tw:text-secondary tw:-mt-3">
            All four methods are always available. Set up the structure for each one — branches
            &amp; causes for Fishbone, prompts for 5 Whys, dimensions for Is/Is Not, and nodes for
            Fault Tree. The end user picks which method to use when filling the form.
          </p>

          <!-- Tab bar -->
          <BaseTabs v-model="activeTab" :tabs="TABS" ariaLabel="Configure RCA methods">
            <div class="tw:mt-6">
              <!-- Fishbone: edit branches directly on the interactive diagram -->
              <BaseTabPanel value="fishbone">
                <FishboneAnalysis
                  v-model="fishboneEditValue"
                  :config="form.config.fishbone"
                  :branchesOnly="true"
                  problem="[Problem Statement]"
                />
              </BaseTabPanel>

              <!-- Other methods: standard config panel -->
              <BaseTabPanel value="5why">
                <div class="tw:max-h-80 tw:overflow-y-auto">
                  <RcaTemplateMethodConfig
                    method="5why"
                    :config="form.config['5why']"
                    @update:config="(v) => (form.config['5why'] = v)"
                  />
                </div>
              </BaseTabPanel>
              <BaseTabPanel value="isnot">
                <div class="tw:max-h-80 tw:overflow-y-auto">
                  <RcaTemplateMethodConfig
                    method="isnot"
                    :config="form.config.isnot"
                    @update:config="(v) => (form.config.isnot = v)"
                  />
                </div>
              </BaseTabPanel>
              <BaseTabPanel value="whytree">
                <div class="tw:max-h-80 tw:overflow-y-auto">
                  <RcaTemplateMethodConfig
                    method="whytree"
                    :config="form.config.whytree"
                    @update:config="(v) => (form.config.whytree = v)"
                  />
                </div>
              </BaseTabPanel>
            </div>
          </BaseTabs>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Save Changes' : 'Create Template'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
