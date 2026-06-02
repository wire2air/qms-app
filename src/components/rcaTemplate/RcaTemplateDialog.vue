<script setup>
import { IconSitemap } from '@tabler/icons-vue'

const props = defineProps({
  template: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const open = defineModel({ type: Boolean, default: false })

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

const isSubmitting = ref(false)
const isEdit = computed(() => !!props.template)
const isValid = computed(() => form.name.trim().length > 0)

const TABS = [
  { key: 'fishbone', label: 'Fishbone' },
  { key: '5why', label: '5 Whys' },
  { key: 'isnot', label: 'Is / Is Not' },
  { key: 'whytree', label: 'Why Tree' },
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
  if (!isValid.value) return
  isSubmitting.value = true
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

    <div class="tw:flex tw:flex-col tw:gap-6">
      <!-- Name + Description -->
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseTextInput
          v-model="form.name"
          label="Template Name"
          placeholder="e.g. Equipment Failure Analysis"
          :required="true"
        />
        <BaseTextarea
          v-model="form.description"
          label="Description"
          placeholder="Optional — describe when to use this template"
          :rows="2"
        />
      </div>

      <!-- All 4 method configs in tabs -->
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
          Configure Methods
        </div>
        <p class="tw:text-xs tw:text-secondary tw:-mt-3">
          All four methods are always available. Set up the structure for each one — branches &amp;
          causes for Fishbone, prompts for 5 Whys, dimensions for Is/Is Not, and nodes for Fault
          Tree. The end user picks which method to use when filling the form.
        </p>

        <!-- Tab bar -->
        <div class="tw:flex tw:border-b tw:border-divider tw:gap-1">
          <button
            v-for="tab in TABS"
            :key="tab.key"
            class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:border-b-2 tw:transition-colors tw:bg-transparent tw:cursor-pointer tw:-mb-px"
            :class="
              activeTab === tab.key
                ? 'tw:border-primary tw:text-primary'
                : 'tw:border-transparent tw:text-secondary tw:hover:text-on-main'
            "
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab content -->
        <div class="tw:pt-2">
          <!-- Fishbone: edit branches directly on the interactive diagram -->
          <FishboneAnalysis
            v-if="activeTab === 'fishbone'"
            v-model="fishboneEditValue"
            :config="form.config.fishbone"
            :branchesOnly="true"
            problem="[Problem Statement]"
          />

          <!-- Other methods: standard config panel -->
          <div v-else class="tw:max-h-80 tw:overflow-y-auto">
            <RcaTemplateMethodConfig
              v-if="activeTab === '5why'"
              method="5why"
              :config="form.config['5why']"
              @update:config="(v) => (form.config['5why'] = v)"
            />
            <RcaTemplateMethodConfig
              v-else-if="activeTab === 'isnot'"
              method="isnot"
              :config="form.config.isnot"
              @update:config="(v) => (form.config.isnot = v)"
            />
            <RcaTemplateMethodConfig
              v-else-if="activeTab === 'whytree'"
              method="whytree"
              :config="form.config.whytree"
              @update:config="(v) => (form.config.whytree = v)"
            />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        class="tw:rounded-lg tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
        @click="open = false"
      >
        Cancel
      </button>
      <button
        class="tw:rounded-lg tw:bg-primary tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-white tw:hover:bg-primary/90 tw:transition-colors tw:disabled:opacity-50"
        :disabled="!isValid || isSubmitting"
        @click="onSubmit"
      >
        {{ isEdit ? 'Save Changes' : 'Create Template' }}
      </button>
    </template>
  </BaseDialog>
</template>
