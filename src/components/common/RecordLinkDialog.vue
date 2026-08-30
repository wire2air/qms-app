<script setup>
/**
 * Link related records — the generic cross-module picker (user request
 * 2026-08-29).
 *
 * Pick a module (any built-in record type, or one of this company's promoted
 * form modules), search it by text or record number, tick as many results as
 * you like, and link them. That is how an NC gets related to a Deviation which
 * is related to a Filling Instruction: nothing here knows those modules exist.
 *
 * Search runs against the existing full-text endpoint, which already indexes
 * every record type — module records included — and applies the caller's own
 * RLS, so the picker can only ever offer records you may already read. The
 * server checks that again on link (utils/recordEntity + recordLinks
 * controller); this is convenience, not the gate.
 *
 * Links are written over REST, never the SyncEngine: `app_user` holds SELECT
 * and nothing else on record_links, because authorizing the write means
 * checking BOTH records — a cross-module question no policy on record_links
 * can answer.
 */
// Action RPCs (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post } from '@/api'
import { IconSearch, IconLink } from '@tabler/icons-vue'

const props = defineProps({
  /** The record being annotated — its entity type ('Capa', 'deviation', …). */
  type: { type: String, required: true },
  id: { type: String, required: true },
})

const emit = defineEmits(['linked'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const entities = ref([])
const entityType = ref(null)
const search = ref('')
const results = ref([])
const searching = ref(false)
const selected = ref([])
const saving = ref(false)

// Everything already linked to this record, either direction — offered again
// it would just be refused as a duplicate.
const existing = useLiveQueryWithDeps(
  [() => props.type, () => props.id],
  async (db, [type, id]) => {
    if (!id) return []
    const [from, to] = await Promise.all([
      db.RecordLink.where('[fromType+fromId]', [type, id]).exec(),
      db.RecordLink.where('[toType+toId]', [type, id]).exec(),
    ])
    return [...from, ...to]
  },
  { models: ['RecordLink'], initial: [] },
)
const linkedKeys = computed(
  () =>
    new Set(
      existing.value.flatMap((l) => [`${l.fromType}:${l.fromId}`, `${l.toType}:${l.toId}`]),
    ),
)

watch(show, async (open) => {
  if (!open) {
    search.value = ''
    results.value = []
    selected.value = []
    return
  }
  if (!entities.value.length) {
    try {
      const data = await get('/v1/services/record-links/entities')
      entities.value = data?.entities ?? []
    } catch (e) {
      toast.error(e?.message || 'Could not load record types')
    }
  }
  if (!entityType.value) entityType.value = entities.value[0]?.entityType ?? null
})

const runSearch = useDebounceFn(async () => {
  const q = search.value.trim()
  if (q.length < 2 || !entityType.value) {
    results.value = []
    return
  }
  searching.value = true
  try {
    const data = await get('/v1/services/search', {
      params: { q, types: entityType.value, limit: 20 },
    })
    // Never offer the record itself, nor one already linked.
    results.value = (data?.results ?? []).filter(
      (r) =>
        !(r.entityId === props.id) && !linkedKeys.value.has(`${entityType.value}:${r.entityId}`),
    )
  } catch (e) {
    toast.error(e?.message || 'Search failed')
  } finally {
    searching.value = false
  }
}, 300)

watch([search, entityType], () => {
  selected.value = []
  runSearch()
})

function toggle(entityId) {
  selected.value = selected.value.includes(entityId)
    ? selected.value.filter((x) => x !== entityId)
    : [...selected.value, entityId]
}

async function submit() {
  if (!selected.value.length || saving.value) return
  saving.value = true
  let linked = 0
  const failures = []
  try {
    for (const toId of selected.value) {
      try {
        await post('/v1/services/record-links', {
          fromType: props.type,
          fromId: props.id,
          toType: entityType.value,
          toId,
          relation: 'RELATED',
        })
        linked += 1
      } catch (e) {
        // One refusal must not abandon the rest — the commonest is a record
        // the caller may read but not link.
        failures.push(e?.message || 'could not be linked')
      }
    }
    if (linked) {
      toast.success(`Linked ${linked} record${linked !== 1 ? 's' : ''}.`)
      emit('linked')
    }
    if (failures.length) toast.error(failures[0])
    if (linked) show.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Link related records" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <div class="tw:flex tw:flex-col tw:sm:flex-row tw:gap-2">
        <div class="tw:sm:w-56 tw:shrink-0">
          <BaseField label="Record type">
            <BaseSelect
              v-model="entityType"
              :options="entities"
              optionLabel="label"
              optionValue="entityType"
              :required="true"
            />
          </BaseField>
        </div>
        <div class="tw:flex-1 tw:min-w-0">
          <BaseField label="Search">
            <BaseTextInput
              v-model="search"
              placeholder="Record number or any text…"
              :icon="IconSearch"
            />
          </BaseField>
        </div>
      </div>

      <div class="tw:min-h-40 tw:max-h-80 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-divider">
        <p v-if="searching" class="tw:p-3 tw:text-sm tw:text-secondary">Searching…</p>
        <p v-else-if="search.trim().length < 2" class="tw:p-3 tw:text-sm tw:text-secondary">
          Type at least two characters — a record number, a title, or anything in the record.
        </p>
        <p v-else-if="!results.length" class="tw:p-3 tw:text-sm tw:text-secondary">
          Nothing matches, or everything that does is already linked.
        </p>
        <label
          v-for="r in results"
          :key="r.entityId"
          class="tw:flex tw:items-start tw:gap-3 tw:border-b tw:border-divider tw:p-2.5 tw:last:border-b-0 tw:cursor-pointer tw:hover:bg-main-hover"
        >
          <BaseCheckbox
            :modelValue="selected.includes(r.entityId)"
            @update:modelValue="toggle(r.entityId)"
          />
          <span class="tw:flex tw:flex-col tw:min-w-0 tw:gap-0.5">
            <span class="tw:flex tw:items-center tw:gap-2">
              <span class="tw:text-sm tw:font-medium tw:text-on-main">{{ r.code || '—' }}</span>
              <span v-if="r.statusId" class="tw:text-micro tw:uppercase tw:tracking-wide tw:text-secondary">
                {{ r.statusId }}
              </span>
            </span>
            <span class="tw:text-sm tw:text-secondary tw:truncate">{{ r.title }}</span>
          </span>
        </label>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" :disabled="saving" @click="show = false">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="!selected.length || saving" @click="submit">
        <template #icon><IconLink :size="16" /></template>
        {{ saving ? 'Linking…' : `Link ${selected.length || ''}`.trim() }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
