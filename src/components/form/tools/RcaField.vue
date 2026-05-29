<script setup>
import FishboneAnalysis from './rca/FishboneAnalysis.vue'
import FiveWhyAnalysis from './rca/FiveWhyAnalysis.vue'
import IsNotAnalysis from './rca/IsNotAnalysis.vue'
import WhyTreeAnalysis from './rca/WhyTreeAnalysis.vue'

const props = defineProps({
  modelValue: { type: Object, default: null },
  field: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  formValues: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue'])

const METHODS = [
  { key: 'fishbone', label: 'Fishbone', component: FishboneAnalysis },
  { key: '5why', label: '5 Whys', component: FiveWhyAnalysis },
  { key: 'isnot', label: 'Is / Is Not', component: IsNotAnalysis },
  { key: 'whytree', label: 'Why Tree', component: WhyTreeAnalysis },
]

// Prefer the embedded snapshot — that's what works for supplier users
// (who can't SELECT rca_templates via RLS) and locks the template
// version at workflow-creation time. Fall back to the FK lookup for
// any not-yet-migrated rows. See bootstrapCompanyDefaults.js
// rcaStepSchema for the embedded shape.
const template = useLiveQueryWithDeps(
  [() => props.field.rcaTemplate, () => props.field.rcaTemplateId],
  async (db, [embedded, id]) => {
    if (embedded?.config) return embedded
    if (!id) return null
    return db.RcaTemplate.findByPk(id)
  },
)

const hasChosen = computed(() => !!props.modelValue?._method)
const chosenMethod = computed(() => props.modelValue?._method ?? null)
const currentMethodDef = computed(() => METHODS.find((m) => m.key === chosenMethod.value) ?? null)

// Problem text: prefer linked field value, fall back to inline fishbone problem
const externalProblem = computed(() => {
  const src = props.field.problemField
  if (!src) return ''
  return props.formValues?.[src] ?? ''
})

function buildInitialValue(method) {
  const t = template.value
  const base = {
    _templateId: t.id,
    _method: method,
    fishbone: null,
    '5why': null,
    isnot: null,
    whytree: null,
    outcome: { rootCause: '', completedAt: null },
  }

  const cfg = t.config?.[method] ?? {}

  if (method === 'fishbone') {
    base.fishbone = {
      problem: '',
      branches: (cfg.branches ?? []).map((b) => ({
        id: b.id,
        label: b.label,
        causes: (b.causes ?? []).map((c) => ({
          id: c.id,
          text: c.text,
          selected: false,
          isRootCause: false,
        })),
      })),
    }
  } else if (method === '5why') {
    base['5why'] = {
      problem: '',
      whys: (cfg.whys ?? []).map((w) => ({ id: w.id, prompt: w.prompt, answer: '' })),
    }
  } else if (method === 'isnot') {
    base.isnot = {
      dimensions: (cfg.dimensions ?? []).map((d) => ({ label: d, is: '', isNot: '' })),
      probableCauses: '',
    }
  } else if (method === 'whytree') {
    base.whytree = {
      problem: '',
      nodes: [],
    }
  }

  return base
}

function selectMethod(methodKey) {
  emit('update:modelValue', buildInitialValue(methodKey))
}

function resetMethod() {
  emit('update:modelValue', null)
}

const methodValue = computed(() => {
  if (!props.modelValue || !chosenMethod.value) return null
  return props.modelValue[chosenMethod.value] ?? null
})

// Build a summary of causes from fishbone data for auto-populating root cause
function buildFishboneSummary(fishboneData) {
  const branches = fishboneData?.branches ?? []
  const parts = []
  for (const branch of branches) {
    const causes = (branch.causes ?? []).filter((c) => c.text?.trim())
    if (causes.length) {
      parts.push(`${branch.label}: ${causes.map((c) => c.text.trim()).join(', ')}`)
    }
  }
  return parts.join('; ')
}

function onMethodUpdate(val) {
  const updated = { ...props.modelValue, [chosenMethod.value]: val }

  // Auto-populate root cause from fishbone causes while not yet finalized
  if (chosenMethod.value === 'fishbone' && !props.modelValue?.outcome?.completedAt) {
    const summary = buildFishboneSummary(val)
    if (summary) {
      updated.outcome = { ...(updated.outcome ?? {}), rootCause: summary }
    }
  }

  emit('update:modelValue', updated)
}

function onRootCauseUpdate(rootCause) {
  emit('update:modelValue', {
    ...props.modelValue,
    outcome: { ...props.modelValue?.outcome, rootCause },
  })
}

function onFinalize() {
  emit('update:modelValue', {
    ...props.modelValue,
    outcome: { ...props.modelValue?.outcome, completedAt: new Date().toISOString() },
  })
}

const isCompleted = computed(() => !!props.modelValue?.outcome?.completedAt)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Loading -->
    <div v-if="template === undefined" class="tw:text-sm tw:text-secondary tw:animate-pulse">
      Loading...
    </div>

    <!-- No template configured on the field -->
    <div
      v-else-if="!template"
      class="tw:text-sm tw:text-secondary tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:text-center"
    >
      No RCA template linked to this field. Contact your administrator.
    </div>

    <template v-else>
      <!-- Method picker -->
      <template v-if="!hasChosen">
        <div class="tw:text-sm tw:font-medium tw:text-on-main">
          {{ template.name }} — Select Analysis Method
        </div>
        <p class="tw:text-xs tw:text-secondary tw:-mt-2">
          Choose the root cause analysis approach for this investigation.
        </p>

        <div class="tw:grid tw:grid-cols-2 tw:gap-3">
          <button
            v-for="m in METHODS"
            :key="m.key"
            class="tw:flex tw:flex-col tw:gap-2 tw:text-left tw:border tw:border-divider tw:rounded-xl tw:p-4 tw:transition-all tw:hover:border-primary tw:hover:bg-primary/5 tw:bg-main tw:cursor-pointer tw:disabled:opacity-50"
            :disabled="readonly || disabled"
            @click="selectMethod(m.key)"
          >
            <RcaMethodBadge :method="m.key" />
            <span class="tw:text-sm tw:font-semibold tw:text-on-main">{{ m.label }}</span>
          </button>
        </div>
      </template>

      <!-- Analysis -->
      <template v-else-if="currentMethodDef">
        <div class="tw:flex tw:items-center tw:gap-2">
          <RcaMethodBadge :method="chosenMethod" />
          <span class="tw:text-sm tw:font-semibold tw:text-on-main">{{ currentMethodDef.label }}</span>
          <span class="tw:text-xs tw:text-secondary tw:mx-1">·</span>
          <span class="tw:text-xs tw:text-secondary">{{ template.name }}</span>
          <span v-if="isCompleted" class="tw:text-xs tw:text-green-600 tw:ml-auto">✓ Completed</span>
          <button
            v-else-if="!readonly && !disabled"
            class="tw:ml-auto tw:text-xs tw:text-secondary tw:hover:text-primary tw:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="resetMethod"
          >
            Change method
          </button>
        </div>

        <component
          :is="currentMethodDef.component"
          v-if="methodValue !== null"
          :config="template.config?.[chosenMethod] ?? {}"
          :modelValue="methodValue"
          :readonly="readonly || disabled"
          :problem="externalProblem"
          @update:modelValue="onMethodUpdate"
        />

        <!-- Outcome -->
        <div class="tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3">
          <div class="tw:flex tw:items-center tw:justify-between">
            <div class="tw:text-sm tw:font-semibold tw:text-on-main">Root Cause Conclusion</div>
            <span
              v-if="chosenMethod === 'fishbone' && !isCompleted && !readonly && !disabled"
              class="tw:text-xs tw:text-secondary tw:italic"
            >
              Auto-filled from causes
            </span>
          </div>
          <BaseTextarea
            :modelValue="modelValue?.outcome?.rootCause ?? ''"
            placeholder="Summarize the identified root cause..."
            :rows="3"
            :readonly="readonly || disabled"
            @update:modelValue="onRootCauseUpdate"
          />
          <div v-if="!readonly && !disabled" class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-xs tw:text-secondary">
              {{ isCompleted
                ? `Completed ${new Date(modelValue.outcome.completedAt).toLocaleString()}`
                : 'Mark complete when the analysis is done.' }}
            </span>
            <button
              v-if="!isCompleted"
              class="tw:text-xs tw:bg-primary tw:text-white tw:rounded tw:px-3 tw:py-1.5 tw:hover:bg-primary/90 tw:transition-colors tw:border-0 tw:cursor-pointer"
              @click="onFinalize"
            >
              Finalize Analysis
            </button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
