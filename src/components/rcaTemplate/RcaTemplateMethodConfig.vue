<script setup>
import { IconPlus, IconTrash, IconGripVertical } from '@tabler/icons-vue'

const props = defineProps({
  method: { type: String, default: null },
  config: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:config'])

function uid() {
  return crypto.randomUUID()
}

// ── Fishbone ────────────────────────────────────────────────
function addBranch() {
  const branches = [...(props.config.branches ?? [])]
  branches.push({ id: uid(), label: 'New Branch', causes: [] })
  emit('update:config', { ...props.config, branches })
}

function removeBranch(branchId) {
  const branches = (props.config.branches ?? []).filter((b) => b.id !== branchId)
  emit('update:config', { ...props.config, branches })
}

function updateBranchLabel(branchId, label) {
  const branches = (props.config.branches ?? []).map((b) =>
    b.id === branchId ? { ...b, label } : b,
  )
  emit('update:config', { ...props.config, branches })
}

// ── 5 Whys ──────────────────────────────────────────────────
function updateProblemPrompt(problemPrompt) {
  emit('update:config', { ...props.config, problemPrompt })
}

function addWhy() {
  const whys = [...(props.config.whys ?? []), { id: uid(), prompt: '' }]
  emit('update:config', { ...props.config, whys })
}

function removeWhy(whyId) {
  const whys = (props.config.whys ?? []).filter((w) => w.id !== whyId)
  emit('update:config', { ...props.config, whys })
}

function updateWhyPrompt(whyId, prompt) {
  const whys = (props.config.whys ?? []).map((w) => (w.id === whyId ? { ...w, prompt } : w))
  emit('update:config', { ...props.config, whys })
}

// ── Is / Is Not ─────────────────────────────────────────────
function addDimension() {
  const dimensions = [...(props.config.dimensions ?? []), '']
  emit('update:config', { ...props.config, dimensions })
}

function removeDimension(idx) {
  const dimensions = (props.config.dimensions ?? []).filter((_, i) => i !== idx)
  emit('update:config', { ...props.config, dimensions })
}

function updateDimension(idx, value) {
  const dimensions = (props.config.dimensions ?? []).map((d, i) => (i === idx ? value : d))
  emit('update:config', { ...props.config, dimensions })
}

// ── Why Tree ─────────────────────────────────────────────────
function updateWhyTreeProblemPrompt(problemPrompt) {
  emit('update:config', { ...props.config, problemPrompt })
}
</script>

<template>
  <!-- Fishbone -->
  <div v-if="method === 'fishbone'" class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between">
      <span class="tw:text-sm tw:font-medium tw:text-on-main">Branches</span>
      <button
        class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
        @click="addBranch"
      >
        <IconPlus :size="14" /> Add Branch
      </button>
    </div>
    <p class="tw:text-xs tw:text-secondary tw:-mt-1">
      Define the branch categories. Users will add and edit causes during their investigation.
    </p>

    <div class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="branch in config.branches ?? []"
        :key="branch.id"
        class="tw:flex tw:items-center tw:gap-2"
      >
        <BaseTextInput
          :modelValue="branch.label"
          placeholder="Branch name"
          size="sm"
          class="tw:flex-1"
          @update:modelValue="(v) => updateBranchLabel(branch.id, v)"
        />
        <button
          class="tw:text-secondary tw:hover:text-bad tw:shrink-0"
          @click="removeBranch(branch.id)"
        >
          <IconTrash :size="14" />
        </button>
      </div>
    </div>

    <div v-if="!(config.branches ?? []).length" class="tw:text-sm tw:text-secondary tw:text-center tw:py-4">
      No branches yet. Click "Add Branch" to start.
    </div>
  </div>

  <!-- 5 Whys -->
  <div v-else-if="method === '5why'" class="tw:flex tw:flex-col tw:gap-4">
    <BaseField
      v-slot="{ id: fieldId }"
      label="Problem Prompt"
      hint="Shown to users as the first question before the Whys."
    >
      <BaseTextInput
        :id="fieldId"
        :modelValue="config.problemPrompt ?? ''"
        placeholder="e.g. Describe what happened"
        @update:modelValue="updateProblemPrompt"
      />
    </BaseField>

    <div>
      <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
        <BaseLabel size="md">Why Prompts</BaseLabel>
        <button
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
          @click="addWhy"
        >
          <IconPlus :size="14" /> Add Why
        </button>
      </div>

      <div class="tw:flex tw:flex-col tw:gap-2">
        <div
          v-for="(why, idx) in config.whys ?? []"
          :key="why.id"
          class="tw:flex tw:items-center tw:gap-2"
        >
          <span class="tw:text-sm tw:text-secondary tw:w-6 tw:shrink-0">{{ idx + 1 }}.</span>
          <BaseTextInput
            :modelValue="why.prompt"
            placeholder="e.g. Why did this occur?"
            class="tw:flex-1"
            @update:modelValue="(v) => updateWhyPrompt(why.id, v)"
          />
          <button
            class="tw:text-secondary tw:hover:text-bad tw:shrink-0"
            @click="removeWhy(why.id)"
          >
            <IconTrash :size="14" />
          </button>
        </div>
      </div>

      <div v-if="!(config.whys ?? []).length" class="tw:text-sm tw:text-secondary tw:text-center tw:py-3">
        No whys yet. Add at least 5.
      </div>
    </div>
  </div>

  <!-- Is / Is Not -->
  <div v-else-if="method === 'isnot'" class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between">
      <BaseLabel size="md">Dimensions</BaseLabel>
      <button
        class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
        @click="addDimension"
      >
        <IconPlus :size="14" /> Add Dimension
      </button>
    </div>

    <p class="tw:text-xs tw:text-secondary tw:-mt-1">
      Each dimension appears as a row in the Is / Is Not comparison table.
    </p>

    <div class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="(dim, idx) in config.dimensions ?? []"
        :key="idx"
        class="tw:flex tw:items-center tw:gap-2"
      >
        <IconGripVertical :size="14" class="tw:text-secondary/50 tw:shrink-0" />
        <BaseTextInput
          :modelValue="dim"
          placeholder="e.g. What"
          class="tw:flex-1"
          @update:modelValue="(v) => updateDimension(idx, v)"
        />
        <button
          class="tw:text-secondary tw:hover:text-bad tw:shrink-0"
          @click="removeDimension(idx)"
        >
          <IconTrash :size="14" />
        </button>
      </div>
    </div>

    <div v-if="!(config.dimensions ?? []).length" class="tw:text-sm tw:text-secondary tw:text-center tw:py-3">
      No dimensions yet.
    </div>
  </div>

  <!-- Why Tree -->
  <div v-else-if="method === 'whytree'" class="tw:flex tw:flex-col tw:gap-3">
    <BaseField
      v-slot="{ id: fieldId }"
      label="Problem Prompt"
      hint="Shown to users as the label for their problem statement."
    >
      <BaseTextInput
        :id="fieldId"
        :modelValue="config.problemPrompt ?? ''"
        placeholder="e.g. Describe what happened"
        @update:modelValue="updateWhyTreeProblemPrompt"
      />
    </BaseField>
    <p class="tw:text-xs tw:text-secondary tw:border tw:border-divider tw:rounded-lg tw:p-3">
      The causal tree is built by the investigator during the RCA — no pre-configuration needed.
      Users start by adding a "why" for the problem, then drill down until they reach root causes.
    </p>
  </div>
</template>
