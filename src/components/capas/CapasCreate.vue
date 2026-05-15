<script setup>
import { DateTime } from 'luxon'
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession } from '@/utils/currentSession.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const capaWorkflowVersionSelectRef = ref(null)
const saving = ref(false)

const presetNcId = computed(() => {
  const q = route.query?.ncId
  return typeof q === 'string' ? q : null
})

const sourceNc = useLiveQueryWithDeps([() => presetNcId.value], async (db, [id]) => {
  if (!id) return null
  return db.Nonconformance.findByPk(id)
})

const form = ref({
  title: '',
  description: '',
  siteId: null,
  departmentId: null,
  typeId: null,
  // Source kind — a CapaSource id (NC / INTERNAL_AUDIT / …). When the CAPA
  // was spawned from a specific row, `sourceId` below points at it.
  sourceType: presetNcId.value ? 'NC' : null,
  priorityId: 'MEDIUM',
  initiatedAt: DateTime.now(),
  dueDate: null,
  ownerId: currentSession.value?.userId ?? null,
  // Optional pointer to the originating row when source_type maps to a known
  // table (e.g. source_type='NC' → source_id = a Nonconformance id).
  sourceId: presetNcId.value || null,
  rootCauseCategoryId: null,
  rootCause: '',
  correctiveAction: '',
  preventiveAction: '',
  workflowVersionId: null,
})

// When the source NC loads, seed the title / site / department / department so
// the user doesn't have to retype the context.
watch(sourceNc, (nc) => {
  if (!nc) return
  if (!form.value.title) form.value.title = `CAPA for ${nc.ncNumber || nc.title}`
  if (!form.value.siteId) form.value.siteId = nc.siteId
  if (!form.value.departmentId) form.value.departmentId = nc.departmentId
  if (!form.value.rootCauseCategoryId && nc.rootCauseCategoryId) {
    form.value.rootCauseCategoryId = nc.rootCauseCategoryId
  }
  if (!form.value.rootCause && nc.rootCause) form.value.rootCause = nc.rootCause
})

watch(
  () => form.value.siteId,
  () => {
    form.value.departmentId = null
  },
)

function handleSubmit() {
  if (!form.value.title) {
    toast.notify({ type: 'negative', message: 'Title is required' })
    return
  }
  if (!form.value.priorityId) {
    toast.notify({ type: 'negative', message: 'Priority is required' })
    return
  }
  if (!form.value.typeId) {
    toast.notify({ type: 'negative', message: 'Type is required' })
    return
  }
  if (!form.value.sourceType) {
    toast.notify({ type: 'negative', message: 'Source is required' })
    return
  }
  if (!form.value.siteId) {
    toast.notify({ type: 'negative', message: 'Site is required' })
    return
  }
  if (!form.value.departmentId) {
    toast.notify({ type: 'negative', message: 'Department is required' })
    return
  }
  if (!form.value.ownerId) {
    toast.notify({ type: 'negative', message: 'Owner is required' })
    return
  }
  if (!form.value.initiatedAt) {
    toast.notify({ type: 'negative', message: 'Initiated date is required' })
    return
  }
  if (!form.value.workflowVersionId) {
    toast.notify({ type: 'negative', message: 'Workflow version is required' })
    return
  }

  capaWorkflowVersionSelectRef.value.submit()
}

async function handleReviewersConfirmed(reviewers) {
  saving.value = true
  try {
    const response = await post('/v1/services/capas', { ...form.value, reviewers })
    router.push(getCompanyPath(`/capas/${response.capa.id}`))
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to create CAPA' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs
        :items="[
          { label: 'CAPAs', to: getCompanyPath('/capas') },
          { label: 'Create CAPA' },
        ]"
      />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton variant="primary" :disabled="saving" @click="handleSubmit">Submit</BaseButton>
    </SafeTeleport>

    <div class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:max-w-3xl tw:mx-auto tw:p-6 tw:flex tw:flex-col tw:gap-4">
        <!-- Source NC chip -->
        <div
          v-if="sourceNc"
          class="tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-blue-800 tw:rounded-lg tw:px-4 tw:py-2 tw:text-sm"
        >
          Linked to Nonconformance
          <RouterLink
            :to="getCompanyPath(`/nonconformances/${sourceNc.id}`)"
            class="tw:font-mono tw:font-semibold tw:underline tw:ml-1"
          >
            {{ sourceNc.ncNumber }}
          </RouterLink>
          — {{ sourceNc.title }}
        </div>

        <!-- Basic information -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Basic information
          </div>
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Title <span class="tw:text-red-500">*</span>
              </label>
              <BaseTextInput v-model="form.title" placeholder="Describe the CAPA…" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Description</label>
              <BaseTextarea
                v-model="form.description"
                placeholder="Provide context for the CAPA…"
                :rows="4"
              />
            </div>
          </div>
        </div>

        <!-- Classification -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Classification
          </div>
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Site <span class="tw:text-red-500">*</span>
              </label>
              <SiteSelectMenu v-model="form.siteId" required />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Department <span class="tw:text-red-500">*</span>
              </label>
              <DepartmentSelectMenu v-model="form.departmentId" :siteId="form.siteId" required />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                CAPA Type <span class="tw:text-red-500">*</span>
              </label>
              <CapaTypeSelectMenu v-model="form.typeId" required />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Source <span class="tw:text-red-500">*</span>
              </label>
              <CapaSourceSelectMenu v-model="form.sourceType" required />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Priority <span class="tw:text-red-500">*</span>
              </label>
              <div class="tw:flex tw:gap-2">
                <BaseButton
                  v-for="p in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']"
                  :key="p"
                  class="tw:flex-1 tw:justify-center"
                  :variant="form.priorityId === p ? 'primary' : 'outline'"
                  @click="form.priorityId = p"
                >
                  {{ p.charAt(0) + p.slice(1).toLowerCase() }}
                </BaseButton>
              </div>
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Initiated date <span class="tw:text-red-500">*</span>
              </label>
              <BaseDatePicker v-model="form.initiatedAt" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Due date</label>
              <BaseDatePicker v-model="form.dueDate" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1 tw:col-span-2 tw:md:col-span-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Owner <span class="tw:text-red-500">*</span>
              </label>
              <UserSelectMenu v-model="form.ownerId" required />
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Actions
            <span class="tw:normal-case tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
          </div>
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Root cause</label>
              <BaseTextarea
                v-model="form.rootCause"
                placeholder="What caused this?"
                :rows="3"
              />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Corrective action</label>
              <BaseTextarea
                v-model="form.correctiveAction"
                placeholder="How will the existing problem be eliminated?"
                :rows="3"
              />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Preventive action</label>
              <BaseTextarea
                v-model="form.preventiveAction"
                placeholder="How will recurrence be prevented?"
                :rows="3"
              />
            </div>
          </div>
        </div>

        <!-- Workflow -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Workflow
          </div>
          <CAPAWorkflowVersionSelect
            ref="capaWorkflowVersionSelectRef"
            v-model="form.workflowVersionId"
            @submit="handleReviewersConfirmed"
          />
        </div>
      </div>
    </div>
  </div>
</template>
