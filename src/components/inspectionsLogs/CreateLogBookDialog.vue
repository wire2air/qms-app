<script setup>
import { IconChevronDown, IconChevronUp } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception. The logBooks
// endpoint validates edit-window pairing, classification, status and uniqueness
// server-side before the row lands; SyncEngine catches up via the sync push.
import { post } from '@/api'
import { required } from '@shared/components/form/validators.js'

/**
 * Dedicated wizard for creating a Log Book (an Inspections & Logs
 * form template). Backend payload is the same FormTemplate row the
 * generic wizard writes, but the UX is purpose-built for the I&L
 * vocabulary:
 *
 *   - No classification toggle. The "Operational vs Controlled"
 *     distinction is *derived* from the actual settings the user
 *     picks (e-sig + reviewer). Anything with e-sig at submit is a
 *     Controlled Record; otherwise it's an Operational Log. Lets
 *     authors describe behavior in plain terms and removes the
 *     redundant double-definition.
 *   - Single step. No DocumentType (auto-stamped INSPECTION_LOG),
 *     no Training Configuration, no preset gallery.
 *   - Edit window + e-signature + reviewer surfaced inline with sane
 *     defaults already applied — admin only tweaks them, doesn't
 *     learn the model.
 *   - Site availability stays — it's the operational scope.
 *
 * On save, navigates the parent to the template detail page so the
 * author can build the schema in the same builder the rest of the
 * app uses.
 */

const props = defineProps({
  // Create-from-equipment flow: pre-links the instrument, preselects its
  // site, suggests a title, and (when triggerSource is set) arms the
  // TRIGGER schedule so the book follows the equipment's due dates.
  preset: { type: Object, default: null },
})
const emit = defineEmits(['created'])
const open = defineModel({ type: Boolean, default: false })

const formRef = ref(null)
const saveError = ref('')

// Form state -----------------------------------------------------------
const title = ref('')
// Code prefix template. The literal `FRM` is the convention default; the
// {DEPTCODE} / {TYPECODE} placeholders are resolved server-side from the
// selected Department + LogBookType so the final code matches what the
// FE preview shows. Users can flatten this to a literal string if they
// don't want the templating.
const codePrefix = ref('FRM-{DEPTCODE}-{TYPECODE}')
const description = ref('')
// UI decision 2026-08-05: a log book belongs to ONE site (the pivot table
// stays — only the UI narrowed; existing multi-site rows are untouched).
const selectedSiteId = ref(null)

// Taxonomy + routing (Round 0 additions)
const logBookTypeId = ref(null)
const supervisorUserId = ref(null)
const equipmentId = ref(null)
const departmentId = ref(null)
const location = ref('')

// Prefill location from the selected instrument (equipment carries its own
// location) — only when the field is still empty, so a manual entry is kept.
const selectedEquipment = useLiveQueryWithDeps(
  [() => equipmentId.value],
  async (db, [id]) => (id ? db.Equipment.findByPk(id) : null),
  { models: ['Equipment'] },
)
watch(selectedEquipment, (eq) => {
  if (eq?.locationText && !location.value?.trim()) location.value = eq.locationText
})

// Compliance references
const relatedStandardId = ref(null)
const regulatoryCitation = ref('')
const retentionMonths = ref(null)

// Behavior settings. These define what the log book IS — the
// recordClassification is derived from them at save time.
const editWindowMode = ref('TIME_WINDOW')
const editWindowMinutes = ref(15)
const signatureRequired = ref(false)
const reviewRequired = ref(false)

// Collapse state for the two optional sections.
const showReferences = ref(false)
const showCompliance = ref(false)

// Optional starting point — a form block whose fields are DEEP-COPIED into
// the new log book's schema at create. A true snapshot: editing or archiving
// the block later never touches this book (same blocks-only + copy-on-pick
// rule as the workflow Task Form picker; log book schemas never reference
// form_templates).
const formBlocks = useLiveQuery(
  async (db) =>
    (await db.FormTemplate.where('statusId', 'ACTIVE').exec())
      .filter((t) => t.kind === 'BLOCK')
      .sort((a, b) => a.title.localeCompare(b.title)),
  { models: ['FormTemplate'], initial: [] },
)
const startingBlockId = ref(null)

// Catalog for the Log Book Type dropdown — globals + tenant additions.
// SyncEngine model includes both because the RLS SELECT policy allows
// company_id NULL rows for everyone.
const logBookTypes = useLiveQuery(
  async (db) => {
    const rows = await db.LogBookType.where().exec()
    return rows.sort((a, b) => (a.sequence ?? 100) - (b.sequence ?? 100))
  },

  { models: ['LogBookType'], initial: [] },
)

// Equipment dropdown — uses EquipmentSelectMenu (added with the
// Equipment module follow-up). Hides RETIRED equipment by default.

const isSubmitting = ref(false)
const presetTrigger = ref(null)

// Reset state every time the dialog opens. Re-opening after a cancel
// shouldn't carry stale draft values.
watch(open, (isOpen) => {
  if (!isOpen) return
  title.value = ''
  codePrefix.value = 'FRM-{DEPTCODE}-{TYPECODE}'
  description.value = ''
  selectedSiteId.value = null
  startingBlockId.value = null
  logBookTypeId.value = null
  supervisorUserId.value = null
  equipmentId.value = null
  departmentId.value = null
  location.value = ''
  relatedStandardId.value = null
  regulatoryCitation.value = ''
  retentionMonths.value = null
  editWindowMode.value = 'TIME_WINDOW'
  editWindowMinutes.value = 15
  signatureRequired.value = false
  presetTrigger.value = null
  if (props.preset) {
    title.value = props.preset.title ?? ''
    equipmentId.value = props.preset.equipmentId ?? null
    selectedSiteId.value = props.preset.siteId ?? null
    supervisorUserId.value = props.preset.supervisorUserId ?? null
    presetTrigger.value = props.preset.triggerSource ?? null
  }
  reviewRequired.value = false
  showReferences.value = false
  showCompliance.value = false
  isSubmitting.value = false
  saveError.value = ''
})

// Derived classification — what we stamp on template.config and how
// the rest of the app (badges, picker filter, server-side enforcement)
// reads the policy. Mirrors what an industry user would call it.
const derivedClassification = computed(() =>
  signatureRequired.value ? 'CONTROLLED_RECORD' : 'OPERATIONAL_LOG',
)

const classificationLabel = computed(() =>
  derivedClassification.value === 'CONTROLLED_RECORD'
    ? 'Controlled log book'
    : 'Operational log book',
)

// Plain-English summary that updates as the user toggles settings.
// Helps authors confirm the policy matches their intent.
const policySummary = computed(() => {
  const parts = []
  if (signatureRequired.value) parts.push('e-signature on submit')
  if (reviewRequired.value) parts.push('reviewer approval before locking')
  if (editWindowMode.value === 'TIME_WINDOW') {
    parts.push(`editable for ${editWindowMinutes.value} min after submit`)
  } else if (editWindowMode.value === 'UNTIL_NEXT_ENTRY') {
    parts.push('editable until the next entry')
  } else if (editWindowMode.value === 'UNTIL_REVIEW') {
    parts.push('editable until reviewed')
  } else {
    parts.push('locks immediately on submit')
  }
  return parts.join(' · ')
})

// Code prefix preview -----------------------------------------------
// Resolve {DEPTCODE} + {TYPECODE} on the FE against the currently
// selected Department / LogBookType so the author sees the final code
// without round-tripping. Unresolvable placeholders stay literal
// (the server resolves the canonical value at save and rejects if
// the dependency is missing).
const departments = useLiveQuery(async (db) => db.Department.where().exec(), {
  models: ['Department'],
  initial: [],
})
const departmentById = computed(() => new Map(departments.value.map((d) => [d.id, d])))
const logBookTypeById = computed(() => new Map(logBookTypes.value.map((t) => [t.id, t])))

const resolvedCodePreview = computed(() => {
  const template = (codePrefix.value || '').trim()
  if (!template) return ''
  const deptCode = departmentById.value.get(departmentId.value)?.code
  const typeCode = logBookTypeById.value.get(logBookTypeId.value)?.id
  return template
    .replace(/\{DEPT_?CODE\}/gi, deptCode ? deptCode.toUpperCase() : '{DEPTCODE}')
    .replace(/\{TYPE_?CODE\}/gi, typeCode ? typeCode.toUpperCase() : '{TYPECODE}')
})

const isFormValid = computed(
  () =>
    title.value.trim().length > 0 &&
    codePrefix.value.trim().length >= 2 &&
    // Required: type categorises in the catalog; supervisor drives
    // digest + flag routing (no routing target == alerts vanish);
    // sites anchor the log book to at least one site operationally.
    // (Note: the planned user↔site data-level visibility filter is a
    // separate concern — see architecture_security_tiers memory.)
    !!logBookTypeId.value &&
    !!supervisorUserId.value &&
    !!selectedSiteId.value,
)

// Save — goes through REST so the logBookService can validate cron-y
// stuff (edit window mode/minutes pairing, classification, status,
// uniqueness) before the row lands. SyncEngine catches up via the
// natural sync push afterwards.
const createSiteOnLogBook = useLiveMutation(async (db, { logBookId, siteId }) => {
  const sot = db.SiteOnLogBook.create({ logBookId, siteId })
  await sot.save()
  return sot
})

async function save() {
  if (!isFormValid.value || isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    const startingBlock = startingBlockId.value
      ? formBlocks.value.find((t) => t.id === startingBlockId.value)
      : null
    const res = await post('/v1/services/logBooks', {
      title: title.value.trim(),
      codePrefix: codePrefix.value.trim(),
      description: description.value?.trim() || null,
      logBookTypeId: logBookTypeId.value || null,
      supervisorUserId: supervisorUserId.value || null,
      equipmentId: equipmentId.value || null,
      departmentId: departmentId.value || null,
      location: location.value?.trim() || null,
      relatedStandardId: relatedStandardId.value || null,
      regulatoryCitation: regulatoryCitation.value?.trim() || null,
      retentionMonths: retentionMonths.value || null,
      recordClassification: derivedClassification.value,
      editWindowMode: editWindowMode.value,
      editWindowMinutes: editWindowMode.value === 'TIME_WINDOW' ? editWindowMinutes.value : null,
      signatureRequired: signatureRequired.value,
      reviewRequired: reviewRequired.value,
      notifyOnSubmit: 'DIGEST',
      ...(presetTrigger.value
        ? {
            scheduleMode: 'TRIGGER',
            triggerSource: presetTrigger.value,
            syncsEquipmentCalibration: presetTrigger.value === 'CALIBRATION',
            syncsEquipmentPm: presetTrigger.value === 'PM',
          }
        : {}),
      // Snapshot, not reference: the block's fields are copied by value.
      schema: Array.isArray(startingBlock?.schema)
        ? JSON.parse(JSON.stringify(startingBlock.schema))
        : [],
      statusId: 'ACTIVE',
    })
    const logBook = res?.logBook ?? res
    // Site links are SyncEngine-native — no service validation needed,
    // and going through IDB keeps the live-query on the templates page
    // up-to-date immediately.
    for (const siteId of [selectedSiteId.value]) {
      await createSiteOnLogBook({ logBookId: logBook.id, siteId })
    }
    // Equipment flow: auto-assign the custodian as the default logger so
    // the trigger/schedule has an audience from day one (user decision
    // 2026-08-06). Best-effort — the Assignments tab manages it after.
    if (props.preset?.supervisorUserId && logBook?.id) {
      try {
        await post('/v1/services/formAssignments', {
          logBookId: logBook.id,
          assignedUserIds: [props.preset.supervisorUserId],
          active: true,
        })
      } catch {
        // Non-fatal — the submit-time reminder covers a missing audience.
      }
    }
    emit('created', logBook)
    open.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to create log book'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    maxWidth="2xl"
    persistent
    showClose
    title="New Log Book"
    subtitle="Define what gets logged. You'll build the form fields next."
  >
    <BaseForm ref="formRef" hideFooter @submit="save">
      <!-- Title -->
      <BaseField label="Log Book Name" required :value="title" :rules="[required()]">
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="title"
            placeholder="e.g. Daily Warehouse Temperature Log"
          />
        </template>
      </BaseField>

      <!-- Code prefix template — supports {DEPTCODE} / {TYPECODE}
           placeholders, resolved server-side from the selected
           Department + LogBookType. Defaults to FRM-{DEPTCODE}-{TYPECODE}. -->
      <BaseField label="Record Id Prefix" required :value="codePrefix" :rules="[required()]">
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="codePrefix"
            placeholder="FRM-{DEPTCODE}-{TYPECODE}"
          />
          <div class="tw:text-xs tw:text-secondary tw:mt-1 tw:flex tw:flex-col tw:gap-0.5">
            <div>
              Use
              <span class="tw:text-on-main">{DEPTCODE}</span>
              and
              <span class="tw:text-on-main">{TYPECODE}</span>
              to insert the selected Department + Log Book Type. Leave plain text for a literal
              code.
            </div>
            <div>
              Resolved:
              <span class="tw:text-on-main">{{ resolvedCodePreview }}</span>
              · entries numbered
              <span class="tw:text-on-main">{{ resolvedCodePreview }}-0001</span>
            </div>
          </div>
        </template>
      </BaseField>

      <!-- Description -->
      <BaseField v-slot="{ id: fieldId }" label="Description" optional>
        <BaseTextarea
          :id="fieldId"
          v-model="description"
          :rows="2"
          placeholder="What this log book is for"
        />
      </BaseField>

      <!-- Starting point — copies a form block's fields into the new book. -->
      <BaseField
        v-slot="{ id: fieldId }"
        label="Start from a form block"
        optional
        hint="Copies the block's fields in as a starting point — later changes to the block never affect this log book."
      >
        <select
          :id="fieldId"
          v-model="startingBlockId"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
        >
          <option :value="null">Blank form — build from scratch</option>
          <option v-for="b in formBlocks" :key="b.id" :value="b.id">
            {{ b.title }} ({{ b.schema?.length ?? 0 }} fields)
          </option>
        </select>
      </BaseField>

      <!-- Type + Supervisor (always visible — these are the load-bearing
           routing fields for the digest / approval flow). -->
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <BaseField label="Type" required :value="logBookTypeId" :rules="[required()]">
          <template #default="field">
            <select
              v-bind="field"
              v-model="logBookTypeId"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            >
              <option :value="null" disabled>— Pick a type —</option>
              <option v-for="t in logBookTypes" :key="t.id" :value="t.id">
                {{ t.name }}
              </option>
            </select>
            <div
              v-if="logBookTypes.length === 0"
              class="tw:text-caption tw:text-amber-700 tw:italic tw:mt-1"
            >
              No categories loaded yet — the seeded global types sync on the next bootstrap. If this
              persists, hard-refresh the page to re-bootstrap IndexedDB.
            </div>
          </template>
        </BaseField>
        <BaseField
          label="Supervisor"
          required
          hint="Who reviews submissions + gets daily digests + flag alerts."
          :value="supervisorUserId"
          :rules="[required()]"
        >
          <UserSelectMenu v-model="supervisorUserId" />
        </BaseField>
      </div>

      <!-- Site availability + Department. Sites anchor the log book
           operationally; Department feeds {DEPTCODE} in the Record ID
           prefix, so it sits here (not buried in References). -->
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <BaseField
          label="Sites"
          required
          hint="Pick at least one site where this log book can be filled."
          :value="selectedSiteId"
          :rules="[required('Pick a site.')]"
        >
          <SiteSelectMenu v-model="selectedSiteId" :required="true" />
        </BaseField>
        <BaseField label="Department">
          <DepartmentSelectMenu v-model="departmentId" :siteId="selectedSiteId" />
          <div class="tw:text-xs tw:text-secondary tw:mt-1">
            Feeds <span class="">{DEPTCODE}</span> in the Record ID prefix.
          </div>
        </BaseField>
      </div>

      <!-- References — equipment / location. Collapsed by default because
           most first-time authors won't need them. -->
      <div class="tw:border tw:border-divider tw:rounded-lg">
        <button
          type="button"
          class="tw:w-full tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:hover:bg-main-hover tw:transition"
          @click="showReferences = !showReferences"
        >
          <span class="tw:font-medium">References</span>
          <component :is="showReferences ? IconChevronUp : IconChevronDown" :size="16" />
        </button>
        <div v-if="showReferences" class="tw:px-3 tw:pb-3 tw:pt-1 tw:flex tw:flex-col tw:gap-3">
          <BaseField label="Equipment">
            <EquipmentSelectMenu v-model="equipmentId" />
          </BaseField>
          <BaseField
            v-slot="{ id: fieldId }"
            label="Location"
            hint="Where this log is performed. Equipment covers the asset/line; this is the spot."
          >
            <BaseTextInput
              :id="fieldId"
              v-model="location"
              placeholder="e.g. Room 201, Cold Store, Line 3"
            />
          </BaseField>
        </div>
      </div>

      <!-- Compliance — regulatory standard, citation, retention. -->
      <div class="tw:border tw:border-divider tw:rounded-lg">
        <button
          type="button"
          class="tw:w-full tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:hover:bg-main-hover tw:transition"
          @click="showCompliance = !showCompliance"
        >
          <span class="tw:font-medium">Compliance</span>
          <component :is="showCompliance ? IconChevronUp : IconChevronDown" :size="16" />
        </button>
        <div v-if="showCompliance" class="tw:px-3 tw:pb-3 tw:pt-1 tw:flex tw:flex-col tw:gap-3">
          <BaseField label="Related standard">
            <RelatedStandardSelectMenu v-model="relatedStandardId" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Regulatory citation">
            <BaseTextInput
              :id="fieldId"
              v-model="regulatoryCitation"
              placeholder="e.g. ISO 9001 §7.5.3.2 / 21 CFR 211.184"
            />
          </BaseField>
          <BaseField
            v-slot="{ id: fieldId }"
            label="Retention (months) — leave blank for indefinite"
            hint="Captured for future archival. No automated cleanup yet."
          >
            <input
              :id="fieldId"
              v-model.number="retentionMonths"
              type="number"
              min="1"
              max="600"
              class="tw:w-40 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            />
          </BaseField>
        </div>
      </div>

      <!-- Behavior settings — these define the policy. We derive the
           classification label from them at save time. -->
      <div class="tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:flex tw:flex-col tw:gap-3">
        <BaseText variant="overline">Entry policy</BaseText>

        <!-- Edit window -->
        <BaseField v-slot="{ id: fieldId }" label="Edit window">
          <select
            :id="fieldId"
            v-model="editWindowMode"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1.5 tw:text-sm"
          >
            <option value="NONE">None — lock immediately on submit</option>
            <option value="TIME_WINDOW">Time window — lock after N minutes</option>
            <option value="UNTIL_NEXT_ENTRY">Until next entry from the same user</option>
            <option value="UNTIL_REVIEW">Until reviewed</option>
          </select>
          <BaseField
            v-if="editWindowMode === 'TIME_WINDOW'"
            v-slot="{ id: minutesId }"
            label="Lock after (minutes)"
            class="tw:mt-2"
          >
            <input
              :id="minutesId"
              v-model.number="editWindowMinutes"
              type="number"
              min="1"
              max="2880"
              class="tw:w-32 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
            />
          </BaseField>
        </BaseField>

        <!-- E-sig + review -->
        <div class="tw:flex tw:flex-col tw:gap-2">
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main">
            <input v-model="signatureRequired" type="checkbox" />
            <span>Require e-signature on submit</span>
          </label>
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main">
            <input v-model="reviewRequired" type="checkbox" />
            <span>Require reviewer approval before locking</span>
          </label>
        </div>

        <!-- Derived label preview -->
        <div class="tw:flex tw:items-start tw:gap-2 tw:text-xs tw:bg-main-hover tw:rounded tw:p-2">
          <div class="tw:flex tw:flex-col tw:gap-0.5">
            <span class="tw:text-secondary">This will be saved as a</span>
            <span class="tw:font-semibold tw:text-on-main">{{ classificationLabel }}</span>
            <span class="tw:text-secondary">{{ policySummary }}</span>
          </div>
        </div>
      </div>
    </BaseForm>

    <!-- Footer — pinned to the bottom by BaseDialog's #footer region -->
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Create & Build Form"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="close"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
