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

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="equipment"
    :required="required"
    :multiple="multiple"
    :nullLabel="nullLabel"
    :disabled="disabled"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <EquipmentBadgeById
              v-for="equipmentId in getArray()"
              :key="equipmentId"
              :equipmentId="equipmentId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(equipmentId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            — All equipment —
          </span>
        </template>
        <template v-else>
          <EquipmentBadgeById
            v-if="modelValue"
            :equipmentId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            — All equipment —
          </span>
        </template>
      </slot>
    </template>

    <template #item="{ item }">
      <div class="tw:flex tw:flex-col">
        <span class="tw:flex tw:items-center tw:gap-1.5">
          <span>{{ item.name }}</span>
          <span
            v-if="item.statusId === 'OUT_OF_SERVICE'"
            class="tw:text-[10px] tw:font-bold tw:rounded tw:bg-amber-100 tw:text-amber-700 tw:px-1 tw:py-0.5"
          >
            Out of service
          </span>
        </span>
        <span v-if="item.code" class="tw:text-xs tw:text-placeholder tw:font-mono">
          {{ item.code }}
        </span>
      </div>
    </template>
  </BaseSelectMenu>
</template>
