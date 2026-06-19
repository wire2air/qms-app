<script setup>
/**
 * CustomFieldsCreateSection — create-time sibling of CustomFieldsCard. Renders
 * the admin-defined custom fields for `entityType` on a CREATE form, bound to a
 * payload the parent owns (v-model). The entity doesn't exist yet, so values are
 * persisted AFTER creation: the parent calls `persist(entityId)` once it has the
 * new record's id (the seal — schema snapshot + frozen option labels — happens
 * there, mirroring CustomFieldsCard).
 *
 *   <CustomFieldsCreateSection ref="cfRef" entityType="Nonconformance" v-model="cfData" />
 *   // after the record is created:
 *   await cfRef.value?.persist(newId)   // best-effort
 *
 * Renders nothing when no custom fields are defined for the entity.
 */
import DynamicForm from '@/components/form/DynamicForm.js'
import { freezeOptionLabels } from '@/utils/freezeFormPayloadLabels.js'

const props = defineProps({
  entityType: { type: String, required: true },
  title: { type: String, default: 'Additional information' },
})

const payload = defineModel({ type: Object, default: () => ({}) })

const fieldSet = useLiveQueryWithDeps(
  [() => props.entityType],
  async (db, [entityType]) => {
    if (!entityType) return null
    return db.EntityFieldSet.where('entityType', entityType).first()
  },
  { models: ['EntityFieldSet'] },
)

const schema = computed(() => (Array.isArray(fieldSet.value?.schema) ? fieldSet.value.schema : []))
const hasFields = computed(() => schema.value.length > 0)

const formRef = ref(null)

const saveValues = useLiveMutation(async (db, { entityId, payload: data, schema: snapshot }) => {
  const frozen = await freezeOptionLabels(db, snapshot, data)
  const row = db.EntityFieldValue.create({
    entityType: props.entityType,
    entityId,
    payload: frozen,
    formSchema: snapshot,
  })
  await row.save()
  return row
})

// Called by the parent after the record exists. No-op when nothing is defined.
async function persist(entityId) {
  if (!hasFields.value || !entityId) return
  await saveValues({
    entityId,
    payload: payload.value ?? {},
    schema: schema.value,
  })
}

// Gate the parent's submit on required custom fields. Returns true (passes)
// when there are no custom fields. Touches fields so errors render.
async function validate() {
  if (!hasFields.value || !formRef.value) return true
  return await formRef.value.validate()
}

defineExpose({ persist, validate })
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
      >
        Custom
      </span>
    </div>

    <DynamicForm ref="formRef" v-model="payload" :fields="schema" />
  </div>
</template>
