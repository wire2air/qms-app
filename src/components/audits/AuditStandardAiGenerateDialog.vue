<script setup>
/**
 * AI-generate an audit checklist skeleton from a standard's name.
 * Two-step flow:
 *
 *   1. User types the standard name (+ optional notes) and clicks
 *      "Generate". We POST to /v1/services/ai/tasks/audit_standard.
 *      generate_shell/run; the model returns code + name + description
 *      + clauses[] where each clause is `{ clauseNumber, title }` and
 *      title is formatted as "<Section name>: <one-line auditor
 *      question>". One concrete question per clause, in the model's
 *      own auditor voice — never reproduces normative text.
 *
 *   2. A preview block shows the clause count + first ~6 rows. The
 *      user can tick the include-annexes flag or tweak notes and
 *      regenerate. When happy, "Import" pipes the result into the
 *      existing import endpoint (format='json') and the user lands on
 *      the new standard's detail page. Per-clause description /
 *      guidance / evidence is filled in afterwards via the per-row +
 *      bulk Enrich flows on the requirements editor.
 *
 * No new BE endpoint — the AI task is registered in
 * backend/ai/tasks/audit_standard.generate_shell.js and surfaced via
 * the generic /v1/services/ai/tasks/:taskName/run runner.
 */
import { IconSparkles, IconUpload, IconAlertTriangle } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'created'])

const toast = useToast()

const standardName = ref('')
const notes = ref('')
const includeAnnexes = ref(false)
const generating = ref(false)
const importing = ref(false)
const preview = ref(null) // { code, name, description, contentLicense, clauses[] }
const error = ref(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    standardName.value = ''
    notes.value = ''
    includeAnnexes.value = false
    preview.value = null
    error.value = null
  },
)

function close() {
  emit('update:modelValue', false)
}

// Default axios timeout is 30s (src/api/client.js). At skeleton density
// — one `<Section>: <question>` title per row, no per-clause guidance
// — even ISO 27001 + Annex A's 93 controls or SOC 2 trust criteria
// fit comfortably in the 8K output budget and complete in 30–90 s. The
// 3-min cap covers slow provider days; richer per-clause guidance is
// added afterwards via the per-row + bulk Enrich flow (the user keeps
// any notes they typed into description / guidance / expectedEvidence
// — those fields are user-editable on the requirements editor).
const AI_GENERATE_TIMEOUT_MS = 3 * 60_000

async function generate() {
  if (generating.value || !standardName.value.trim()) return
  generating.value = true
  preview.value = null
  error.value = null
  try {
    const res = await post(
      '/v1/services/ai/tasks/audit_standard.generate_shell/run',
      {
        standardName: standardName.value.trim(),
        notes: notes.value.trim() || undefined,
        includeAnnexes: includeAnnexes.value,
      },
      { timeout: AI_GENERATE_TIMEOUT_MS },
    )
    const out = res?.result
    if (!out?.clauses?.length) {
      error.value = 'The AI didn\'t return any clauses. Try a more specific standard name.'
      return
    }
    preview.value = out
  } catch (err) {
    error.value = err?.message || 'AI generation failed'
  } finally {
    generating.value = false
  }
}

// Replace-confirm state. When the BE returns STANDARD_CODE_EXISTS we
// stash the existing standard's id + name and surface a confirm
// dialog; user click "Archive & replace" re-posts the same payload
// with replaceExistingId set so the BE soft-deletes the old row in
// the same transaction as the new create.
const replaceConfirm = ref(null) // { existingId, existingName, existingCode }

function buildImportPayload(replaceExistingId = null) {
  return {
    code: preview.value.code,
    name: preview.value.name,
    description: preview.value.description || null,
    // AI output never carries a customer licence — these are the
    // model's own original guidance. Drop straight into the licence
    // tier the model chose (validated by Zod to be one of the three
    // non-OFFICIAL_LICENSED ids).
    contentLicense: preview.value.contentLicense || 'STRUCTURAL_SHELL',
    format: 'json',
    clauses: preview.value.clauses,
    // Attestation N/A for STRUCTURAL_SHELL / PUBLIC_DOMAIN /
    // CUSTOMER_AUTHORED; BE schema only requires it for
    // CUSTOMER_LICENSED. Pass false explicitly to silence linting.
    licenseAttested: false,
    ...(replaceExistingId ? { replaceExistingId } : {}),
  }
}

async function submitImport(payload) {
  const res = await post('/v1/services/auditStandards/import', payload)
  const standard = res?.standard ?? null
  toast.success(`Created ${standard?.name ?? preview.value.name}`)
  emit('created', standard)
  close()
}

async function handleImport() {
  if (importing.value || !preview.value) return
  importing.value = true
  try {
    await submitImport(buildImportPayload())
  } catch (err) {
    if (err?.code === 'STANDARD_CODE_EXISTS' && err?.details?.existingStandardId) {
      // Caller will see the confirm dialog; keep `importing` from
      // toggling back so the primary button stays disabled until they
      // resolve the dialog.
      replaceConfirm.value = {
        existingId: err.details.existingStandardId,
        existingName: err.details.existingStandardName,
        existingCode: err.details.existingStandardCode,
      }
      return
    }
    toast.error(err?.message || 'Import failed')
  } finally {
    importing.value = false
  }
}

async function confirmReplace() {
  if (!replaceConfirm.value || importing.value) return
  importing.value = true
  const existingId = replaceConfirm.value.existingId
  replaceConfirm.value = null
  try {
    await submitImport(buildImportPayload(existingId))
  } catch (err) {
    toast.error(err?.message || 'Import failed')
  } finally {
    importing.value = false
  }
}

const previewRows = computed(() => preview.value?.clauses?.slice(0, 6) ?? [])
const remainingCount = computed(() =>
  Math.max(0, (preview.value?.clauses?.length ?? 0) - previewRows.value.length),
)
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="AI Generate — Audit Standard Shell"
    maxWidth="xl"
    @update:modelValue="close"
  >
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <!-- Context strip -->
      <div
        class="tw:rounded-lg tw:bg-purple-50 tw:border tw:border-purple-200 tw:p-3 tw:text-xs tw:text-purple-900 tw:leading-relaxed tw:flex tw:items-start tw:gap-2"
      >
        <IconSparkles :size="16" class="tw:shrink-0 tw:mt-0.5" />
        <span>
          The AI produces an <strong>audit checklist skeleton</strong> —
          one row per clause, with a title formatted as
          <em>“Section name: one-line auditor question”</em>. The
          question is the model's own original prose (never the
          standard's normative text). Description / guidance / expected
          evidence are left empty for you to fill in as notes, or to
          author later via the per-row + bulk <strong>Enrich</strong>
          buttons on the requirements editor.
        </span>
      </div>

      <!-- Input -->
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Standard name
        </p>
        <BaseTextInput
          v-model="standardName"
          placeholder='e.g. "ISO 27001:2022", "SOC 2 Type II", "NIST SP 800-53 rev 5"'
          :required="true"
        />
      </div>

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Notes (optional)
        </p>
        <BaseTextarea
          v-model="notes"
          :rows="2"
          placeholder="Scope hints — sector, jurisdiction, version year if ambiguous, sections to emphasise…"
        />
      </div>

      <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:cursor-pointer">
        <input v-model="includeAnnexes" type="checkbox" />
        <span>
          Include annex / control catalogue (e.g. ISO 27001 Annex A —
          93 controls; NIST 800-53 controls). Off by default for a
          smaller, faster shell.
        </span>
      </label>

      <div class="tw:flex tw:gap-2">
        <BaseButton
          variant="primary"
          :loading="generating"
          :disabled="generating || !standardName.trim()"
          @click="generate"
        >
          <template #icon><IconSparkles :size="16" /></template>
          {{ preview ? 'Regenerate' : 'Generate' }}
        </BaseButton>
        <span v-if="generating" class="tw:text-xs tw:text-secondary tw:self-center">
          Authoring auditor questions… 30–90 s for most standards.
        </span>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="tw:rounded-lg tw:border tw:border-red-300 tw:bg-red-50 tw:p-3 tw:text-xs tw:text-red-800 tw:flex tw:items-start tw:gap-2"
      >
        <IconAlertTriangle :size="16" class="tw:shrink-0 tw:mt-0.5" />
        <span>{{ error }}</span>
      </div>

      <!-- Preview -->
      <div v-if="preview" class="tw:flex tw:flex-col tw:gap-2">
        <div
          class="tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/30 tw:p-3 tw:text-xs tw:flex tw:flex-col tw:gap-1"
        >
          <div class="tw:flex tw:items-center tw:gap-2">
            <code class="tw:text-[11px] tw:font-mono tw:text-primary">
              {{ preview.code }}
            </code>
            <span class="tw:text-secondary">·</span>
            <span class="tw:font-semibold tw:text-on-main">{{ preview.name }}</span>
            <span class="tw:text-secondary">·</span>
            <span class="tw:text-[10px] tw:uppercase tw:tracking-wide tw:bg-gray-200 tw:text-gray-700 tw:px-1.5 tw:py-0.5 tw:rounded">
              {{ preview.contentLicense }}
            </span>
          </div>
          <div class="tw:text-secondary">{{ preview.description }}</div>
          <div class="tw:text-[11px] tw:text-secondary tw:mt-1">
            {{ preview.clauses.length }} clause{{ preview.clauses.length === 1 ? '' : 's' }} generated
          </div>
        </div>

        <div
          class="tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden tw:divide-y tw:divide-divider"
        >
          <div
            v-for="row in previewRows"
            :key="row.clauseNumber"
            class="tw:flex tw:gap-3 tw:px-3 tw:py-2 tw:text-xs"
          >
            <code class="tw:font-mono tw:text-secondary tw:shrink-0 tw:w-20">
              {{ row.clauseNumber }}
            </code>
            <div class="tw:flex tw:flex-col tw:gap-0.5 tw:flex-1 tw:min-w-0">
              <span class="tw:text-on-main tw:line-clamp-3">{{ row.title }}</span>
            </div>
          </div>
          <div
            v-if="remainingCount > 0"
            class="tw:px-3 tw:py-2 tw:text-[11px] tw:text-secondary tw:italic"
          >
            … and {{ remainingCount }} more.
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" :disabled="importing" @click="close">Cancel</BaseButton>
      <BaseButton
        v-if="preview"
        variant="primary"
        :loading="importing"
        :disabled="importing"
        @click="handleImport"
      >
        <template #icon><IconUpload :size="16" /></template>
        Import {{ preview.clauses.length }} clauses
      </BaseButton>
    </template>
  </BaseDialog>

  <!-- Replace-existing confirm. Shown when the import endpoint returns
       409 STANDARD_CODE_EXISTS. User can either archive the old
       standard + create the new one, or back out. -->
  <BaseDialog
    :modelValue="!!replaceConfirm"
    title="Standard already exists"
    maxWidth="md"
    @update:modelValue="replaceConfirm = null"
  >
    <div v-if="replaceConfirm" class="tw:flex tw:flex-col tw:gap-3 tw:p-1 tw:text-sm">
      <p class="tw:text-on-main">
        A standard with code
        <code class="tw:font-mono tw:bg-main-hover tw:px-1.5 tw:py-0.5 tw:rounded">
          {{ replaceConfirm.existingCode }}
        </code>
        already exists for this company:
        <strong>{{ replaceConfirm.existingName }}</strong>.
      </p>
      <p class="tw:text-secondary tw:text-xs">
        Archiving the existing standard will remove it from the standards list
        and free the code for the new generated standard. Any historical audit
        instances that referenced it keep their snapshotted requirements (audits
        do not re-resolve against the live standard).
      </p>
    </div>
    <template #footer>
      <BaseButton variant="outline" :disabled="importing" @click="replaceConfirm = null">
        Cancel
      </BaseButton>
      <BaseButton
        variant="danger"
        :loading="importing"
        :disabled="importing"
        @click="confirmReplace"
      >
        Archive existing &amp; replace
      </BaseButton>
    </template>
  </BaseDialog>
</template>
