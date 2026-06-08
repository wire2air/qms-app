<script setup>
/**
 * Requirement execution surface — the per-clause work the auditor
 * fills in while the audit is IN_PROGRESS. Reads the frozen
 * requirementSchema off the AuditInstance row (set at generate time)
 * + the existing AuditRequirementResponse rows; lets the auditor set
 * a result + comments per clause.
 *
 * Why we render from `requirementSchema` and NOT `db.AuditRequirement`:
 * the JSONB snapshot is the audit's frozen view of the clauses at
 * generate time. Editing the standard after the audit starts must NOT
 * shift the in-flight audit's questions (drift protection — same
 * pattern as workflow_instance_steps.form_schema).
 *
 * Each row is collapsed by default; clicking expands the description /
 * guidance / expected evidence. The result picker is always visible
 * inline. Saving a result POSTs to /auditInstances/:id/responses
 * (upsert by requirementId); the response model in SyncEngine
 * mirror-fires the live query and the row reflects the result chip
 * within a frame.
 */
import { IconChevronDown, IconChevronRight } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  // Disable when the audit is CLOSED / CANCELLED / REVIEW so the user
  // can browse but not edit.
  readonly: { type: Boolean, default: false },
})

const toast = useToast()

// The frozen clause list. `requirementSchema` is a JSONB array shaped
// by buildRequirementSchema in the BE generator (see
// auditInstanceService.js): { requirementId, parentId, clauseNumber,
// title, description, guidance, expectedEvidence, riskWeight,
// displayOrder }. Sorted on insert; we don't re-sort here.
const clauses = computed(() => props.auditInstance.requirementSchema || [])

// Responses keyed by requirementId for O(1) lookup as the user
// scrolls. Live query so a save flicker reflects immediately.
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
  // OBSERVATION removed as a requirement result — OFI covers it (the auditor's
  // improvement note). OBSERVATION remains a finding TYPE, not a clause result.
  { id: 'OFI', name: 'OFI' },
  { id: 'NA', name: 'N/A' },
]

// Progress widget — % of clauses that have any non-null result.
// CONFORMING + NC + Observation + OFI + NA all count as "responded";
// only a null is "not yet."
const progress = computed(() => {
  const total = clauses.value.length
  if (!total) return { done: 0, total: 0, pct: 0 }
  const done = clauses.value.filter((c) => responsesById.value[c.requirementId]).length
  return { done, total, pct: Math.round((done / total) * 100) }
})

const expanded = reactive({})
function toggle(id) {
  expanded[id] = !expanded[id]
}

// Local comment buffers — typing into the textarea is debounced, but
// the source of truth is the saved response. The local buffer prevents
// the textarea from flickering empty between keystrokes when the live
// query re-fires.
const commentBuffers = reactive({})
function commentValue(requirementId) {
  if (commentBuffers[requirementId] != null) return commentBuffers[requirementId]
  return responsesById.value[requirementId]?.comments ?? ''
}
function setCommentBuffer(requirementId, value) {
  commentBuffers[requirementId] = value
}

const saving = reactive({})
async function saveResponse(clause, { resultId, comments }) {
  if (props.readonly) return
  const requirementId = clause.requirementId
  saving[requirementId] = true
  try {
    await post(`/v1/services/auditInstances/${props.auditInstance.id}/responses`, {
      requirementId,
      resultId,
      comments: comments?.trim() || null,
    })
    delete commentBuffers[requirementId]
  } catch (e) {
    toast.error(e.message || 'Failed to save response')
  } finally {
    saving[requirementId] = false
  }
}

function pickResult(clause, resultId) {
  const existing = responsesById.value[clause.requirementId]
  const comments = commentBuffers[clause.requirementId] ?? existing?.comments ?? ''
  saveResponse(clause, { resultId, comments })
}

const commentDebounce = useDebounceFn(async (clause) => {
  const existing = responsesById.value[clause.requirementId]
  const resultId = existing?.resultId
  // Don't auto-save a comment when there's no result yet — that'd
  // require a result_id in the BE schema and we'd be guessing. The
  // user has to pick a result before comments save.
  if (!resultId) return
  const comments = commentBuffers[clause.requirementId] ?? existing?.comments ?? ''
  await saveResponse(clause, { resultId, comments })
}, 600)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Header — progress widget -->
    <div
      class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:pb-3 tw:border-b tw:border-divider"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <div class="tw:text-sm tw:font-medium">
          {{ progress.done }} / {{ progress.total }} clauses assessed
        </div>
        <div class="tw:w-32 tw:h-2 tw:bg-main-hover tw:rounded-full tw:overflow-hidden">
          <div
            class="tw:h-full tw:bg-primary tw:transition-all"
            :style="{ width: progress.pct + '%' }"
          />
        </div>
        <div class="tw:text-xs tw:text-secondary">{{ progress.pct }}%</div>
      </div>
      <span
        v-if="readonly"
        class="tw:text-[11px] tw:text-secondary tw:italic tw:font-medium"
      >
        Read-only ({{ auditInstance.statusId }})
      </span>
    </div>

    <div
      v-if="!clauses.length"
      class="tw:py-12 tw:text-center tw:text-sm tw:text-secondary tw:italic"
    >
      No clauses on this audit. The standard version had zero requirements at generate time.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
      <div
        v-for="clause in clauses"
        :key="clause.requirementId"
        class="tw:py-3 tw:flex tw:flex-col tw:gap-2"
      >
        <!-- Row header — click to expand / collapse description block -->
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:cursor-pointer"
          @click="toggle(clause.requirementId)"
        >
          <button
            type="button"
            class="tw:mt-0.5 tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
            :title="expanded[clause.requirementId] ? 'Collapse' : 'Expand'"
          >
            <IconChevronDown v-if="expanded[clause.requirementId]" :size="16" />
            <IconChevronRight v-else :size="16" />
          </button>
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:flex tw:items-center tw:gap-2">
              <code class="tw:text-xs tw:font-mono tw:text-secondary">
                {{ clause.clauseNumber }}
              </code>
              <span class="tw:text-sm tw:font-medium">
                {{ clause.title }}{{ clause.question ? `: ${clause.question}` : '' }}
              </span>
              <span
                v-if="clause.riskWeight && clause.riskWeight !== 1"
                class="tw:text-[10px] tw:bg-amber-100 tw:text-amber-700 tw:px-1.5 tw:py-0.5 tw:rounded tw:font-semibold"
                title="Risk weight"
              >
                ×{{ clause.riskWeight }}
              </span>
            </div>
          </div>
          <AuditRequirementResultBadgeById
            v-if="responsesById[clause.requirementId]?.resultId"
            :resultId="responsesById[clause.requirementId].resultId"
          />
        </div>

        <!-- Expanded description / guidance / expected evidence. Frozen
             snapshot, so this is what the auditor actually sees during
             execution regardless of later standard edits. -->
        <div
          v-if="expanded[clause.requirementId]"
          class="tw:ml-7 tw:flex tw:flex-col tw:gap-2 tw:text-sm"
        >
          <div v-if="clause.description">
            <p class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide">
              Description
            </p>
            <p class="tw:text-sm tw:text-on-main tw:whitespace-pre-line">{{ clause.description }}</p>
          </div>
          <div v-if="clause.guidance">
            <p class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide">
              Guidance
            </p>
            <p class="tw:text-sm tw:text-on-main tw:whitespace-pre-line">{{ clause.guidance }}</p>
          </div>
          <div v-if="clause.expectedEvidence">
            <p class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide">
              Expected Evidence
            </p>
            <p class="tw:text-sm tw:text-on-main tw:whitespace-pre-line">
              {{ clause.expectedEvidence }}
            </p>
          </div>
        </div>

        <!-- Result picker + comments. Always visible — the auditor
             flags conformity on every clause as they go. -->
        <div class="tw:ml-7 tw:flex tw:flex-col tw:gap-2">
          <div class="tw:flex tw:flex-wrap tw:gap-1.5">
            <button
              v-for="r in RESULTS"
              :key="r.id"
              type="button"
              class="tw:text-[11px] tw:font-semibold tw:rounded tw:px-2 tw:py-1 tw:cursor-pointer tw:border tw:transition-colors"
              :disabled="readonly || saving[clause.requirementId]"
              :class="
                responsesById[clause.requirementId]?.resultId === r.id
                  ? 'tw:bg-primary tw:text-white tw:border-primary'
                  : 'tw:bg-white tw:text-on-main tw:border-divider tw:hover:border-primary tw:hover:text-primary'
              "
              @click="pickResult(clause, r.id)"
            >
              {{ r.name }}
            </button>
          </div>
          <BaseRichTextEditor
            :modelValue="commentValue(clause.requirementId)"
            :editable="!readonly && !!responsesById[clause.requirementId]?.resultId"
            :placeholder="
              responsesById[clause.requirementId]?.resultId
                ? 'Comments…'
                : 'Pick a result first, then add comments'
            "
            @update:modelValue="(v) => { setCommentBuffer(clause.requirementId, v); commentDebounce(clause) }"
          />

          <!-- Per-response evidence — appears once a result is picked
               (the response row exists, so audit_evidence /
               audit_evidence_links can FK to it). Auditors attach
               proof inline with the answer instead of bouncing to
               the audit-overall card. -->
          <div
            v-if="responsesById[clause.requirementId]?.id"
            class="tw:rounded tw:border tw:border-divider tw:bg-main-hover/30 tw:p-2 tw:mt-1"
          >
            <AuditEvidencePanel
              :auditInstance="auditInstance"
              scope="response"
              :scopeId="responsesById[clause.requirementId].id"
              :readonly="readonly"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
