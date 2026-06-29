<script setup>
/**
 * EquipmentSelectMenu — entity picker for the Equipment table. Used by
 * the CreateLogBookDialog + LogBookDetailPage to associate a log book
 * with a piece of equipment (calibration / PM / equipment-specific
 * logs).
 *
 * Hides RETIRED equipment by default since they shouldn't be the
 * subject of new log books. Pass `includeRetired` to override for
 * admin / archival views.
 */
const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— All equipment —' },
  includeRetired: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const equipment = useLiveQuery(
  async (db) => {
    const rows = await db.Equipment.where().exec()
    return rows
      .filter((e) => props.includeRetired || e.statusId !== 'RETIRED')
      .map((e) => ({
        id: e.id,
        name: e.name,
        code: e.code,
        statusId: e.statusId,
      }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  },

  { models: ['Equipment'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="equipment"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :nullLabel="nullLabel"
    :disabled="disabled"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <EquipmentBadgeById
          v-for="o in options"
          :key="o.value"
          :equipmentId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>

    <template #option="{ opt }">
      <div class="tw:flex tw:flex-col">
        <span class="tw:flex tw:items-center tw:gap-1.5">
          <span>{{ opt.raw.name }}</span>
          <span
            v-if="opt.raw.statusId === 'OUT_OF_SERVICE'"
            class="tw:text-micro tw:font-bold tw:rounded tw:bg-amber-100 tw:text-amber-700 tw:px-1 tw:py-0.5"
          >
            Out of service
          </span>
        </span>
        <span v-if="opt.raw.code" class="tw:text-xs tw:text-placeholder tw:font-mono">
          {{ opt.raw.code }}
        </span>
      </div>
    </template>
  </BaseSelect>
</template>
