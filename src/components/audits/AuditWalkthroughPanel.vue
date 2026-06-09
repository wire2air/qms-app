<script setup>
/**
 * Guided audit walkthrough (#23). One requirement per step, with a collapsible
 * clause rail on the left. Each step gives the auditor everything to CONDUCT
 * the assessment — guidance, expected evidence, people/roles to interview, and
 * a question checklist — then capture the result, notes, evidence and who was
 * interviewed.
 *
 * Persistence mirrors the old execution panel: a result must be picked before
 * the response (and its checklist / interviewees / notes) saves. Once a result
 * exists, edits auto-save (debounced).
 */
import { IconChevronDown, IconChevronRight, IconX, IconUser, IconPlus, IconList, IconNotebook, IconGavel } from '@tabler/icons-vue'
import { canUseAi } from '@/utils/currentSession'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
})

const toast = useToast()

// Frozen clause snapshot: { requirementId, parentId, clauseNumber, title,
// questions, peopleToInterview, guidance, expectedEvidence, description, … }.
const clauses = computed(() => props.auditInstance.requirementSchema || [])

const responsesById = useLiveQueryWithDeps(
  [() => props.auditInstance.id],
  async (db, [instanceId]) => {
    if (!instanceId) return {}
    const rows = await db.AuditRequirementResponse.where('auditInstanceId', instanceId).exec()
    return Object.fromEntries(rows.map((r) => [r.requirementId, r]))
  },
  { initial: {} },
)

const RESULTS = [
  { id: 'CONFORMING', name: 'Conforming' },
  { id: 'MINOR_NC', name: 'Minor NC' },
  { id: 'MAJOR_NC', name: 'Major NC' },
  { id: 'OFI', name: 'OFI' },
  { id: 'NA', name: 'N/A' },
]

// ── Clause tree (arbitrary nesting depth via parent_id) ─────────────────────
const ROOT = '__root__'
const childrenByParent = computed(() => {
  const ids = new Set(clauses.value.map((c) => c.requirementId))
  const m = {}
  for (const c of clauses.value) {
    // Dangling/absent parent → treat as a root so nothing is ever dropped.
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : ROOT
    ;(m[key] ??= []).push(c)
  }
  return m
})
// Full depth-first order — EVERY clause is a step (any nesting level).
const orderedSteps = computed(() => {
  const out = []
  const walk = (parentKey, depth) => {
    for (const c of childrenByParent.value[parentKey] ?? []) {
      out.push({ ...c, depth })
      walk(c.requirementId, depth + 1)
    }
  }
  walk(ROOT, 0)
  return out
})

// Rail rows — same DFS but stops descending into collapsed nodes. The node
// itself still shows so it can be expanded again.
const railRows = computed(() => {
  const out = []
  const walk = (parentKey, depth) => {
    for (const c of childrenByParent.value[parentKey] ?? []) {
      const kids = childrenByParent.value[c.requirementId] ?? []
      out.push({ ...c, depth, hasChildren: kids.length > 0 })
      if (kids.length && !collapsed[c.requirementId]) walk(c.requirementId, depth + 1)
    }
  }
  walk(ROOT, 0)
  return out
})

const currentReqId = ref(null)
watch(
  orderedSteps,
  (steps) => {
    if (!steps.length) {
      currentReqId.value = null
    } else if (!steps.some((s) => s.requirementId === currentReqId.value)) {
      currentReqId.value = steps[0].requirementId
    }
  },
  { immediate: true },
)

const currentClause = computed(
  () => clauses.value.find((c) => c.requirementId === currentReqId.value) ?? null,
)
const currentIndex = computed(() =>
  orderedSteps.value.findIndex((s) => s.requirementId === currentReqId.value),
)
const currentResponse = computed(() => responsesById.value[currentReqId.value] ?? null)

// Clause rail visibility — collapsible on every screen size. Defaults open on
// desktop, closed on iPad/phone (where it stacks full-width above the step);
// resetting to the layout default when the breakpoint is crossed.
const isDesktop = useMediaQuery('(min-width: 1024px)')
const railOpen = ref(isDesktop.value)
watch(isDesktop, (d) => {
  railOpen.value = d
})
function goToStep(reqId) {
  currentReqId.value = reqId
  // On a narrow screen the rail overlays the step; close it after picking.
  if (!isDesktop.value) railOpen.value = false
}
function prevStep() {
  if (currentIndex.value > 0) currentReqId.value = orderedSteps.value[currentIndex.value - 1].requirementId
}
function nextStep() {
  if (currentIndex.value < orderedSteps.value.length - 1)
    currentReqId.value = orderedSteps.value[currentIndex.value + 1].requirementId
}

// Rail collapse state (per section). Default expanded.
const collapsed = reactive({})
function toggleSection(id) {
  collapsed[id] = !collapsed[id]
}

const progress = computed(() => {
  // Only leaf clauses (actual requirements) count toward completion — parent /
  // section headers are exempt, matching the close-out gate. Assessed = carries
  // a verdict; in-progress responses (#27) don't count.
  const leaves = clauses.value.filter((c) => !(childrenByParent.value[c.requirementId]?.length))
  const total = leaves.length
  if (!total) return { done: 0, total: 0, pct: 0 }
  const done = leaves.filter((c) => responsesById.value[c.requirementId]?.resultId).length
  return { done, total, pct: Math.round((done / total) * 100) }
})

// ── Per-requirement capture buffers (checklist / interviewees / notes) ──────
// Seeded from the saved response; the source of truth once saved.
const buffers = reactive({})
function ensureBuffer(reqId) {
  if (!reqId) return null
  if (!buffers[reqId]) {
    const r = responsesById.value[reqId]
    buffers[reqId] = {
      questionChecklist: r?.questionChecklist ? { ...r.questionChecklist } : {},
      observationChecklist: r?.observationChecklist ? { ...r.observationChecklist } : {},
      evidenceChecklist: r?.evidenceChecklist ? { ...r.evidenceChecklist } : {},
      peopleInterviewed: Array.isArray(r?.peopleInterviewed) ? [...r.peopleInterviewed] : [],
      comments: r?.comments ?? '',
      auditorNotes: r?.auditorNotes ?? '',
    }
  }
  return buffers[reqId]
}
const currentBuffer = computed(() => ensureBuffer(currentReqId.value))

// Reseed a buffer if the server response arrives/changes and the user hasn't
// started editing it locally.
watch(responsesById, (map) => {
  for (const [reqId, r] of Object.entries(map)) {
    if (!buffers[reqId]) continue
    // Only refresh fields the user hasn't diverged on is hard to track cheaply;
    // keep it simple — leave existing local buffers alone once created.
    void r
  }
})

const saving = reactive({})
// resultId may be null (#27): an in-progress response saves notes / checklists
// / interviewees / evidence before the auditor picks a verdict.
async function saveResponse(reqId, resultId) {
  if (props.readonly || !reqId) return null
  const buf = ensureBuffer(reqId)
  saving[reqId] = true
  try {
    const data = await post(`/v1/services/auditInstances/${props.auditInstance.id}/responses`, {
      requirementId: reqId,
      resultId: resultId ?? null,
      comments: buf.comments?.trim() || null,
      auditorNotes: buf.auditorNotes?.trim() || null,
      questionChecklist: buf.questionChecklist,
      observationChecklist: buf.observationChecklist,
      evidenceChecklist: buf.evidenceChecklist,
      peopleInterviewed: buf.peopleInterviewed,
    })
    return data?.response?.id ?? null
  } catch (e) {
    toast.error(e.message || 'Failed to save')
    return null
  } finally {
    saving[reqId] = false
  }
}

function pickResult(resultId) {
  saveResponse(currentReqId.value, resultId)
}

// Save in-progress capture data, preserving any verdict already chosen (or null).
const debouncedSave = useDebounceFn(() => {
  const reqId = currentReqId.value
  if (!reqId) return
  saveResponse(reqId, responsesById.value[reqId]?.resultId ?? null)
}, 600)

// Materialise the response row right away — the evidence panel needs a saved
// response id to attach uploads/photos to, and we allow that before a verdict.
async function ensureResponse() {
  const reqId = currentReqId.value
  if (!reqId) return null
  if (currentResponse.value?.id) return currentResponse.value.id
  return await saveResponse(reqId, currentResponse.value?.resultId ?? null)
}

// Per-item conformance ratings. Each list has its own vocabulary; severity
// (Major/Minor/OFI) stays the clause-level Result, not a per-item choice.
const QUESTION_STATUSES = [
  { id: 'CONFORM', name: 'Conform', active: 'tw:bg-emerald-600 tw:text-white tw:border-emerald-600' },
  { id: 'NONCONFORM', name: 'Nonconform', active: 'tw:bg-red-600 tw:text-white tw:border-red-600' },
  { id: 'NA', name: 'N/A', active: 'tw:bg-gray-400 tw:text-white tw:border-gray-400' },
]
const OBSERVATION_STATUSES = [
  { id: 'OK', name: 'OK', active: 'tw:bg-emerald-600 tw:text-white tw:border-emerald-600' },
  { id: 'CONCERN', name: 'Concern', active: 'tw:bg-amber-500 tw:text-white tw:border-amber-500' },
  { id: 'NA', name: 'N/A', active: 'tw:bg-gray-400 tw:text-white tw:border-gray-400' },
]
const EVIDENCE_STATUSES = [
  { id: 'PROVIDED', name: 'Provided', active: 'tw:bg-emerald-600 tw:text-white tw:border-emerald-600' },
  { id: 'PARTIAL', name: 'Partial', active: 'tw:bg-amber-500 tw:text-white tw:border-amber-500' },
  { id: 'MISSING', name: 'Missing', active: 'tw:bg-red-600 tw:text-white tw:border-red-600' },
  { id: 'NA', name: 'N/A', active: 'tw:bg-gray-400 tw:text-white tw:border-gray-400' },
]

// Checklists — `field` is questionChecklist | observationChecklist | evidenceChecklist.
// Item shape is now { status, note }; clicking the active status again clears it.
function setChecklistStatus(field, id, status) {
  if (props.readonly) return
  const map = (currentBuffer.value[field] ??= {})
  const item = (map[id] ??= { status: null, note: '' })
  item.status = item.status === status ? null : status
  debouncedSave()
}
function setChecklistNote(field, id, note) {
  const map = (currentBuffer.value[field] ??= {})
  const item = (map[id] ??= { status: null, note: '' })
  item.note = note
  debouncedSave()
}
function checklistState(field, id) {
  return currentBuffer.value?.[field]?.[id] ?? { status: null, note: '' }
}

// Roll-up of the per-item ratings for the current clause — drives the summary
// line + non-binding suggested verdict in the Result panel. Never auto-creates
// a finding; it just tells the auditor what to address.
const clauseSummary = computed(() => {
  const cl = currentClause.value
  const empty = { parts: [], flags: 0, assessed: 0, suggested: null }
  if (!cl) return empty
  const stat = (field, id) => currentBuffer.value?.[field]?.[id]?.status
  let nonconform = 0, missing = 0, partial = 0, concern = 0, assessed = 0
  for (const q of cl.questions || []) {
    const s = stat('questionChecklist', q.id)
    if (s) assessed++
    if (s === 'NONCONFORM') nonconform++
  }
  for (const o of cl.observations || []) {
    const s = stat('observationChecklist', o.id)
    if (s) assessed++
    if (s === 'CONCERN') concern++
  }
  for (const e of cl.evidenceItems || []) {
    const s = stat('evidenceChecklist', e.id)
    if (s) assessed++
    if (s === 'MISSING') missing++
    else if (s === 'PARTIAL') partial++
  }
  const parts = []
  if (nonconform) parts.push(`${nonconform} nonconform`)
  if (missing) parts.push(`${missing} missing`)
  if (partial) parts.push(`${partial} partial`)
  if (concern) parts.push(`${concern} concern${concern > 1 ? 's' : ''}`)
  const flags = nonconform + missing + partial + concern
  let suggested = null
  if (nonconform || missing) suggested = 'NC'
  else if (partial || concern) suggested = 'OFI'
  else if (assessed > 0) suggested = 'CONFORMING'
  return { parts, flags, assessed, suggested }
})
const SUGGESTED_LABEL = {
  NC: 'a nonconformity (pick Minor or Major)',
  OFI: 'an opportunity for improvement (OFI)',
  CONFORMING: 'Conforming',
}

// People interviewed (hybrid)
const pickUserId = ref(null)
const manualName = ref('')
const manualTitle = ref('')
// The picker inputs are draft state for the CURRENT clause only — reset them
// when navigating to another step so a half-entered pick doesn't carry over.
watch(currentReqId, () => {
  pickUserId.value = null
  manualName.value = ''
  manualTitle.value = ''
})
function addUserInterviewee() {
  if (!pickUserId.value) return
  const buf = currentBuffer.value
  if (!buf.peopleInterviewed.some((p) => p.userId === pickUserId.value))
    buf.peopleInterviewed.push({ userId: pickUserId.value })
  pickUserId.value = null
  debouncedSave()
}
function addManualInterviewee() {
  const name = manualName.value.trim()
  if (!name) return
  currentBuffer.value.peopleInterviewed.push({ name, title: manualTitle.value.trim() || null })
  manualName.value = ''
  manualTitle.value = ''
  debouncedSave()
}
function removeInterviewee(idx) {
  currentBuffer.value.peopleInterviewed.splice(idx, 1)
  debouncedSave()
}

function setComments(v) {
  currentBuffer.value.comments = v
  debouncedSave()
}
function setAuditorNotes(v) {
  currentBuffer.value.auditorNotes = v
  debouncedSave()
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Progress header -->
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:pb-3 tw:border-b tw:border-divider">
      <div class="tw:flex tw:items-center tw:gap-3">
        <!-- Clause-list toggle — collapses/expands the rail on every screen. -->
        <BaseButton
          v-if="clauses.length"
          variant="outline"
          size="sm"
          @click="railOpen = !railOpen"
        >
          <template #icon><IconList :size="16" /></template>
          {{ railOpen ? 'Hide clauses' : 'Clauses' }}
        </BaseButton>
        <div class="tw:text-sm tw:font-medium">{{ progress.done }} / {{ progress.total }} assessed</div>
        <div class="tw:w-32 tw:h-2 tw:bg-main-hover tw:rounded-full tw:overflow-hidden">
          <div class="tw:h-full tw:bg-primary tw:transition-all" :style="{ width: progress.pct + '%' }" />
        </div>
        <div class="tw:text-xs tw:text-secondary">{{ progress.pct }}%</div>
      </div>
      <span v-if="readonly" class="tw:text-[11px] tw:text-secondary tw:italic tw:font-medium">
        Read-only ({{ auditInstance.statusId }})
      </span>
    </div>

    <div v-if="!clauses.length" class="tw:py-12 tw:text-center tw:text-sm tw:text-secondary tw:italic">
      No clauses on this audit.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:lg:flex-row tw:gap-4 tw:items-start">
      <!-- ── Left rail: clause tree (arbitrary depth, indented by level).
           Hidden by default below lg; toggled via the "Clauses" button so the
           walkthrough gets full width on iPad/phone. Always shown on lg+. ── -->
      <div
        v-if="railOpen"
        class="tw:w-full tw:lg:w-64 tw:shrink-0 tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden tw:max-h-[70vh] tw:overflow-y-auto"
      >
        <div
          v-for="row in railRows"
          :key="row.requirementId"
          class="tw:flex tw:items-center tw:border-b tw:border-divider tw:last:border-0"
          :style="{ paddingLeft: row.depth * 14 + 'px' }"
        >
          <button
            v-if="row.hasChildren"
            type="button"
            class="tw:p-2 tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
            :title="collapsed[row.requirementId] ? 'Expand' : 'Collapse'"
            @click="toggleSection(row.requirementId)"
          >
            <IconChevronRight v-if="collapsed[row.requirementId]" :size="15" />
            <IconChevronDown v-else :size="15" />
          </button>
          <span v-else class="tw:w-7 tw:shrink-0" />
          <button
            type="button"
            class="tw:flex-1 tw:min-w-0 tw:text-left tw:py-1.5 tw:pr-2 tw:cursor-pointer tw:border-0 tw:flex tw:items-center tw:gap-1.5"
            :class="currentReqId === row.requirementId ? 'tw:bg-primary/10' : 'tw:bg-transparent tw:hover:bg-main-hover'"
            @click="goToStep(row.requirementId)"
          >
            <code class="tw:text-[10px] tw:font-mono tw:text-secondary">{{ row.clauseNumber }}</code>
            <span class="tw:text-xs tw:truncate" :class="row.depth === 0 ? 'tw:font-semibold' : ''">{{ row.title }}</span>
            <span
              v-if="responsesById[row.requirementId]?.resultId"
              class="tw:ml-auto tw:size-1.5 tw:rounded-full tw:bg-emerald-500 tw:shrink-0"
              title="Assessed"
            />
            <span
              v-else-if="responsesById[row.requirementId]"
              class="tw:ml-auto tw:size-1.5 tw:rounded-full tw:bg-amber-400 tw:shrink-0"
              title="In progress — no verdict yet"
            />
          </button>
        </div>
      </div>

      <!-- ── Main: current step ── -->
      <div v-if="currentClause" class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col tw:gap-4">
        <!-- Header + step nav -->
        <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
          <div class="tw:min-w-0">
            <div class="tw:flex tw:items-center tw:gap-2">
              <code class="tw:text-xs tw:font-mono tw:text-secondary">{{ currentClause.clauseNumber }}</code>
              <h3 class="tw:text-base tw:font-semibold tw:text-on-main">{{ currentClause.title }}</h3>
              <span
                v-if="currentClause.riskWeight && currentClause.riskWeight !== 1"
                class="tw:text-[10px] tw:bg-amber-100 tw:text-amber-700 tw:px-1.5 tw:py-0.5 tw:rounded tw:font-semibold"
                title="Risk weight"
              >×{{ currentClause.riskWeight }}</span>
            </div>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
            <span class="tw:text-xs tw:text-secondary">{{ currentIndex + 1 }} / {{ orderedSteps.length }}</span>
            <BaseButton variant="outline" size="sm" :disabled="currentIndex <= 0" @click="prevStep">Prev</BaseButton>
            <BaseButton variant="outline" size="sm" :disabled="currentIndex >= orderedSteps.length - 1" @click="nextStep">Next</BaseButton>
          </div>
        </div>

        <!-- Guidance panels -->
        <div class="tw:grid tw:grid-cols-1 tw:gap-3">
          <div v-if="currentClause.description" class="tw:bg-main-hover/40 tw:rounded tw:p-3">
            <p class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-0.5">Description</p>
            <p class="tw:text-sm tw:text-on-main tw:whitespace-pre-line">{{ currentClause.description }}</p>
          </div>
          <div v-if="currentClause.guidance" class="tw:bg-blue-50 tw:rounded tw:p-3">
            <p class="tw:text-[11px] tw:font-semibold tw:text-blue-700 tw:uppercase tw:tracking-wide tw:mb-0.5">Guidance</p>
            <p class="tw:text-sm tw:text-on-main tw:whitespace-pre-line">{{ currentClause.guidance }}</p>
          </div>
          <!-- Expected Evidence is rendered as the checklist below (#24); the
               legacy free-text block is intentionally not shown to avoid
               duplicating the same content. -->
        </div>

        <!-- People / roles to interview (guidance from the standard) -->
        <div v-if="currentClause.peopleToInterview?.length">
          <p class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1">People / roles to interview</p>
          <div class="tw:flex tw:flex-wrap tw:gap-1.5">
            <span v-for="(role, ri) in currentClause.peopleToInterview" :key="ri" class="tw:text-xs tw:bg-main-hover tw:rounded tw:px-2 tw:py-0.5">{{ role }}</span>
          </div>
        </div>

        <!-- ── Auditor's Notebook (private working area) ──────────────────
             The auditor's own material for forming a judgment — checklists,
             who was interviewed, evidence, photos, voice + free-form notes.
             NOT included in the finding; only the Result + Finding Notes
             (below) are shared. -->
        <div class="tw:border tw:border-slate-200 tw:rounded-lg tw:overflow-hidden tw:bg-slate-50/40">
          <div class="tw:bg-slate-100 tw:px-3 tw:py-2 tw:border-b tw:border-slate-200 tw:flex tw:items-center tw:gap-1.5">
            <IconNotebook :size="14" class="tw:text-slate-600 tw:shrink-0" />
            <p class="tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wide tw:text-slate-600">
              Auditor's Notebook
              <span class="tw:font-normal tw:normal-case tw:text-slate-500">— private, not shared in the finding</span>
            </p>
          </div>
          <div class="tw:p-3 tw:flex tw:flex-col tw:gap-4">
            <!-- Checklists: Questions (ask/confirm), Observations (watch),
                 Expected Evidence (records to collect). Each item: tick + note. -->
            <div
              v-for="cl in [
                { items: currentClause.questions, field: 'questionChecklist', label: 'Questions', statuses: QUESTION_STATUSES },
                { items: currentClause.observations, field: 'observationChecklist', label: 'Observations', statuses: OBSERVATION_STATUSES },
                { items: currentClause.evidenceItems, field: 'evidenceChecklist', label: 'Expected Evidence', statuses: EVIDENCE_STATUSES },
              ]"
              :key="cl.field"
            >
              <template v-if="cl.items?.length">
                <p class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5">{{ cl.label }}</p>
                <div class="tw:flex tw:flex-col tw:gap-2">
                  <div v-for="item in cl.items" :key="item.id" class="tw:flex tw:flex-col tw:gap-1.5 tw:border tw:border-divider tw:rounded tw:p-2 tw:bg-white">
                    <p class="tw:text-sm tw:text-on-main">{{ item.text }}</p>
                    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
                      <button
                        v-for="st in cl.statuses"
                        :key="st.id"
                        type="button"
                        class="tw:text-[10px] tw:font-semibold tw:rounded tw:px-2 tw:py-0.5 tw:border tw:cursor-pointer tw:transition-colors"
                        :disabled="readonly"
                        :class="checklistState(cl.field, item.id).status === st.id ? st.active : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:border-primary tw:hover:text-primary'"
                        @click="setChecklistStatus(cl.field, item.id, st.id)"
                      >{{ st.name }}</button>
                    </div>
                    <BaseTextInput
                      v-if="!readonly"
                      :modelValue="checklistState(cl.field, item.id).note"
                      size="sm"
                      placeholder="Note (optional)"
                      @update:modelValue="(v) => setChecklistNote(cl.field, item.id, v)"
                    />
                    <p v-else-if="checklistState(cl.field, item.id).note" class="tw:text-xs tw:text-secondary tw:italic">{{ checklistState(cl.field, item.id).note }}</p>
                  </div>
                </div>
              </template>
            </div>

            <!-- People interviewed (hybrid) -->
            <div>
              <p class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1">People interviewed</p>
              <div v-if="currentBuffer?.peopleInterviewed?.length" class="tw:flex tw:flex-wrap tw:gap-1.5 tw:mb-2">
                <span
                  v-for="(p, pi) in currentBuffer.peopleInterviewed"
                  :key="pi"
                  class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:bg-main-hover tw:rounded tw:pl-1.5 tw:pr-1 tw:py-0.5"
                >
                  <template v-if="p.userId">
                    <IconUser :size="12" /><UserBadgeById :userId="p.userId" />
                  </template>
                  <template v-else>{{ p.name }}<span v-if="p.title" class="tw:text-secondary"> — {{ p.title }}</span></template>
                  <button
                    v-if="!readonly"
                    type="button"
                    class="tw:text-secondary tw:hover:text-red-600 tw:rounded tw:cursor-pointer tw:bg-transparent tw:border-0"
                    @click="removeInterviewee(pi)"
                  ><IconX :size="12" /></button>
                </span>
              </div>
              <div v-if="!readonly" class="tw:flex tw:flex-col tw:gap-2">
                <!-- Pick an internal/external user -->
                <div class="tw:flex tw:items-center tw:gap-2">
                  <!-- #7 — supplier audits interview supplier users; internal
                       audits interview internal staff. Mirrors the auditee picker. -->
                  <UserSelectMenu
                    v-model="pickUserId"
                    :kind="auditInstance.programTypeId === 'SUPPLIER' ? 'EXTERNAL_SUPPLIER' : 'INTERNAL'"
                    :supplierId="auditInstance.programTypeId === 'SUPPLIER' ? auditInstance.supplierId : null"
                    nullLabel="Select a user…"
                    class="tw:flex-1"
                  />
                  <BaseButton variant="outline" size="sm" :disabled="!pickUserId" @click="addUserInterviewee">Add</BaseButton>
                </div>
                <!-- Or add manually -->
                <div class="tw:flex tw:items-center tw:gap-2">
                  <BaseTextInput v-model="manualName" size="sm" placeholder="Name" class="tw:flex-1" />
                  <BaseTextInput v-model="manualTitle" size="sm" placeholder="Title (optional)" class="tw:flex-1" />
                  <BaseButton variant="outline" size="sm" :disabled="!manualName.trim()" @click="addManualInterviewee">
                    <template #icon><IconPlus :size="14" /></template>
                    Add
                  </BaseButton>
                </div>
              </div>
            </div>

            <!-- Evidence & photos — scoped to this clause's response. Available
                 before a verdict (#27): the first attach materialises the response. -->
            <div>
              <p class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1">Evidence &amp; Photos</p>
              <AuditEvidencePanel
                v-if="currentResponse?.id"
                :auditInstance="auditInstance"
                scope="response"
                :scopeId="currentResponse.id"
                :readonly="readonly"
              />
              <div v-else-if="!readonly" class="tw:flex tw:items-center tw:gap-2">
                <BaseButton variant="outline" size="sm" :loading="saving[currentReqId]" @click="ensureResponse">
                  <template #icon><IconPlus :size="14" /></template>
                  Add evidence / photo
                </BaseButton>
                <span class="tw:text-xs tw:text-secondary tw:italic">Saved against this clause as you capture.</span>
              </div>
              <p v-else class="tw:text-xs tw:text-secondary tw:italic">No evidence captured.</p>
            </div>

            <!-- Voice notes — record spoken notes for this clause (#2). -->
            <div>
              <p class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1">Voice Notes</p>
              <AuditVoiceNotesPanel
                :auditInstance="auditInstance"
                :scopeId="currentResponse?.id ?? null"
                :readonly="readonly"
                :ensureResponse="ensureResponse"
              />
            </div>

            <!-- Auditor Notes — private free-form notebook (dictate-to-text). -->
            <div>
              <p class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1">Auditor Notes</p>
              <BaseRichTextEditor
                :modelValue="currentBuffer?.auditorNotes"
                :editable="!readonly"
                placeholder="Your private working notes for this clause — observations, leads to follow, reminders…"
                class="tw:[&_.ProseMirror]:min-h-24"
                @update:modelValue="setAuditorNotes"
              >
                <template #toolbar-extra="{ append }">
                  <AiVoiceToTextButton v-if="canUseAi" :append="append" />
                </template>
              </BaseRichTextEditor>
            </div>
          </div>
        </div>

        <!-- ── Result → finding (shared). The verdict + Finding Notes become
             the finding / report seen by the auditee/supplier. -->
        <div class="tw:border tw:border-blue-200 tw:rounded-lg tw:overflow-hidden tw:bg-blue-50/30">
          <div class="tw:bg-blue-50 tw:px-3 tw:py-2 tw:border-b tw:border-blue-200 tw:flex tw:items-center tw:gap-1.5">
            <IconGavel :size="14" class="tw:text-blue-700 tw:shrink-0" />
            <p class="tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wide tw:text-blue-700">
              Result &amp; Finding
              <span class="tw:font-normal tw:normal-case tw:text-blue-700/70">— shared in the finding / report</span>
            </p>
          </div>
          <div class="tw:p-3 tw:flex tw:flex-col tw:gap-4">
            <!-- Verdict -->
            <div>
              <p class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5">Result</p>
              <!-- Roll-up of the notebook ratings — what to address + a
                   non-binding suggested verdict. The auditor still decides. -->
              <div
                v-if="clauseSummary.parts.length || clauseSummary.suggested"
                class="tw:mb-2 tw:text-[11px] tw:flex tw:flex-wrap tw:gap-x-2 tw:gap-y-0.5"
              >
                <span v-if="clauseSummary.parts.length" class="tw:text-red-700 tw:font-medium">
                  Flags: {{ clauseSummary.parts.join(' · ') }}
                </span>
                <span v-if="clauseSummary.suggested" class="tw:text-secondary">
                  Suggested: {{ SUGGESTED_LABEL[clauseSummary.suggested] }}
                </span>
              </div>
              <div class="tw:flex tw:flex-wrap tw:gap-1.5">
                <button
                  v-for="r in RESULTS"
                  :key="r.id"
                  type="button"
                  class="tw:text-[11px] tw:font-semibold tw:rounded tw:px-2.5 tw:py-1 tw:cursor-pointer tw:border tw:transition-colors"
                  :disabled="readonly || saving[currentReqId]"
                  :class="currentResponse?.resultId === r.id
                    ? 'tw:bg-primary tw:text-white tw:border-primary'
                    : 'tw:bg-white tw:text-on-main tw:border-divider tw:hover:border-primary tw:hover:text-primary'"
                  @click="pickResult(r.id)"
                >{{ r.name }}</button>
              </div>
              <p v-if="!currentResponse?.resultId" class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
                Work through your notebook above, then pick a result to record the verdict. Everything saves as you go.
              </p>
            </div>

            <!-- Finding Notes — included in the finding / report (shared). For
                 an NC result this seeds the auto-finding description. -->
            <div>
              <p class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1">Finding Notes</p>
              <BaseRichTextEditor
                :modelValue="currentBuffer?.comments"
                :editable="!readonly"
                placeholder="The note that goes into the finding for this clause (shared in reports)…"
                class="tw:[&_.ProseMirror]:min-h-24"
                @update:modelValue="setComments"
              >
                <template #toolbar-extra="{ append }">
                  <AiVoiceToTextButton v-if="canUseAi" :append="append" />
                </template>
              </BaseRichTextEditor>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
