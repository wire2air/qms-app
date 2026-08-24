<script setup>
import FishboneAnalysis from './rca/FishboneAnalysis.vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { canUseAi } from '@/utils/currentSession.js'
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
// Every template the tenant has, so a field the author never bound can still
// resolve one (user report 2026-08-16: adding the field said "no template
// linked" even with exactly one template configured).
const availableTemplates = useLiveQuery((db) => db.RcaTemplate.where().exec(), {
  models: ['RcaTemplate'],
  initial: [],
})

// Most specific first: the id already on this answer, then the one the form
// author bound, then the only template there is. With several and no binding
// we resolve nothing — the template decides which methods are offered, so
// guessing would change what the analyst is asked to do.
const effectiveTemplateId = computed(() => {
  const chosen = props.modelValue?._templateId
  if (chosen) return chosen
  if (props.field.rcaTemplateId) return props.field.rcaTemplateId
  return availableTemplates.value.length === 1 ? availableTemplates.value[0].id : null
})

const template = useLiveQueryWithDeps(
  [() => props.field.rcaTemplate, () => effectiveTemplateId.value],

  async (db, [embedded, id]) => {
    if (embedded?.config) return embedded
    if (!id) return null
    return db.RcaTemplate.findByPk(id)
  },
  { models: ['RcaTemplate'] },
)

// Only offered BEFORE a method is chosen. Templates differ in which methods
// they enable, so swapping mid-analysis would strand the captured fishbone or
// 5-Whys against a template that may not offer it.
const canPickTemplate = computed(
  () =>
    !props.readonly && !props.disabled && !hasChosen.value && availableTemplates.value.length > 1,
)

function setTemplate(id) {
  if (!id || hasChosen.value) return
  emit('update:modelValue', { ...(props.modelValue ?? {}), _templateId: id })
}

const hasChosen = computed(() => !!props.modelValue?._method)
const chosenMethod = computed(() => props.modelValue?._method ?? null)
const currentMethodDef = computed(() => METHODS.find((m) => m.key === chosenMethod.value) ?? null)

// The problem carried in from the parent record (the NC's description, via
// the workflow module's _parent_problem context key). Defaulted rather than
// required: schemas seeded before 2026-08-20 carry no problemField, and
// '_parent_problem' is both the builder's default and what every module
// publishes — so old schemas heal instead of opening blank.
const externalProblem = computed(() => {
  const src = props.field.problemField ?? '_parent_problem'
  // Rich text, kept as authored (user request 2026-08-24): the NC description
  // carries emphasis and inline images, and flattening it here lost both.
  return props.formValues?.[src] ?? ''
})

// ── Shared problem statement ────────────────────────────────────────────────
// ONE problem block for every method, above the tool (2026-08-24). It used to
// live inside each method component, in four slightly different ways — 5-why's
// ignored the record's description entirely — and Is/Is-Not was the only one
// with a "probable causes" box. Shared here, filled from the record, editable,
// and present even when no tool is chosen.
const problemText = computed(() => props.modelValue?.problem ?? externalProblem.value)

/** Tag-stripped, for the fishbone head, the AI payload — anywhere plain. */
const problemPlain = computed(() =>
  String(problemText.value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim(),
)

function updateProblem(val) {
  // The editor echoes setContent() back through onUpdate, and storing that
  // echo would register the record's own text as a USER override — freezing
  // the field at whatever the first programmatic push contained (it froze at
  // the literal first keystroke, "U", when this was found live). An update
  // identical to what is already displayed is an echo, not an edit.
  if ((val ?? '') === (problemText.value ?? '')) return
  const current = props.modelValue ?? {}
  const next = { ...current, problem: val }
  // Mirror into the chosen method's sub-object: readonly views, prints and
  // the share projection all read the problem from the method payload.
  if (current._method && next[current._method]) {
    next[current._method] = { ...next[current._method], problem: val }
  }
  emit('update:modelValue', next)
}

// The record's description keeps moving after the analysis was started, and
// the copy frozen into the method payload at selection time went stale — the
// reported symptom. While the analyst has NOT overridden the statement and the
// analysis is not finalized, follow the record: re-mirror on every change so
// payload, readonly views and the share projection stay current.
watch(externalProblem, (val) => {
  const current = props.modelValue
  if (!current?._method) return
  if (current.problem) return // analyst's own wording wins
  if (current.outcome?.completedAt) return // finalized analyses are history
  if (current[current._method]?.problem === val) return
  emit('update:modelValue', {
    ...current,
    [current._method]: { ...current[current._method], problem: val },
  })
})

function buildInitialValue(method) {
  const t = template.value
  const base = {
    ...(props.modelValue ?? {}),
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
      problem: problemText.value,
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
      problem: problemText.value,
      whys: (cfg.whys ?? []).map((w) => ({ id: w.id, prompt: w.prompt, answer: '' })),
    }
  } else if (method === 'isnot') {
    base.isnot = {
      // Added 2026-08-20 so Is/Is-Not carries a problem statement like the
      // other three methods. Existing analyses simply have no key here and
      // fall back to the inherited value.
      problem: problemText.value,
      dimensions: (cfg.dimensions ?? []).map((d) => ({ label: d, is: '', isNot: '' })),
      probableCauses: '',
    }
  } else if (method === 'whytree') {
    base.whytree = {
      problem: problemText.value,
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

// ─── Outcome (root causes) ────────────────────────────────────────────────────
//
// Multi-row outcome: one is_primary=true row (always present, can't be
// removed) plus zero or more contributing rows. Each row carries a
// category + description; labels + colours are frozen onto the row at
// Finalize time so post-finalize reports are drift-resistant.
//
// Backward-compat: older records stored a single string at
// outcome.rootCause. If that's all we have, synthesize a primary row
// from it so editing continues to work.

const categories = useLiveQuery(
  (db) => db.RootCauseCategory.where().orderBy('displayOrder').exec(),

  { models: ['RootCauseCategory'], initial: [] },
)

const rootCauses = computed(() => {
  const stored = props.modelValue?.outcome?.rootCauses
  if (Array.isArray(stored) && stored.length > 0) return stored
  const legacy = props.modelValue?.outcome?.rootCause
  return [
    {
      description: legacy ?? '',
      isPrimary: true,
      categoryId: null,
      categoryLabel: null,
      categoryColor: null,
    },
  ]
})

function emitRootCauses(nextRows) {
  // Mirror the primary description to outcome.rootCause so the legacy
  // field stays in sync — read-only viewers + older code paths still
  // render the canonical summary without knowing about the array.
  const primary = nextRows.find((r) => r.isPrimary)
  emit('update:modelValue', {
    ...props.modelValue,
    outcome: {
      ...(props.modelValue?.outcome ?? {}),
      rootCauses: nextRows,
      rootCause: primary?.description ?? '',
    },
  })
}

function updateRow(index, patch) {
  const next = rootCauses.value.map((row, i) => (i === index ? { ...row, ...patch } : row))
  emitRootCauses(next)
}

function addContributingRow() {
  emitRootCauses([
    ...rootCauses.value,
    {
      description: '',
      isPrimary: false,
      categoryId: null,
      categoryLabel: null,
      categoryColor: null,
    },
  ])
}

function removeRow(index) {
  // Primary row can't be removed — the outcome has to have one
  // canonical cause. UI hides the delete affordance on it, but guard
  // here too in case it ever gets called.
  if (rootCauses.value[index]?.isPrimary) return
  emitRootCauses(rootCauses.value.filter((_, i) => i !== index))
}

function onMethodUpdate(val) {
  const updated = { ...props.modelValue, [chosenMethod.value]: val }

  // Auto-populate the PRIMARY row's description from the fishbone
  // causes while not yet finalized. Keeps the old "Auto-filled from
  // causes" affordance working in the new multi-row world.
  if (chosenMethod.value === 'fishbone' && !props.modelValue?.outcome?.completedAt) {
    const summary = buildFishboneSummary(val)
    if (summary) {
      const rows = rootCauses.value
      const nextRows = rows.map((row, i) =>
        i === 0 && row.isPrimary ? { ...row, description: summary } : row,
      )
      updated.outcome = {
        ...(updated.outcome ?? {}),
        rootCauses: nextRows,
        rootCause: summary,
      }
    }
  }

  emit('update:modelValue', updated)
}

function categoryById(id) {
  return categories.value.find((c) => c.id === id) ?? null
}

function onFinalize() {
  // Freeze category labels + colours into each row at finalize time
  // so a later rename / soft-delete of the category doesn't reshape
  // historical reports. Skips rows with empty descriptions — they're
  // contributing placeholders the user left blank.
  const methodCode = chosenMethod.value ? String(chosenMethod.value).toUpperCase() : null
  const frozenRows = rootCauses.value
    .filter((r) => r.description?.trim())
    .map((r) => {
      const cat = r.categoryId ? categoryById(r.categoryId) : null
      return {
        description: r.description.trim(),
        isPrimary: !!r.isPrimary,
        categoryId: r.categoryId ?? null,
        categoryLabel: cat?.name ?? null,
        categoryColor: cat?.color ?? null,
        methodUsed: methodCode,
        evidenceUrl: r.evidenceUrl ?? null,
      }
    })

  // Guarantee one primary row in the frozen output — if the user
  // wiped the primary description but kept contributing rows, promote
  // the first contributing row to primary so the BE derivation has
  // someone to flag.
  if (frozenRows.length > 0 && !frozenRows.some((r) => r.isPrimary)) {
    frozenRows[0].isPrimary = true
  }

  const primary = frozenRows.find((r) => r.isPrimary)
  emit('update:modelValue', {
    ...props.modelValue,
    outcome: {
      ...(props.modelValue?.outcome ?? {}),
      rootCauses: frozenRows,
      rootCause: primary?.description ?? '',
      completedAt: new Date().toISOString(),
    },
  })
}

// ── AI: articulate the root cause ───────────────────────────────────────────
// Proposes WORDING for the statement from what the analyst entered — the task
// refuses to invent an analysis, so the button only appears once a method has
// content. The proposal lands in the primary row; the reasoning is shown
// beside it so the analyst judges the argument rather than trusting the box.
const aiBusy = ref(false)
const aiPanel = ref(null)

function aiPayload() {
  const m = props.modelValue?.[chosenMethod.value] ?? {}
  const payload = { method: chosenMethod.value, problem: problemPlain.value || undefined }
  if (chosenMethod.value === '5why') {
    payload.whys = (m.whys ?? [])
      .filter((w) => w.answer?.trim())
      .map((w) => ({ prompt: w.prompt, answer: w.answer }))
  } else if (chosenMethod.value === 'fishbone') {
    payload.causes = (m.branches ?? []).flatMap((b) =>
      (b.causes ?? [])
        .filter((c) => c.text?.trim())
        .map((c) => ({ branch: b.label, text: c.text })),
    )
  } else if (chosenMethod.value === 'isnot') {
    payload.dimensions = (m.dimensions ?? [])
      .filter((d) => d.is?.trim() || d.isNot?.trim())
      .map((d) => ({ label: d.label, is: d.is, isNot: d.isNot }))
  } else if (chosenMethod.value === 'whytree') {
    const flat = []
    const walk = (parentId, depth) => {
      for (const n of (m.nodes ?? []).filter((x) => (x.parentId ?? null) === parentId)) {
        if (n.text?.trim()) flat.push({ text: n.text, depth })
        walk(n.id, depth + 1)
      }
    }
    walk(null, 0)
    payload.nodes = flat
  }
  return payload
}

const aiHasContent = computed(() => {
  const p = aiPayload()
  return (p.whys?.length || p.causes?.length || p.dimensions?.length || p.nodes?.length) > 0
})

async function articulateWithAi() {
  aiBusy.value = true
  aiPanel.value = null
  try {
    const data = await post('/v1/services/ai/rca/articulate', aiPayload(), { showError: true })
    const r = data.result
    if (!r?.rootCause) {
      aiPanel.value = { empty: true, gaps: r?.gaps ?? [] }
      return
    }
    // Proposal only — nothing is written until the analyst clicks Apply
    // (user request 2026-08-24: the statement must be a deliberate act, not a
    // side effect of asking).
    aiPanel.value = { statement: r.rootCause, reasoning: r.reasoning, gaps: r.gaps ?? [] }
  } finally {
    aiBusy.value = false
  }
}

function applyAiStatement() {
  if (!aiPanel.value?.statement) return
  const rows = rootCauses.value.map((row, i) =>
    i === 0 && row.isPrimary ? { ...row, description: `<p>${aiPanel.value.statement}</p>` } : row,
  )
  emitRootCauses(rows)
  aiPanel.value = { ...aiPanel.value, applied: true }
}

const isCompleted = computed(() => !!props.modelValue?.outcome?.completedAt)

// Auto-finalize hook for the workflow step form. WorkflowStepForm
// provides a Set of callbacks invoked on Save Draft / Mark Complete;
// we register ours so the user doesn't have to remember to click
// Finalize Analysis separately. Skipped when there's nothing to
// finalize, already finalized, or the field is read-only — so the
// hook is safe on every save tick.
const formFinalizers = inject('formFinalizers', null)
function autoFinalize() {
  if (props.readonly || props.disabled) return
  if (isCompleted.value) return
  if (!rootCauses.value.some((r) => r.description?.trim())) return
  onFinalize()
}
onMounted(() => {
  formFinalizers?.add(autoFinalize)
})
onBeforeUnmount(() => {
  formFinalizers?.delete(autoFinalize)
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Loading -->
    <div v-if="template === undefined" class="tw:text-sm tw:text-secondary tw:animate-pulse">
      Loading...
    </div>

    <template v-else>
      <!-- Problem statement — shared by every method, filled from the parent
           record, editable, and present even when no tool is chosen. -->
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label
          class="tw:text-caption tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
        >
          Problem Statement
        </label>
        <!-- Rich text (user request 2026-08-24): the statement arrives from
             the NC description with emphasis and inline images intact. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          v-if="readonly || disabled || isCompleted"
          class="tw:text-sm tw:text-on-main"
          v-html="problemText"
        />
        <BaseRichTextEditor
          v-else
          :modelValue="problemText"
          placeholder="Describe what happened…"
          @update:modelValue="updateProblem"
        />
        <BaseCaption v-if="!modelValue?.problem && externalProblem">
          Carried from the record — edit to override.
        </BaseCaption>
      </div>
    </template>

    <!-- No template configured on the field -->
    <div
      v-if="template !== undefined && !template"
      class="tw:text-sm tw:text-secondary tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:text-center"
    >
      <template v-if="availableTemplates.length">
        Pick the RCA template to analyse with.
        <RcaTemplateSelectMenu
          v-if="!readonly && !disabled"
          :modelValue="null"
          :required="true"
          class="tw:mt-2 tw:min-w-56"
          @update:modelValue="setTemplate"
        />
      </template>
      <template v-else> No RCA template exists yet. Ask an administrator to create one. </template>
    </div>

    <!-- Tool area — only once a template EXISTS. `v-else` here would also
         catch the loading tick, rendering the picker with template=undefined
         and throwing on template.name (found live, 2026-08-24). -->
    <template v-else-if="template">
      <!-- Method picker -->
      <template v-if="!hasChosen">
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <div class="tw:text-sm tw:font-medium tw:text-on-main">
            {{ template.name }} — Select Analysis Method
          </div>
          <RcaTemplateSelectMenu
            v-if="canPickTemplate"
            :modelValue="template.id"
            :required="true"
            class="tw:min-w-48"
            @update:modelValue="setTemplate"
          />
        </div>
        <p class="tw:text-xs tw:text-secondary tw:-mt-2">
          Choose the root cause analysis approach for this investigation.
        </p>

        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
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
          <span class="tw:text-sm tw:font-semibold tw:text-on-main">{{
            currentMethodDef.label
          }}</span>
          <span class="tw:text-xs tw:text-secondary tw:mx-1">·</span>
          <span class="tw:text-xs tw:text-secondary">{{ template.name }}</span>
          <span v-if="isCompleted" class="tw:text-xs tw:text-green-600 tw:ml-auto"
            >✓ Completed</span
          >
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
          :problem="problemPlain"
          @update:modelValue="onMethodUpdate"
        />

      </template>
    </template>

    <!-- Root Causes — OUTSIDE the tool (2026-08-24): an analyst who wants no
         method still records causes here, manually. -->
    <template v-if="template !== undefined">
      <div class="tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3">
        <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
          <BaseText as="h4" weight="semibold">Root Causes</BaseText>
          <span
            v-if="chosenMethod === 'fishbone' && !isCompleted && !readonly && !disabled"
            class="tw:text-xs tw:text-secondary tw:italic tw:mr-auto"
          >
            Primary auto-filled from causes
          </span>
          <!-- Wording help, not analysis: disabled until the method has
               content, because the task refuses to invent a conclusion. -->
          <BaseButton
            v-if="canUseAi && hasChosen && !isCompleted && !readonly && !disabled"
            variant="outline"
            size="sm"
            :isLoading="aiBusy"
            :disabled="!aiHasContent"
            :title="
              aiHasContent ? 'Propose wording from the analysis' : 'Fill in the analysis first'
            "
            @click="articulateWithAi"
          >
            ✨ Articulate with AI
          </BaseButton>
        </div>

        <div
          v-if="aiPanel"
          class="tw:rounded-md tw:border tw:border-primary/30 tw:bg-primary/5 tw:p-3 tw:flex tw:flex-col tw:gap-1.5"
        >
          <div class="tw:flex tw:items-center tw:justify-between">
            <BaseText class="tw:text-xs tw:font-semibold">AI reasoning</BaseText>
            <button
              class="tw:text-xs tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="aiPanel = null"
            >
              ✕
            </button>
          </div>
          <BaseText v-if="aiPanel.empty" class="tw:text-xs tw:text-secondary">
            The analysis has too little in it to support a statement yet.
          </BaseText>
          <template v-else>
            <BaseText class="tw:text-sm tw:font-medium tw:text-on-main">
              “{{ aiPanel.statement }}”
            </BaseText>
            <BaseText class="tw:text-xs">{{ aiPanel.reasoning }}</BaseText>
          </template>
          <ul v-if="aiPanel.gaps?.length" class="tw:m-0 tw:pl-4 tw:text-xs tw:text-amber-700">
            <li v-for="(g, i) in aiPanel.gaps" :key="i">{{ g }}</li>
          </ul>
          <div v-if="aiPanel.statement" class="tw:flex tw:items-center tw:gap-2 tw:pt-1">
            <BaseButton size="sm" :disabled="aiPanel.applied" @click="applyAiStatement">
              {{ aiPanel.applied ? 'Applied' : 'Apply to primary root cause' }}
            </BaseButton>
            <BaseText v-if="aiPanel.applied" color="secondary" class="tw:text-xs">
              Edit it freely — it is your statement now.
            </BaseText>
          </div>
        </div>

        <!-- Multi-row outcome. Row 0 is always primary (one canonical
             cause per analysis); contributing rows can be added /
             removed freely. -->
        <div
          v-for="(row, idx) in rootCauses"
          :key="idx"
          class="tw:border tw:border-divider tw:rounded-md tw:p-3 tw:flex tw:flex-col tw:gap-2"
          :class="row.isPrimary ? 'tw:bg-primary/5' : 'tw:bg-main-hover/40'"
        >
        <div class="tw:flex tw:items-center tw:gap-2">
          <span
              class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:px-2 tw:py-0.5 tw:rounded"
              :class="
                row.isPrimary ? 'tw:bg-primary tw:text-white' : 'tw:bg-divider tw:text-secondary'
              "
            >
              {{ row.isPrimary ? 'Primary' : 'Contributing' }}
          </span>
          <div class="tw:flex-1 tw:min-w-0">
            <!-- Edit view: live picker via SelectMenu. After finalize,
                 the row's frozen categoryLabel is what the readonly
                 view reads — but we keep the live picker so the user
                 can still change the live category before the next
                 finalize. -->
            <RootCauseCategorySelectMenu
                v-if="!readonly && !disabled && !isCompleted"
                :modelValue="row.categoryId"
                @update:modelValue="(v) => updateRow(idx, { categoryId: v })"
              />
            <RootCauseCategoryBadgeById
                v-else-if="row.categoryId"
                :categoryId="row.categoryId"
              />
            <span v-else class="tw:text-xs tw:text-secondary tw:italic"> No category </span>
          </div>
          <button
              v-if="!row.isPrimary && !readonly && !disabled && !isCompleted"
              class="tw:text-xs tw:text-secondary tw:hover:text-red-600 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:px-2 tw:py-1"
              title="Remove contributing cause"
              @click="removeRow(idx)"
            >
              ✕
          </button>
        </div>
        <!-- Rich text since 2026-08-24 (user request): a root-cause statement
             carries emphasis and lists. Readonly renders the HTML directly. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          v-if="readonly || disabled || isCompleted"
          class="tw:text-sm tw:text-on-main"
          v-html="row.description"
        />
        <BaseRichTextEditor
          v-else
          :modelValue="row.description"
          :placeholder="
            row.isPrimary
              ? 'Articulate the primary root cause…'
              : 'Describe a contributing factor…'
          "
          @update:modelValue="(v) => updateRow(idx, { description: v })"
        />
        </div>

        <button
          v-if="!readonly && !disabled && !isCompleted"
          class="tw:self-start tw:text-xs tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:px-0"
          @click="addContributingRow"
        >
          + Add contributing cause
        </button>

        <div
          v-if="!readonly && !disabled"
          class="tw:flex tw:items-center tw:justify-between tw:pt-2 tw:border-t tw:border-divider"
        >
        <span class="tw:text-xs tw:text-secondary">
            {{
              isCompleted
                ? `Completed ${new Date(modelValue.outcome.completedAt).toLocaleString()}`
                : 'Mark complete when the analysis is done.'
            }}
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

  </div>
</template>
