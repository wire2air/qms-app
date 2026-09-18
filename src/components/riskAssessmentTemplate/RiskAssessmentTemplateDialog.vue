<script setup>
import { IconLayoutGrid, IconPlus, IconX } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  template: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const open = defineModel({ type: Boolean, default: false })

const formRef = ref(null)
const saveError = ref('')

function DEFAULT_CONFIG() {
  return {
    likelihood: [
      { id: crypto.randomUUID(), label: 'Very Likely', order: 5, score: 5 },
      { id: crypto.randomUUID(), label: 'Likely', order: 4, score: 4 },
      { id: crypto.randomUUID(), label: 'Possible', order: 3, score: 3 },
      { id: crypto.randomUUID(), label: 'Unlikely', order: 2, score: 2 },
      { id: crypto.randomUUID(), label: 'Very Unlikely', order: 1, score: 1 },
    ],
    severity: [
      { id: crypto.randomUUID(), label: 'Negligible', order: 1, score: 1 },
      { id: crypto.randomUUID(), label: 'Minor', order: 2, score: 2 },
      { id: crypto.randomUUID(), label: 'Moderate', order: 3, score: 3 },
      { id: crypto.randomUUID(), label: 'Significant', order: 4, score: 4 },
      { id: crypto.randomUUID(), label: 'Severe', order: 5, score: 5 },
    ],
    enableDetectability: false,
    detectability: [
      { id: crypto.randomUUID(), label: 'Almost Impossible', order: 10, score: 10 },
      { id: crypto.randomUUID(), label: 'Remote', order: 9, score: 9 },
      { id: crypto.randomUUID(), label: 'Very Low', order: 8, score: 8 },
      { id: crypto.randomUUID(), label: 'Low', order: 7, score: 7 },
      { id: crypto.randomUUID(), label: 'Moderate', order: 6, score: 6 },
      { id: crypto.randomUUID(), label: 'High', order: 5, score: 5 },
      { id: crypto.randomUUID(), label: 'Very High', order: 4, score: 4 },
      { id: crypto.randomUUID(), label: 'Almost Certain', order: 1, score: 1 },
    ],
    riskLevels: [
      { id: 'low', label: 'Low', bg: '#dcfce7', text: '#166534' },
      { id: 'lowmed', label: 'Low Med', bg: '#d9f99d', text: '#365314' },
      { id: 'medium', label: 'Medium', bg: '#fef08a', text: '#713f12' },
      { id: 'medhi', label: 'Med Hi', bg: '#fed7aa', text: '#9a3412' },
      { id: 'high', label: 'High', bg: '#fecaca', text: '#991b1b' },
    ],
    cells: {},
  }
}

function buildDefaultCells(likelihood, severity, riskLevels) {
  // Default assignment: score = likelihoodOrder * severityOrder, map to risk levels
  const cells = {}
  const low = riskLevels[0]?.id
  const lowmed = riskLevels[1]?.id
  const medium = riskLevels[2]?.id
  const medhi = riskLevels[3]?.id
  const high = riskLevels[4]?.id
  for (const l of likelihood) {
    for (const s of severity) {
      const score = l.order * s.order
      let level
      if (score <= 4) level = low
      else if (score <= 8) level = lowmed
      else if (score <= 12) level = medium
      else if (score <= 16) level = medhi
      else level = high
      cells[`${l.id}:${s.id}`] = level
    }
  }
  return cells
}

const form = reactive({
  name: '',
  description: '',
  config: DEFAULT_CONFIG(),
})

const isSubmitting = ref(false)
const isEdit = computed(() => !!props.template)

watch(
  () => props.template,
  (t) => {
    if (t) {
      form.name = t.name
      form.description = t.description ?? ''
      form.config = JSON.parse(JSON.stringify(t.config))
    }
  },
  { immediate: true },
)

watch(open, (val) => {
  if (!val) {
    form.name = ''
    form.description = ''
    form.config = DEFAULT_CONFIG()
    saveError.value = ''
  }
})

// Ensure cells are initialized after config loads
watch(
  () => form.config,
  (cfg) => {
    if (!cfg.cells || Object.keys(cfg.cells).length === 0) {
      cfg.cells = buildDefaultCells(cfg.likelihood, cfg.severity, cfg.riskLevels)
    }
  },
  { immediate: true },
)

// ─── Detectability ───────────────────────────────────────────────────────────
function addDetectability() {
  const order = (form.config.detectability.at(-1)?.order ?? 0) + 1
  form.config.detectability.push({ id: crypto.randomUUID(), label: 'New Level', order, score: 1 })
}

function removeDetectability(id) {
  form.config.detectability = form.config.detectability.filter((d) => d.id !== id)
}

// ─── Likelihood rows ─────────────────────────────────────────────────────────
function addLikelihood() {
  const order = (form.config.likelihood.at(-1)?.order ?? 0) + 1
  const row = { id: crypto.randomUUID(), label: 'New Level', order, score: 1 }
  form.config.likelihood.push(row)
  // init cells for the new row
  for (const s of form.config.severity) {
    form.config.cells[`${row.id}:${s.id}`] = form.config.riskLevels[0]?.id ?? ''
  }
}

function removeLikelihood(id) {
  form.config.likelihood = form.config.likelihood.filter((l) => l.id !== id)
  for (const key of Object.keys(form.config.cells)) {
    if (key.startsWith(`${id}:`)) delete form.config.cells[key]
  }
}

// ─── Severity columns ─────────────────────────────────────────────────────────
function addSeverity() {
  const order = (form.config.severity.at(-1)?.order ?? 0) + 1
  const col = { id: crypto.randomUUID(), label: 'New Severity', order, score: 1 }
  form.config.severity.push(col)
  for (const l of form.config.likelihood) {
    form.config.cells[`${l.id}:${col.id}`] = form.config.riskLevels[0]?.id ?? ''
  }
}

function removeSeverity(id) {
  form.config.severity = form.config.severity.filter((s) => s.id !== id)
  for (const key of Object.keys(form.config.cells)) {
    if (key.endsWith(`:${id}`)) delete form.config.cells[key]
  }
}

// ─── Risk levels ──────────────────────────────────────────────────────────────
function addRiskLevel() {
  form.config.riskLevels.push({
    id: crypto.randomUUID(),
    label: 'New Level',
    bg: '#f3f4f6',
    text: '#374151',
  })
}

function removeRiskLevel(id) {
  form.config.riskLevels = form.config.riskLevels.filter((r) => r.id !== id)
  // Replace removed level in cells with first available
  const fallback = form.config.riskLevels[0]?.id ?? ''
  for (const key of Object.keys(form.config.cells)) {
    if (form.config.cells[key] === id) form.config.cells[key] = fallback
  }
}

// ─── Cell assignment ──────────────────────────────────────────────────────────
const cyclingCell = ref(null)

function cellKey(likelihoodId, severityId) {
  return `${likelihoodId}:${severityId}`
}

function cellLevel(likelihoodId, severityId) {
  const key = cellKey(likelihoodId, severityId)
  const levelId = form.config.cells[key]
  return form.config.riskLevels.find((r) => r.id === levelId) ?? null
}

function cycleCell(likelihoodId, severityId) {
  const key = cellKey(likelihoodId, severityId)
  const levels = form.config.riskLevels
  const currentId = form.config.cells[key]
  const idx = levels.findIndex((r) => r.id === currentId)
  const nextIdx = (idx + 1) % levels.length
  form.config.cells[key] = levels[nextIdx].id
  cyclingCell.value = key
  setTimeout(() => {
    cyclingCell.value = null
  }, 200)
}

const createTemplate = useLiveMutation(async (db, data) => {
  const t = db.RiskAssessmentTemplate.create({
    name: data.name,
    description: data.description || null,
    config: data.config,
  })
  await t.save()
  return t
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    if (isEdit.value) {
      props.template.name = form.name
      props.template.description = form.description || null
      props.template.config = JSON.parse(JSON.stringify(form.config))
      await props.template.save()
    } else {
      await createTemplate({ ...form, config: JSON.parse(JSON.stringify(form.config)) })
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
          <IconLayoutGrid class="tw:size-5 tw:text-primary" />
        </div>
        <span>{{ isEdit ? 'Edit Risk Assessment Template' : 'New Risk Assessment Template' }}</span>
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
                placeholder="e.g. Standard Risk Matrix"
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

        <!-- Risk Levels -->
        <div class="tw:flex tw:flex-col tw:gap-3">
          <div class="tw:flex tw:items-center tw:justify-between">
            <div
              class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
            >
              Risk Levels
            </div>
            <button
              class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="addRiskLevel"
            >
              <IconPlus :size="12" /> Add Level
            </button>
          </div>
          <p class="tw:text-xs tw:text-secondary tw:-mt-1">
            Define risk categories. Click cells in the matrix below to assign levels — each click
            cycles to the next level.
          </p>
          <div class="tw:flex tw:flex-wrap tw:gap-2">
            <div
              v-for="level in form.config.riskLevels"
              :key="level.id"
              class="tw:flex tw:items-center tw:gap-2 tw:border tw:border-divider tw:rounded-lg tw:px-3 tw:py-2"
            >
              <input
                type="color"
                :value="level.bg"
                class="tw:w-6 tw:h-6 tw:rounded tw:border-0 tw:cursor-pointer tw:p-0"
                title="Background color"
                @input="level.bg = $event.target.value"
              />
              <BaseTextInput
                :modelValue="level.label"
                size="sm"
                class="tw:w-24"
                placeholder="Label"
                @update:modelValue="(v) => (level.label = v)"
              />
              <button
                class="tw:text-gray-300 tw:hover:text-red-500 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0"
                @click="removeRiskLevel(level.id)"
              >
                <IconX :size="13" />
              </button>
            </div>
          </div>
        </div>

        <!-- Matrix editor -->
        <div class="tw:flex tw:gap-4">
          <!-- Likelihood labels (left side, rows) -->
          <div class="tw:flex tw:flex-col tw:gap-2 tw:shrink-0">
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
              <div
                class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
              >
                Likelihood
              </div>
              <button
                class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="addLikelihood"
              >
                <IconPlus :size="12" /> Add
              </button>
            </div>
            <div
              v-for="row in form.config.likelihood"
              :key="row.id"
              class="tw:flex tw:items-center tw:gap-1.5 tw:h-10"
            >
              <BaseTextInput
                :modelValue="row.label"
                size="sm"
                class="tw:w-28"
                placeholder="Label"
                @update:modelValue="(v) => (row.label = v)"
              />
              <BaseTextInput
                :modelValue="row.score ?? row.order"
                type="number"
                size="sm"
                class="tw:w-14"
                placeholder="Score"
                :min="1"
                :max="10"
                @update:modelValue="(v) => (row.score = Number(v))"
              />
              <button
                class="tw:text-gray-300 tw:hover:text-red-500 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:shrink-0"
                @click="removeLikelihood(row.id)"
              >
                <IconX :size="13" />
              </button>
            </div>
          </div>

          <!-- Matrix grid -->
          <div class="tw:flex tw:flex-col tw:gap-0 tw:overflow-x-auto">
            <!-- Severity column headers -->
            <div class="tw:flex tw:items-center tw:gap-0 tw:mb-1">
              <div
                v-for="col in form.config.severity"
                :key="col.id"
                class="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:w-20 tw:shrink-0"
              >
                <button
                  class="tw:text-gray-300 tw:hover:text-red-500 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0"
                  @click="removeSeverity(col.id)"
                >
                  <IconX :size="12" />
                </button>
                <BaseTextInput
                  :modelValue="col.label"
                  size="sm"
                  class="tw:w-20 tw:text-center"
                  placeholder="Label"
                  @update:modelValue="(v) => (col.label = v)"
                />
                <BaseTextInput
                  :modelValue="col.score ?? col.order"
                  type="number"
                  size="sm"
                  class="tw:w-14 tw:text-center"
                  placeholder="Score"
                  :min="1"
                  :max="10"
                  @update:modelValue="(v) => (col.score = Number(v))"
                />
              </div>
              <button
                class="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:w-10 tw:text-primary tw:hover:text-primary/80 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-xs"
                @click="addSeverity"
              >
                <IconPlus :size="14" />
              </button>
            </div>

            <!-- Severity axis label -->
            <div
              class="tw:text-caption tw:text-secondary tw:text-center tw:mb-1 tw:uppercase tw:tracking-wider tw:font-semibold"
            >
              ← Severity →
            </div>

            <!-- Matrix rows -->
            <div v-for="row in form.config.likelihood" :key="row.id" class="tw:flex tw:gap-0">
              <BaseClickableRow
                v-for="col in form.config.severity"
                :key="col.id"
                class="tw:w-20 tw:h-10 tw:shrink-0 tw:flex tw:items-center tw:justify-center tw:text-xs tw:font-semibold tw:border tw:border-white tw:rounded tw:transition-transform tw:select-none tw:hover:scale-105"
                :style="
                  cellLevel(row.id, col.id)
                    ? {
                        backgroundColor: cellLevel(row.id, col.id).bg,
                        color: cellLevel(row.id, col.id).text,
                      }
                    : { backgroundColor: '#f3f4f6', color: '#9ca3af' }
                "
                :class="{ 'tw:scale-105 tw:shadow-md': cyclingCell === cellKey(row.id, col.id) }"
                :aria-label="`Cycle risk level for likelihood ${row.label} and severity ${col.label}`"
                @click="cycleCell(row.id, col.id)"
              >
                {{ cellLevel(row.id, col.id)?.label ?? '—' }}
              </BaseClickableRow>
            </div>
          </div>
        </div>

        <p class="tw:text-xs tw:text-secondary tw:-mt-3">
          Click any cell to cycle through risk levels. Rows = Likelihood (top is highest), Columns =
          Severity (right is highest).
        </p>

        <!-- Detectability (FMEA 3-factor RPN) -->
        <div class="tw:flex tw:flex-col tw:gap-3 tw:border-t tw:border-divider tw:pt-4">
          <div class="tw:flex tw:items-center tw:justify-between">
            <div class="tw:flex tw:flex-col tw:gap-0.5">
              <div
                class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
              >
                Detectability (FMEA 3-factor RPN)
              </div>
              <p class="tw:text-xs tw:text-secondary">
                When enabled, RPN = Likelihood × Severity × Detectability. Lower score = easier to
                detect.
              </p>
            </div>
            <BaseSwitch v-model="form.config.enableDetectability" />
          </div>

          <template v-if="form.config.enableDetectability">
            <div class="tw:flex tw:flex-col tw:gap-2">
              <div class="tw:flex tw:items-center tw:justify-between">
                <div class="tw:text-xs tw:text-secondary">
                  Detection levels (score 10 = hardest to detect, 1 = easiest)
                </div>
                <button
                  class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
                  @click="addDetectability"
                >
                  <IconPlus :size="12" /> Add
                </button>
              </div>
              <div
                v-for="item in form.config.detectability"
                :key="item.id"
                class="tw:flex tw:items-center tw:gap-1.5 tw:h-9"
              >
                <BaseTextInput
                  :modelValue="item.label"
                  size="sm"
                  class="tw:w-40"
                  placeholder="Label"
                  @update:modelValue="(v) => (item.label = v)"
                />
                <BaseTextInput
                  :modelValue="item.score ?? item.order"
                  type="number"
                  size="sm"
                  class="tw:w-14"
                  placeholder="Score"
                  :min="1"
                  :max="10"
                  @update:modelValue="(v) => (item.score = Number(v))"
                />
                <button
                  class="tw:text-gray-300 tw:hover:text-red-500 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:shrink-0"
                  @click="removeDetectability(item.id)"
                >
                  <IconX :size="13" />
                </button>
              </div>
            </div>
          </template>
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
