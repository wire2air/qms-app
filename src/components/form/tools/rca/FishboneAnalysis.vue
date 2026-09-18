<script setup>
import { IconPlus, IconX, IconPencil } from '@tabler/icons-vue'

const props = defineProps({
  config: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
  branchesOnly: { type: Boolean, default: false },
  problem: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

// ── Layout constants ─────────────────────────────────────────────────────────
const CARD_W = 148
const CARD_H = 32
const CARD_GAP = 4
const CARD_TOTAL = CARD_H + CARD_GAP
const LABEL_H = 24
const COL_W = 215
const LEFT_PAD = 12
const PROBLEM_W = 178
const PROBLEM_H = 96
const TOP_PAD = 10
const SPINE_GAP = 22
const ADD_ROW_H = 30

const BRANCH_COLORS = [
  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
  { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
]

const diagramId = Math.random().toString(36).slice(2, 8)
const branches = computed(() => props.modelValue.branches ?? [])
const newCauseText = ref({})
// { branchId, causeId, text } | null
const editingCause = ref(null)

// Auto-focus the edit input when it mounts
const vFocus = { mounted: (el) => el.focus() }

const layout = computed(() => {
  const half = Math.ceil(branches.value.length / 2)
  const nCols = half
  const topBranches = branches.value.slice(0, half)
  const botBranches = branches.value.slice(half)

  const maxTop = Math.max(...topBranches.map((b) => b.causes.length), 0)
  const maxBot = Math.max(...botBranches.map((b) => b.causes.length), 0)

  const addH = props.readonly || props.branchesOnly ? 0 : ADD_ROW_H + 4

  // TOP: causes stack upward, label fixed just above spine → symmetric with bottom
  // topAddY: where the "add cause" input sits for all top branches (bottom of cause area)
  const topAddY = TOP_PAD + maxTop * CARD_TOTAL
  const topLabelY = topAddY + addH + 4
  const topH = topLabelY + LABEL_H + SPINE_GAP

  // BOTTOM: label just below spine, causes grow downward
  const botH = SPINE_GAP + LABEL_H + 4 + maxBot * CARD_TOTAL + addH + TOP_PAD

  const spineY = topH
  const totalH = topH + botH
  const totalW = LEFT_PAD + Math.max(nCols, 1) * COL_W + PROBLEM_W + 10

  const cols = Array.from({ length: Math.max(nCols, 1) }, (_, i) => {
    const topBranch = topBranches[i] ?? null
    const botBranch = botBranches[i] ?? null

    const cardLeft = LEFT_PAD + i * COL_W
    const cardCenterX = cardLeft + CARD_W / 2
    const junctionX = LEFT_PAD + i * COL_W + Math.round(COL_W * 0.72)

    // TOP: causes bottom-aligned to topAddY, label at topLabelY
    const nTopCauses = topBranch?.causes.length ?? 0
    const topCauseBaseY = topAddY - nTopCauses * CARD_TOTAL
    const topDiagStartX = cardCenterX
    const topDiagStartY = topLabelY + LABEL_H / 2 // label center, symmetric with bottom

    // BOTTOM
    const botLabelY = spineY + SPINE_GAP
    const botCausesY = botLabelY + LABEL_H + 4
    const botDiagEndX = cardCenterX
    const botDiagEndY = botLabelY + LABEL_H / 2
    const botAddY = botCausesY + (botBranch?.causes.length ?? 0) * CARD_TOTAL

    return {
      topBranch,
      botBranch,
      cardLeft,
      junctionX,
      topLabelY,
      topCauseBaseY,
      topAddY,
      topDiagStartX,
      topDiagStartY,
      botLabelY,
      botCausesY,
      botDiagEndX,
      botDiagEndY,
      botAddY,
    }
  })

  const spineEndX = LEFT_PAD + Math.max(nCols, 1) * COL_W + 8

  return { totalW, totalH, spineY, spineEndX, cols, nCols }
})

function colorFor(globalIndex) {
  return BRANCH_COLORS[globalIndex % BRANCH_COLORS.length]
}

// ── Mutations ────────────────────────────────────────────────────────────────

function toggleSelected(branchId, causeId) {
  if (props.readonly) return
  if (editingCause.value?.causeId === causeId) return
  const updated = branches.value.map((b) =>
    b.id === branchId
      ? {
          ...b,
          causes: b.causes.map((c) =>
            c.id === causeId
              ? { ...c, selected: !c.selected, isRootCause: c.selected ? false : c.isRootCause }
              : c,
          ),
        }
      : b,
  )
  emit('update:modelValue', { ...props.modelValue, branches: updated })
}

function toggleRootCause(branchId, causeId) {
  if (props.readonly) return
  const updated = branches.value.map((b) =>
    b.id === branchId
      ? {
          ...b,
          causes: b.causes.map((c) =>
            c.id === causeId ? { ...c, isRootCause: !c.isRootCause, selected: true } : c,
          ),
        }
      : b,
  )
  emit('update:modelValue', { ...props.modelValue, branches: updated })
}

function startEditCause(branchId, cause) {
  if (props.readonly) return
  editingCause.value = { branchId, causeId: cause.id, text: cause.text }
}

function saveEditCause() {
  if (!editingCause.value) return
  const { branchId, causeId, text } = editingCause.value
  const trimmed = text.trim()
  if (trimmed) {
    const updated = branches.value.map((b) =>
      b.id === branchId
        ? { ...b, causes: b.causes.map((c) => (c.id === causeId ? { ...c, text: trimmed } : c)) }
        : b,
    )
    emit('update:modelValue', { ...props.modelValue, branches: updated })
  }
  editingCause.value = null
}

function confirmAddCause(branchId) {
  const text = (newCauseText.value[branchId] ?? '').trim()
  if (!text) return
  const updated = branches.value.map((b) =>
    b.id === branchId
      ? {
          ...b,
          causes: [
            ...b.causes,
            { id: crypto.randomUUID(), text, selected: true, isRootCause: false, userAdded: true },
          ],
        }
      : b,
  )
  newCauseText.value = { ...newCauseText.value, [branchId]: '' }
  emit('update:modelValue', { ...props.modelValue, branches: updated })
}

function removeCause(branchId, causeId) {
  if (props.readonly) return
  if (editingCause.value?.causeId === causeId) editingCause.value = null
  const updated = branches.value.map((b) =>
    b.id === branchId ? { ...b, causes: b.causes.filter((c) => c.id !== causeId) } : b,
  )
  emit('update:modelValue', { ...props.modelValue, branches: updated })
}

function addBranch() {
  if (props.readonly) return
  const updated = [
    ...branches.value,
    {
      id: crypto.randomUUID(),
      label: `Branch ${branches.value.length + 1}`,
      causes: [],
      userAdded: true,
    },
  ]
  emit('update:modelValue', { ...props.modelValue, branches: updated })
}

function removeBranch(branchId) {
  if (props.readonly) return
  const updated = branches.value.filter((b) => b.id !== branchId)
  emit('update:modelValue', { ...props.modelValue, branches: updated })
}

function updateBranchLabel(branchId, label) {
  if (props.readonly) return
  const updated = branches.value.map((b) => (b.id === branchId ? { ...b, label } : b))
  emit('update:modelValue', { ...props.modelValue, branches: updated })
}

const problemText = computed(() => props.problem || props.modelValue?.problem || '')


const selectedCount = computed(() =>
  branches.value.reduce((acc, b) => acc + b.causes.filter((c) => c.selected).length, 0),
)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div class="tw:text-xs tw:text-secondary">
      Add causes to each branch. Click a cause to select it, <strong>★</strong> to mark as root
      cause.
    </div>

    <!-- Diagram -->
    <div class="tw:overflow-x-auto tw:rounded-xl tw:border tw:border-divider">
      <div
        class="tw:relative"
        :style="{ width: layout.totalW + 'px', height: layout.totalH + 'px' }"
      >
        <!-- SVG: grid + spine + diagonals -->
        <svg
          class="tw:absolute tw:inset-0 tw:pointer-events-none"
          :viewBox="`0 0 ${layout.totalW} ${layout.totalH}`"
          :width="layout.totalW"
          :height="layout.totalH"
        >
          <defs>
            <pattern
              :id="`fbgrid-${diagramId}`"
              width="18"
              height="18"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.8" fill="#d1d5db" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="#f9fafb" />
          <rect width="100%" height="100%" :fill="`url(#fbgrid-${diagramId})`" />

          <!-- Spine -->
          <line
            x1="0"
            :y1="layout.spineY"
            :x2="layout.spineEndX"
            :y2="layout.spineY"
            stroke="#64748b"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <polygon
            :points="`${layout.spineEndX},${layout.spineY - 7} ${layout.spineEndX + 16},${layout.spineY} ${layout.spineEndX},${layout.spineY + 7}`"
            fill="#64748b"
          />

          <g v-for="(col, i) in layout.cols" :key="i">
            <line
              :x1="col.topDiagStartX"
              :y1="col.topDiagStartY"
              :x2="col.junctionX"
              :y2="layout.spineY"
              stroke="#94a3b8"
              stroke-width="1.5"
            />
            <line
              :x1="col.junctionX"
              :y1="layout.spineY"
              :x2="col.botDiagEndX"
              :y2="col.botDiagEndY"
              stroke="#94a3b8"
              stroke-width="1.5"
            />
            <circle :cx="col.junctionX" :cy="layout.spineY" r="4" fill="#64748b" />
          </g>
        </svg>

        <!-- HTML layer: interactive elements -->
        <div class="tw:absolute tw:inset-0">
          <div v-for="(col, i) in layout.cols" :key="i" class="tw:contents">
            <!-- TOP cause cards (stack above label) -->
            <div
              v-for="(cause, ci) in col.topBranch?.causes ?? []"
              :key="cause.id"
              class="tw:absolute"
              :style="{
                left: col.cardLeft + 'px',
                top: col.topCauseBaseY + ci * CARD_TOTAL + 'px',
                width: CARD_W + 'px',
                height: CARD_H + 'px',
              }"
            >
              <!-- Edit mode -->
              <input
                v-if="editingCause?.causeId === cause.id"
                v-focus
                class="tw:w-full tw:h-full tw:px-2 tw:text-xs tw:border-2 tw:border-blue-400 tw:rounded-md tw:bg-white tw:outline-none"
                :value="editingCause.text"
                @input="editingCause.text = $event.target.value"
                @keyup.enter="saveEditCause"
                @keyup.escape="editingCause = null"
                @blur="saveEditCause"
              />
              <!-- Display mode -->
              <button
                v-else
                class="tw:w-full tw:h-full tw:flex tw:items-center tw:gap-1 tw:px-1.5 tw:rounded-md tw:border tw:text-xs tw:text-left tw:transition-all tw:cursor-pointer tw:group"
                :class="
                  cause.isRootCause
                    ? 'tw:bg-amber-50 tw:border-amber-300 tw:text-amber-900'
                    : cause.selected
                      ? 'tw:bg-blue-50 tw:border-blue-300 tw:text-blue-900'
                      : 'tw:bg-white tw:border-gray-200 tw:text-gray-700 tw:hover:border-blue-300'
                "
                :disabled="readonly"
                @click="toggleSelected(col.topBranch.id, cause.id)"
              >
                <span class="tw:flex-1 tw:truncate tw:font-medium tw:text-caption">{{
                  cause.text
                }}</span>
                <template v-if="!readonly">
                  <span
                    v-if="cause.selected"
                    class="tw:text-base tw:leading-none tw:shrink-0 tw:transition-colors tw:group-hover:opacity-0"
                    :class="
                      cause.isRootCause
                        ? 'tw:text-amber-500'
                        : 'tw:text-gray-300 tw:hover:text-amber-400'
                    "
                    :title="cause.isRootCause ? 'Unmark root cause' : 'Mark as root cause'"
                    @click.stop="toggleRootCause(col.topBranch.id, cause.id)"
                    >★</span
                  >
                  <span
                    class="tw:flex tw:items-center tw:gap-0.5 tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:shrink-0"
                    @click.stop
                  >
                    <span
                      class="tw:text-gray-400 tw:hover:text-blue-500 tw:leading-none tw:cursor-pointer"
                      title="Edit cause"
                      @click="startEditCause(col.topBranch.id, cause)"
                      ><IconPencil :size="11"
                    /></span>
                    <span
                      class="tw:text-gray-400 tw:hover:text-red-500 tw:leading-none tw:cursor-pointer"
                      title="Remove cause"
                      @click="removeCause(col.topBranch.id, cause.id)"
                      ><IconX :size="11"
                    /></span>
                  </span>
                </template>
              </button>
            </div>

            <!-- TOP add-cause input -->
            <div
              v-if="!readonly && !branchesOnly && col.topBranch"
              class="tw:absolute tw:flex tw:items-center tw:gap-1"
              :style="{
                left: col.cardLeft + 'px',
                top: col.topAddY + 'px',
                width: CARD_W + 'px',
                height: ADD_ROW_H + 'px',
              }"
            >
              <input
                class="tw:flex-1 tw:min-w-0 tw:h-full tw:px-2 tw:text-xs tw:border tw:border-dashed tw:border-gray-300 tw:rounded-md tw:bg-white tw:placeholder-gray-400 tw:outline-none tw:focus:border-blue-400"
                placeholder="Type a cause + Enter"
                :value="newCauseText[col.topBranch.id] ?? ''"
                @input="
                  (e) => (newCauseText = { ...newCauseText, [col.topBranch.id]: e.target.value })
                "
                @keyup.enter="confirmAddCause(col.topBranch.id)"
                @blur="confirmAddCause(col.topBranch.id)"
              />
              <button
                class="tw:shrink-0 tw:w-6 tw:h-6 tw:flex tw:items-center tw:justify-center tw:bg-blue-500 tw:text-white tw:rounded tw:hover:bg-blue-600"
                @click="confirmAddCause(col.topBranch.id)"
              >
                <IconPlus :size="12" />
              </button>
            </div>

            <!-- TOP branch label (fixed just above spine) -->
            <div
              v-if="col.topBranch"
              class="tw:absolute tw:flex tw:items-center tw:gap-1"
              :style="{
                left: col.cardLeft + 'px',
                top: col.topLabelY + 'px',
                width: CARD_W + 'px',
              }"
            >
              <input
                class="tw:flex-1 tw:min-w-0 tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-semibold tw:border tw:bg-transparent tw:outline-none"
                :style="{
                  background: colorFor(i).bg,
                  color: colorFor(i).text,
                  borderColor: colorFor(i).border,
                }"
                :value="col.topBranch.label"
                :readonly="readonly"
                @change="(e) => updateBranchLabel(col.topBranch.id, e.target.value)"
              />
              <button
                v-if="!readonly && col.topBranch.userAdded"
                class="tw:text-gray-400 tw:hover:text-red-500 tw:shrink-0 tw:leading-none"
                title="Remove branch"
                @click="removeBranch(col.topBranch.id)"
              >
                <IconX :size="12" />
              </button>
            </div>

            <!-- BOTTOM branch label (just below spine) -->
            <div
              v-if="col.botBranch"
              class="tw:absolute tw:flex tw:items-center tw:gap-1"
              :style="{
                left: col.cardLeft + 'px',
                top: col.botLabelY + 'px',
                width: CARD_W + 'px',
              }"
            >
              <input
                class="tw:flex-1 tw:min-w-0 tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-semibold tw:border tw:bg-transparent tw:outline-none"
                :style="{
                  background: colorFor(layout.nCols + i).bg,
                  color: colorFor(layout.nCols + i).text,
                  borderColor: colorFor(layout.nCols + i).border,
                }"
                :value="col.botBranch.label"
                :readonly="readonly"
                @change="(e) => updateBranchLabel(col.botBranch.id, e.target.value)"
              />
              <button
                v-if="!readonly && col.botBranch.userAdded"
                class="tw:text-gray-400 tw:hover:text-red-500 tw:shrink-0 tw:leading-none"
                title="Remove branch"
                @click="removeBranch(col.botBranch.id)"
              >
                <IconX :size="12" />
              </button>
            </div>

            <!-- BOTTOM cause cards -->
            <div
              v-for="(cause, ci) in col.botBranch?.causes ?? []"
              :key="cause.id"
              class="tw:absolute"
              :style="{
                left: col.cardLeft + 'px',
                top: col.botCausesY + ci * CARD_TOTAL + 'px',
                width: CARD_W + 'px',
                height: CARD_H + 'px',
              }"
            >
              <!-- Edit mode -->
              <input
                v-if="editingCause?.causeId === cause.id"
                v-focus
                class="tw:w-full tw:h-full tw:px-2 tw:text-xs tw:border-2 tw:border-blue-400 tw:rounded-md tw:bg-white tw:outline-none"
                :value="editingCause.text"
                @input="editingCause.text = $event.target.value"
                @keyup.enter="saveEditCause"
                @keyup.escape="editingCause = null"
                @blur="saveEditCause"
              />
              <!-- Display mode -->
              <button
                v-else
                class="tw:w-full tw:h-full tw:flex tw:items-center tw:gap-1 tw:px-1.5 tw:rounded-md tw:border tw:text-xs tw:text-left tw:transition-all tw:cursor-pointer tw:group"
                :class="
                  cause.isRootCause
                    ? 'tw:bg-amber-50 tw:border-amber-300 tw:text-amber-900'
                    : cause.selected
                      ? 'tw:bg-blue-50 tw:border-blue-300 tw:text-blue-900'
                      : 'tw:bg-white tw:border-gray-200 tw:text-gray-700 tw:hover:border-blue-300'
                "
                :disabled="readonly"
                @click="toggleSelected(col.botBranch.id, cause.id)"
              >
                <span class="tw:flex-1 tw:truncate tw:font-medium tw:text-caption">{{
                  cause.text
                }}</span>
                <template v-if="!readonly">
                  <span
                    v-if="cause.selected"
                    class="tw:text-base tw:leading-none tw:shrink-0 tw:transition-colors tw:group-hover:opacity-0"
                    :class="
                      cause.isRootCause
                        ? 'tw:text-amber-500'
                        : 'tw:text-gray-300 tw:hover:text-amber-400'
                    "
                    :title="cause.isRootCause ? 'Unmark root cause' : 'Mark as root cause'"
                    @click.stop="toggleRootCause(col.botBranch.id, cause.id)"
                    >★</span
                  >
                  <span
                    class="tw:flex tw:items-center tw:gap-0.5 tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:shrink-0"
                    @click.stop
                  >
                    <span
                      class="tw:text-gray-400 tw:hover:text-blue-500 tw:leading-none tw:cursor-pointer"
                      title="Edit cause"
                      @click="startEditCause(col.botBranch.id, cause)"
                      ><IconPencil :size="11"
                    /></span>
                    <span
                      class="tw:text-gray-400 tw:hover:text-red-500 tw:leading-none tw:cursor-pointer"
                      title="Remove cause"
                      @click="removeCause(col.botBranch.id, cause.id)"
                      ><IconX :size="11"
                    /></span>
                  </span>
                </template>
              </button>
            </div>

            <!-- BOTTOM add-cause input -->
            <div
              v-if="!readonly && !branchesOnly && col.botBranch"
              class="tw:absolute tw:flex tw:items-center tw:gap-1"
              :style="{
                left: col.cardLeft + 'px',
                top: col.botAddY + 'px',
                width: CARD_W + 'px',
                height: ADD_ROW_H + 'px',
              }"
            >
              <input
                class="tw:flex-1 tw:min-w-0 tw:h-full tw:px-2 tw:text-xs tw:border tw:border-dashed tw:border-gray-300 tw:rounded-md tw:bg-white tw:placeholder-gray-400 tw:outline-none tw:focus:border-blue-400"
                placeholder="Type a cause + Enter"
                :value="newCauseText[col.botBranch.id] ?? ''"
                @input="
                  (e) => (newCauseText = { ...newCauseText, [col.botBranch.id]: e.target.value })
                "
                @keyup.enter="confirmAddCause(col.botBranch.id)"
                @blur="confirmAddCause(col.botBranch.id)"
              />
              <button
                class="tw:shrink-0 tw:w-6 tw:h-6 tw:flex tw:items-center tw:justify-center tw:bg-blue-500 tw:text-white tw:rounded tw:hover:bg-blue-600"
                @click="confirmAddCause(col.botBranch.id)"
              >
                <IconPlus :size="12" />
              </button>
            </div>
          </div>

          <!-- Problem box -->
          <div
            class="tw:absolute tw:flex tw:flex-col tw:bg-white tw:rounded-xl tw:border-2 tw:border-red-300 tw:px-3 tw:pt-2 tw:pb-1.5 tw:shadow-sm"
            :style="{
              left: layout.spineEndX + 18 + 'px',
              top: layout.spineY - PROBLEM_H / 2 + 'px',
              width: PROBLEM_W - 20 + 'px',
              height: PROBLEM_H + 'px',
            }"
          >
            <div
              class="tw:text-caption tw:font-bold tw:uppercase tw:tracking-wider tw:text-red-500 tw:mb-1 tw:shrink-0"
            >
              Problem
            </div>
            <!-- Display-only since 2026-08-24: the problem statement is
                 edited on the parent RcaField, shared by every method. The
                 fish head just shows it. -->
            <div class="tw:flex-1 tw:w-full tw:text-xs tw:text-gray-800 tw:leading-snug tw:overflow-hidden">
              {{ problemText || '—' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Branch button -->
    <div v-if="!readonly">
      <button
        class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:px-0"
        @click="addBranch"
      >
        <IconPlus :size="13" /> Add Branch
      </button>
    </div>

    <div v-if="selectedCount" class="tw:text-xs tw:text-secondary tw:text-right">
      {{ selectedCount }} contributing cause{{ selectedCount !== 1 ? 's' : '' }} selected
    </div>
  </div>
</template>
