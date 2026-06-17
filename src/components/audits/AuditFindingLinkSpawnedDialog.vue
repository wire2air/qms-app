<script setup>
/**
 * Attach an existing NC / CAPA / TrainingInstance / ChangeRequest to a
 * finding. Single dialog parameterised by `kind`; the picker list
 * queries the right SyncEngine model, the search filter is uniform
 * across all four (number / title contains the query).
 *
 * Auto-create from finding context (mint a fresh NC + link in one
 * step) is deferred to a polish phase — landing this means audit
 * teams can already close the loop today by creating the corrective
 * action via the normal create flow elsewhere, then attaching here.
 */
import { IconLink } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // Single-finding mode (most callers). Either `finding` OR `findings`.
  finding: { type: Object, default: null },
  // Multi-finding mode: link the picked record to every finding in the list
  // (e.g. "attach these 3 failed-requirement findings to one existing CAPA").
  findings: { type: Array, default: null },
  // 'NC' | 'CAPA' | 'TRAINING' | 'CR' — picked by the parent dropdown.
  kind: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue', 'linked'])

// Normalised target list — the findings this link applies to.
const targetFindings = computed(() =>
  props.findings?.length ? props.findings : props.finding ? [props.finding] : [],
)

const toast = useToast()

// Kind config: how to look the list up + display each row. Mirrors
// the BE controller's SPAWN_KIND_MAP, but FE-flavoured (SyncEngine
// model name + label / search-field accessors).
const KIND_CONFIG = {
  NC: {
    label: 'Nonconformance',
    pluralLabel: 'NCs',
    modelName: 'Nonconformance',
    numberAccessor: (row) => row.ncNumber,
    titleAccessor: (row) => row.title,
  },
  CAPA: {
    label: 'CAPA',
    pluralLabel: 'CAPAs',
    modelName: 'Capa',
    numberAccessor: (row) => row.capaNumber,
    titleAccessor: (row) => row.title,
  },
  TRAINING: {
    label: 'Training Instance',
    pluralLabel: 'Training Instances',
    modelName: 'TrainingInstance',
    // TrainingInstance lacks a per-tenant number column today — the
    // SyncEngine model carries a `name` + parent Training reference.
    numberAccessor: (row) => row.id?.slice(0, 8),
    titleAccessor: (row) => row.name || row.title || row.id,
  },
  CR: {
    label: 'Change Request',
    pluralLabel: 'Change Requests',
    modelName: 'ChangeRequest',
    numberAccessor: (row) => row.crNumber,
    titleAccessor: (row) => row.title,
  },
}

const config = computed(() => KIND_CONFIG[props.kind] || null)

const search = ref('')
const selectedTargetId = ref(null)
const linking = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      search.value = ''
      selectedTargetId.value = null
    }
  },
)

// Pull the candidate list reactively keyed on `kind`. Sort newest
// first so the just-created target is the obvious pick. Limit to
// 50 — the search input narrows further as the user types.
const candidates = useLiveQueryWithDeps(
  [() => props.kind, () => search.value],
  async (db, [kind, q]) => {
    const cfg = KIND_CONFIG[kind]
    if (!cfg) return []
    const rows = await db[cfg.modelName].where().exec()
    const sorted = rows.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
    const lower = (q || '').toLowerCase().trim()
    const filtered = lower
      ? sorted.filter((r) => {
          const num = String(cfg.numberAccessor(r) || '').toLowerCase()
          const title = String(cfg.titleAccessor(r) || '').toLowerCase()
          return num.includes(lower) || title.includes(lower)
        })
      : sorted
    return filtered.slice(0, 50)
  },
  { initial: [] },
)

function close() {
  emit('update:modelValue', false)
}

async function handleLink() {
  if (!selectedTargetId.value || linking.value) return
  const list = targetFindings.value
  if (!list.length) return
  linking.value = true
  try {
    // One link call per finding — all point at the same picked record
    // (server upserts spawned_*_id, so this is idempotent per finding).
    for (const f of list) {
      await post(`/v1/services/auditFindings/${f.id}/link`, {
        kind: props.kind,
        targetId: selectedTargetId.value,
      })
    }
    const n = list.length
    toast.success(
      `${config.value.label} linked to ${n} finding${n === 1 ? '' : 's'}`,
    )
    emit('linked', { kind: props.kind, targetId: selectedTargetId.value, count: n })
    close()
  } catch (e) {
    toast.error(e.message || 'Failed to link record')
  } finally {
    linking.value = false
  }
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    :title="`Link ${config?.label ?? 'Record'} to Finding`"
    maxWidth="lg"
    @update:modelValue="close"
  >
    <div v-if="!config" class="tw:text-sm tw:text-red-600">
      Unknown record kind: {{ kind }}
    </div>
    <div v-else class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <div
        class="tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:p-3 tw:text-xs tw:text-blue-800"
      >
        <template v-if="targetFindings.length === 1">
          <strong>Linking to:</strong> {{ targetFindings[0].findingNumber }} — {{ targetFindings[0].description }}
        </template>
        <template v-else>
          <strong>Linking to {{ targetFindings.length }} findings:</strong>
          {{ targetFindings.map((f) => f.findingNumber).join(', ') }}
        </template>
      </div>

      <BaseField>
        <template #label>Search {{ config.pluralLabel }}</template>
        <template #default="{ id: fieldId }">
          <BaseTextInput :id="fieldId" v-model="search" :placeholder="`Search by number or title…`" />
        </template>
      </BaseField>

      <div
        v-if="!candidates.length"
        class="tw:py-10 tw:text-center tw:text-sm tw:text-secondary tw:italic"
      >
        No {{ config.pluralLabel }} match this search. Create one via the {{ config.label }}
        page first, then come back to link it.
      </div>

      <div
        v-else
        class="tw:flex tw:flex-col tw:divide-y tw:divide-divider tw:max-h-96 tw:overflow-y-auto tw:border tw:border-divider tw:rounded-lg"
      >
        <button
          v-for="row in candidates"
          :key="row.id"
          type="button"
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:text-left tw:cursor-pointer tw:transition-colors tw:bg-white tw:border-0 tw:w-full"
          :class="
            selectedTargetId === row.id
              ? 'tw:bg-primary/5 tw:border-l-4 tw:border-primary'
              : 'tw:hover:bg-main-hover/40'
          "
          @click="selectedTargetId = row.id"
        >
          <div class="tw:flex tw:flex-col tw:gap-0.5 tw:flex-1 tw:min-w-0">
            <div class="tw:flex tw:items-center tw:gap-2">
              <code class="tw:text-xs tw:font-mono tw:text-secondary">
                {{ config.numberAccessor(row) }}
              </code>
              <span class="tw:text-sm tw:font-medium tw:truncate">
                {{ config.titleAccessor(row) }}
              </span>
            </div>
            <div class="tw:text-[11px] tw:text-secondary">
              {{ row.statusId || '—' }}
              <span v-if="row.createdAt"> · {{ row.createdAt.formatDate('date') }}</span>
            </div>
          </div>
          <IconLink
            v-if="selectedTargetId === row.id"
            :size="16"
            class="tw:text-primary tw:shrink-0 tw:mt-1"
          />
        </button>
      </div>
    </div>
    <template #footer>
      <BaseDialogFooter
        :submitLabel="`Link ${config?.label ?? 'Record'}`"
        :loading="linking"
        :disabled="!selectedTargetId"
        @cancel="close"
        @submit="handleLink"
      />
    </template>
  </BaseDialog>
</template>
