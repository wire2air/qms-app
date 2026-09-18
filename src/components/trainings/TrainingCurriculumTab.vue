<script setup>
/**
 * Curriculum tab on a training's detail page (replaces the old Assignees tab).
 * Shows the curricula this training belongs to and, for each, the roles that
 * therefore receive it. Managing membership is done here via "Add to
 * curriculum" (also on the header) or on the Training Curriculum page.
 */
import { IconPlus, IconBook } from '@tabler/icons-vue'

const props = defineProps({
  trainingId: { type: String, required: true },
  trainingTitle: { type: String, default: '' },
  canUpdate: { type: Boolean, default: false },
})

const memberships = useLiveQueryWithDeps(
  [() => props.trainingId],
  async (db, [tid]) => (tid ? db.CurriculumTraining.where('trainingId', tid).exec() : []),
  { models: ['CurriculumTraining'], initial: [] },
)
const roleCurricula = useLiveQuery((db) => db.RoleCurriculum.where().exec(), {
  models: ['RoleCurriculum'],
  initial: [],
})

const curriculumIds = computed(() => memberships.value.map((m) => m.curriculumId))
const rolesFor = (cid) => roleCurricula.value.filter((rc) => rc.curriculumId === cid)

const showAdd = ref(false)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div class="tw:flex tw:items-center tw:justify-between">
      <p class="tw:text-sm tw:text-secondary">
        Part of
        <strong>{{ curriculumIds.length }}</strong>
        curricul{{ curriculumIds.length === 1 ? 'um' : 'a' }}. Everyone whose role is mapped to a
        curriculum below is assigned this training.
      </p>
      <BaseButton v-if="canUpdate" variant="outline" size="sm" @click="showAdd = true">
        <IconPlus :size="14" class="tw:mr-1" /> Add to curriculum
      </BaseButton>
    </div>

    <div
      v-if="!curriculumIds.length"
      class="tw:rounded-lg tw:border tw:border-dashed tw:border-divider tw:p-8 tw:text-center tw:text-secondary tw:text-sm"
    >
      This training isn't part of any curriculum yet.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="cid in curriculumIds"
        :key="cid"
        class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:px-4 tw:py-3 tw:flex tw:items-center tw:gap-3"
      >
        <IconBook :size="16" class="tw:text-primary tw:shrink-0" />
        <CurriculumBadgeById :curriculumId="cid" />
        <div class="tw:flex-1" />
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:justify-end">
          <span class="tw:text-xs tw:text-secondary">Roles:</span>
          <RoleBadgeById v-for="rc in rolesFor(cid)" :key="rc.id" :roleId="rc.roleId" />
          <span v-if="!rolesFor(cid).length" class="tw:text-xs tw:text-secondary tw:italic">
            none mapped
          </span>
        </div>
      </div>
    </div>

    <TrainingAddToCurriculumDialog
      v-model="showAdd"
      :trainingId="trainingId"
      :trainingTitle="trainingTitle"
    />
  </div>
</template>
