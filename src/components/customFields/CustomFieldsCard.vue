<script setup>
/**
 * CustomFieldsCard — drop-in "Additional information" card for the core entity
 * detail pages (NC / CAPA / CR / Audit / Document / Training). Renders the
 * admin-defined custom fields for `entityType` (an EntityFieldSet schema) via
 * the forms framework and stores answers in a single EntityFieldValue row per
 * entity instance.
 *
 *   <CustomFieldsCard entityType="Nonconformance" :entityId="nc.id" :editable="isEditable" />
 *
 * - Live-queries the entity's EntityFieldSet (definitions) + its EntityFieldValue
 *   row (answers). Renders nothing when no custom fields are defined.
 * - Editable → DynamicForm bound to the payload, autosaving on change.
 * - Read-only → FormSchemaReadonlyView from the SEALED snapshot (form_schema),
 *   so a closed record reads the same even if the definitions/labels later change.
 * - On save: snapshots the live schema → form_schema and freezes option labels
 *   into the payload (mirror of the form-record seal: nc_records.payload +
 *   workflow_instance_steps.form_schema).
 */
import DynamicForm from '@/components/form/DynamicForm.js'
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import { freezeOptionLabels } from '@/utils/freezeFormPayloadLabels.js'
import { customFieldEntityLabel } from '@/utils/customFieldEntities.js'

const props = defineProps({
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  // Mirrors the parent record's own edit gate (NC isEditable, Document canEdit,
  // Training canUpdate, …). Read-only renders the sealed snapshot.
  editable: { type: Boolean, default: false },
  // Card title. Single "Additional information" card per page in v1.
  title: { type: String, default: 'Additional information' },
})

// ─── Definitions + data ──────────────────────────────────────────────────────
const fieldSet = useLiveQueryWithDeps(
  [() => props.entityType],
  async (db, [entityType]) => {
    if (!entityType) return null
    return db.EntityFieldSet.where('entityType', entityType).first()
  },
  { models: ['EntityFieldSet'] },
)

const valueRow = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId],
  async (db, [entityType, entityId]) => {
    if (!entityType || !entityId) return null
    return db.EntityFieldValue.where('[entityType+entityId]', [entityType, entityId]).first()
  },
  { models: ['EntityFieldValue'] },
)

// The LIVE definition schema (edit mode renders this so newly-added fields
// appear immediately). Read-only prefers the per-record SEALED snapshot.
const liveSchema = computed(() =>
  Array.isArray(fieldSet.value?.schema) ? fieldSet.value.schema : [],
)
const readonlySchema = computed(() => {
  const snap = valueRow.value?.formSchema
  return Array.isArray(snap) && snap.length ? snap : liveSchema.value
})
const readonlyValues = computed(() => valueRow.value?.payload ?? {})

// Hide the whole card when there's nothing to show.
const hasFields = computed(() =>
  props.editable ? liveSchema.value.length > 0 : readonlySchema.value.length > 0,
)

// ─── Local edit buffer + autosave ─────────────────────────────────────────────
// Deep-clone plain structures; share non-plain objects (luxon DateTime is
// immutable) by reference so date fields survive the round-trip.
function deepClonePlain(v) {
  if (Array.isArray(v)) return v.map(deepClonePlain)
  if (v && typeof v === 'object' && (v.constructor === Object || v.constructor === undefined)) {
    const out = {}
    for (const k in v) out[k] = deepClonePlain(v[k])
    return out
  }
  return v
}

const formData = ref({})
// Seed exactly once per entity from the loaded value row, then ignore echoes
// (incl. our own saves) so an in-flight edit is never clobbered.
const seededEntityId = ref(null)
watch(
  valueRow,
  (row) => {
    if (row === undefined) return // still loading
    if (seededEntityId.value === props.entityId) return
    formData.value = row?.payload ? deepClonePlain(row.payload) : {}
    seededEntityId.value = props.entityId
  },
  { immediate: true },
)

const saving = ref(false)
const saveError = ref(null)

const saveValues = useLiveMutation(async (db, { payload, schema }) => {
  const frozen = await freezeOptionLabels(db, schema, payload)
  let row = await db.EntityFieldValue.where('[entityType+entityId]', [
    props.entityType,
    props.entityId,
  ]).first()
  if (!row) {
    row = db.EntityFieldValue.create({
      entityType: props.entityType,
      entityId: props.entityId,
      payload: frozen,
      formSchema: schema,
    })
  } else {
    row.payload = frozen
    row.formSchema = schema
  }
  await row.save()
  return row
})

async function persist() {
  saving.value = true
  saveError.value = null
  try {
    await saveValues({
      payload: deepClonePlain(formData.value),
      schema: deepClonePlain(liveSchema.value),
    })
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

const debouncedSave = useDebounceFn(persist, 600)

watch(
  formData,
  () => {
    if (!props.editable) return
    if (seededEntityId.value !== props.entityId) return // not seeded yet
    debouncedSave()
  },
  { deep: true },
)
</script>

<template>
  <div
    v-if="hasFields"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5"
  >
    <div class="tw:flex tw:items-center tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4">
      <BaseText variant="overline">{{ title }}</BaseText>
      <span
        class="tw:text-micro tw:rounded tw:bg-gray-100 tw:text-secondary tw:px-1.5 tw:py-0.5 tw:font-normal tw:normal-case"
        :title="`Custom fields configured for ${customFieldEntityLabel(entityType)}`"
      >
        Custom
      </span>
      <BaseSpinner v-if="saving" size="xs" class="tw:ml-auto" />
    </div>

    <DynamicForm v-if="editable" v-model="formData" :fields="liveSchema" />
    <FormSchemaReadonlyView v-else :fields="readonlySchema" :values="readonlyValues" />

    <p v-if="saveError" class="tw:text-xs tw:text-red-600 tw:mt-2">{{ saveError }}</p>
  </div>
</template>
