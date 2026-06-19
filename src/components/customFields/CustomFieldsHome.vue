<script setup>
/**
 * Custom Fields admin (Settings → Custom Fields). Pick an entity, author its
 * custom-field schema with the shared FormBuilder, and save it to that entity's
 * EntityFieldSet. The fields then render on every record of that type via
 * <CustomFieldsCard> ("Additional information").
 *
 * Full-canvas page (the FormBuilder owns its own header + Save button), so the
 * page wrapper hides the app MainHeader.
 */
import { CUSTOM_FIELD_ENTITIES, customFieldEntityLabel } from '@/utils/customFieldEntities.js'

const toast = useToast()

const sets = useLiveQuery(async (db) => db.EntityFieldSet.where().exec(), {
  models: ['EntityFieldSet'],
})
const loading = computed(() => sets.value === undefined)

const setByEntity = computed(() => {
  const map = {}
  for (const s of sets.value ?? []) map[s.entityType] = s
  return map
})

const selectedEntity = ref(CUSTOM_FIELD_ENTITIES[0].value)

const entityTabs = computed(() =>
  CUSTOM_FIELD_ENTITIES.map((e) => {
    const count = setByEntity.value[e.value]?.schema?.length ?? 0
    return { value: e.value, label: e.label, badge: count || undefined }
  }),
)

const currentSchema = computed(() => {
  const schema = setByEntity.value[selectedEntity.value]?.schema
  return Array.isArray(schema) ? schema : []
})

const isSaving = ref(false)

const saveSet = useLiveMutation(async (db, { entityType, schema }) => {
  let set = await db.EntityFieldSet.where('entityType', entityType).first()
  if (!set) {
    set = db.EntityFieldSet.create({ entityType, schema })
  } else {
    set.schema = schema
  }
  await set.save()
  return set
})

async function saveSchema(schemaData) {
  isSaving.value = true
  try {
    await saveSet({ entityType: selectedEntity.value, schema: schemaData })
    toast.success(`Custom fields saved for ${customFieldEntityLabel(selectedEntity.value)}`)
  } catch (e) {
    toast.error(e.message || 'Failed to save custom fields')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full tw:overflow-hidden">
    <!-- Entity picker -->
    <div class="tw:shrink-0 tw:px-4 tw:pt-3 tw:bg-sidebar tw:border-b tw:border-divider">
      <BaseTabs v-model="selectedEntity" :tabs="entityTabs" ariaLabel="Custom field entities" />
    </div>

    <!-- Builder for the selected entity -->
    <div class="tw:flex-1 tw:min-h-0 tw:relative">
      <div
        v-if="loading"
        class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:h-full"
      >
        <BaseSpinner size="lg" />
        <div class="tw:text-sm tw:text-secondary tw:mt-3">Loading…</div>
      </div>

      <FormBuilder
        v-else
        :key="selectedEntity"
        :title="`Custom Fields — ${customFieldEntityLabel(selectedEntity)}`"
        :initialSchema="currentSchema"
        showSectionPlacement
        @save="saveSchema"
      />

      <!-- Saving overlay -->
      <div
        v-if="isSaving"
        class="tw:absolute tw:inset-0 tw:bg-main/60 tw:flex tw:flex-col tw:items-center tw:justify-center tw:z-raised"
      >
        <BaseSpinner size="lg" />
        <div class="tw:text-sm tw:text-secondary tw:mt-4">Saving…</div>
      </div>
    </div>
  </div>
</template>
