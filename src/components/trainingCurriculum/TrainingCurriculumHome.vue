<script setup>
/**
 * Training Curriculum admin. A curriculum groups Trainings and maps Roles;
 * a new employee (or a document assigned a curriculum) receives every training
 * in the curricula mapped to their role, deduped.
 *
 * Editing is inline: click the name/description to rename; the Trainings and
 * Roles pickers are multiselects whose chips ARE the mapping — adding/removing
 * an option creates/deletes the CurriculumTraining / RoleCurriculum join rows
 * (the join-table diff pattern, no modals).
 */
import { IconPlus, IconTrash, IconBook } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

// Training curriculum is part of the training module in native authz — its RLS
// gates on training:read / training:update (see database/rls.sql). Soft-delete
// is an UPDATE (app_user has no DELETE grant), so canDelete gates on update too.
const canManage = computed(() => isAllowed(['training:update']))
const canDelete = computed(() => isAllowed(['training:update']))

const toast = useToast()
const { confirm } = useConfirm()

const curricula = useLiveQuery((db) => db.Curriculum.where().exec(), {
  models: ['Curriculum'],
  initial: [],
})
const curriculumTrainings = useLiveQuery((db) => db.CurriculumTraining.where().exec(), {
  models: ['CurriculumTraining'],
  initial: [],
})
const roleCurricula = useLiveQuery((db) => db.RoleCurriculum.where().exec(), {
  models: ['RoleCurriculum'],
  initial: [],
})

const sortedCurricula = computed(() =>
  [...(curricula.value || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
)
const trainingsFor = (cid) => (curriculumTrainings.value || []).filter((ct) => ct.curriculumId === cid)
const rolesFor = (cid) => (roleCurricula.value || []).filter((rc) => rc.curriculumId === cid)
const trainingIdsFor = (cid) => trainingsFor(cid).map((ct) => ct.trainingId)
const roleIdsFor = (cid) => rolesFor(cid).map((rc) => rc.roleId)

// ── Create curriculum ────────────────────────────────────────────────────────
const showCreate = ref(false)
const draft = ref({ name: '', description: '' })
const createCurriculum = useLiveMutation(async (db, payload) => {
  const c = db.Curriculum.create(payload)
  await c.save()
  return c
})
function openCreate() {
  draft.value = { name: '', description: '' }
  showCreate.value = true
}
async function saveCurriculum() {
  const name = draft.value.name.trim()
  if (!name) return
  try {
    await createCurriculum({ name, description: draft.value.description.trim() || null })
    showCreate.value = false
  } catch (e) {
    toast.error(e?.message || 'Failed to create curriculum')
  }
}
async function removeCurriculum(c) {
  if (!canDelete.value) return
  const ok = await confirm({
    title: 'Delete curriculum?',
    message: `Delete "${c.name}"? Its training and role mappings are removed. Already-assigned trainings are not affected.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  try {
    for (const ct of trainingsFor(c.id)) await ct.delete()
    for (const rc of rolesFor(c.id)) await rc.delete()
    await c.delete()
  } catch (e) {
    toast.error(e?.message || 'Failed to delete curriculum')
  }
}

// ── Inline name / description edit ────────────────────────────────────────────
const editingId = ref(null)
const editingDescId = ref(null)
async function saveField(c) {
  try {
    if (!c.name?.trim()) c.name = 'Untitled curriculum'
    await c.save()
  } catch (e) {
    toast.error(e?.message || 'Failed to save')
  }
}

// ── Trainings ⇄ curriculum (join-table diff) ─────────────────────────────────
const addCurriculumTraining = useLiveMutation(async (db, { curriculumId, trainingId }) => {
  const ct = db.CurriculumTraining.create({ curriculumId, trainingId })
  await ct.save()
  return ct
})
async function updateTrainings(cid, newIds) {
  if (!canManage.value) return
  const list = newIds || []
  const current = trainingsFor(cid)
  const currentIds = current.map((ct) => ct.trainingId)
  try {
    for (const id of list.filter((id) => !currentIds.includes(id))) {
      await addCurriculumTraining({ curriculumId: cid, trainingId: id })
    }
    for (const ct of current.filter((ct) => !list.includes(ct.trainingId))) {
      await ct.delete()
    }
  } catch (e) {
    toast.error(e?.message || 'Failed to update trainings')
  }
}

// ── Roles ⇄ curriculum (join-table diff) ─────────────────────────────────────
const addRoleCurriculum = useLiveMutation(async (db, { curriculumId, roleId }) => {
  const rc = db.RoleCurriculum.create({ curriculumId, roleId })
  await rc.save()
  return rc
})
async function updateRoles(cid, newIds) {
  if (!canManage.value) return
  const list = newIds || []
  const current = rolesFor(cid)
  const currentIds = current.map((rc) => rc.roleId)
  try {
    for (const id of list.filter((id) => !currentIds.includes(id))) {
      await addRoleCurriculum({ curriculumId: cid, roleId: id })
    }
    for (const rc of current.filter((rc) => !list.includes(rc.roleId))) {
      await rc.delete()
    }
  } catch (e) {
    toast.error(e?.message || 'Failed to update roles')
  }
}
</script>

<template>
  <BaseListLayout
    title="Training Curriculum"
    subtitle="Group trainings into curricula and map roles to them. New employees (and document-assigned curricula) get every training in their role's curricula."
  >
    <template #actions>
      <BaseButton v-if="canManage" variant="primary" @click="openCreate">
        <IconPlus :size="16" class="tw:mr-1" /> New Curriculum
      </BaseButton>
    </template>

    <div
      v-if="!sortedCurricula.length"
      class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:text-secondary tw:p-10 tw:text-center"
    >
      <IconBook :size="28" class="tw:text-secondary/40" />
      <p class="tw:text-sm">No curricula yet.</p>
      <BaseButton v-if="canManage" variant="outline" size="sm" @click="openCreate">
        <IconPlus :size="14" class="tw:mr-1" /> New Curriculum
      </BaseButton>
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-4">
      <div
        v-for="c in sortedCurricula"
        :key="c.id"
        class="tw:rounded-xl tw:border tw:border-divider tw:bg-main tw:shadow-sm tw:overflow-hidden"
      >
        <!-- Header -->
        <div class="tw:flex tw:items-start tw:gap-3 tw:px-5 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover/20">
          <div class="tw:size-9 tw:rounded-lg tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:shrink-0">
            <IconBook :size="18" class="tw:text-primary" />
          </div>
          <div class="tw:flex-1 tw:min-w-0">
            <BaseTextInput
              v-if="editingId === c.id"
              v-model="c.name"
              size="sm"
              autofocus
              placeholder="Curriculum name"
              @keyup.enter="((editingId = null), saveField(c))"
              @blur="((editingId = null), saveField(c))"
            />
            <div
              v-else
              class="tw:font-semibold tw:text-on-main tw:truncate"
              :class="canManage ? 'tw:cursor-text tw:hover:text-primary' : ''"
              :title="canManage ? 'Click to rename' : ''"
              @click="canManage && (editingId = c.id)"
            >
              {{ c.name || 'Untitled curriculum' }}
            </div>
            <BaseTextInput
              v-if="editingDescId === c.id"
              v-model="c.description"
              size="sm"
              placeholder="Description (optional)"
              class="tw:mt-1"
              @keyup.enter="((editingDescId = null), saveField(c))"
              @blur="((editingDescId = null), saveField(c))"
            />
            <div
              v-else
              class="tw:text-xs tw:mt-0.5"
              :class="[
                c.description ? 'tw:text-secondary' : 'tw:text-placeholder tw:italic',
                canManage ? 'tw:cursor-text tw:hover:text-primary' : '',
              ]"
              @click="canManage && (editingDescId = c.id)"
            >
              {{ c.description || (canManage ? 'Add a description' : '') }}
            </div>
          </div>
          <div class="tw:flex tw:items-center tw:gap-3 tw:shrink-0">
            <span class="tw:text-xs tw:text-secondary tw:whitespace-nowrap">
              {{ trainingsFor(c.id).length }} training{{ trainingsFor(c.id).length === 1 ? '' : 's' }}
              · {{ rolesFor(c.id).length }} role{{ rolesFor(c.id).length === 1 ? '' : 's' }}
            </span>
            <button
              v-if="canDelete"
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-bad tw:hover:bg-red-50"
              title="Delete curriculum"
              @click="removeCurriculum(c)"
            >
              <IconTrash :size="16" />
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="tw:px-5 tw:py-4 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-5">
          <div>
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5 tw:block">
              Trainings
            </label>
            <TrainingSelectMenu
              :modelValue="trainingIdsFor(c.id)"
              :multiple="true"
              :disabled="!canManage"
              @update:modelValue="updateTrainings(c.id, $event)"
            />
          </div>
          <div>
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5 tw:block">
              Roles that get this curriculum
            </label>
            <RoleSelectMenu
              :modelValue="roleIdsFor(c.id)"
              :multiple="true"
              :disabled="!canManage"
              @update:modelValue="updateRoles(c.id, $event)"
            />
          </div>
        </div>
      </div>
    </div>

  </BaseListLayout>

  <!-- Create curriculum — outside BaseListLayout so it stays mounted in the
       empty state (else you can't create the first curriculum). -->
  <BaseDialog v-model="showCreate" title="New curriculum" size="sm">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText as="div" variant="overline">Name</BaseText>
        <BaseTextInput v-model="draft.name" placeholder="e.g. Production Onboarding" @keyup.enter="saveCurriculum" />
      </div>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText as="div" variant="overline">Description</BaseText>
        <BaseTextarea v-model="draft.description" :rows="2" placeholder="Optional" />
      </div>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter submitLabel="Create" :disabled="!draft.name.trim()" @cancel="close" @submit="saveCurriculum" />
    </template>
  </BaseDialog>
</template>
