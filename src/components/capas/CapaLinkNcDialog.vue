<script setup>
/**
 * Link existing Nonconformances to this CAPA (user request 2026-08-17).
 *
 * Until now the NC → CAPA link could only be made one way: raising the CAPA
 * *from* an NC. In practice a CAPA is often opened first, or a second NC turns
 * out to share the same root cause — and there was no way to say so.
 *
 * MANY NCs to one CAPA, deliberately. That is the real shape (many complaints
 * feed one NC; many NCs feed one CAPA), and record_links already models it —
 * nothing here needed a schema change. The panel that displays lineage already
 * renders every link, so adding rows is the whole job.
 *
 * Writes RecordLink rows as Nonconformance → Capa with relation CAUSED, the
 * same shape the create-from-NC path writes, so both routes produce lineage
 * that reads identically.
 */
import { post } from '@/api'
import { IconSearch, IconLink } from '@tabler/icons-vue'

const props = defineProps({
  capaId: { type: String, required: true },
})

const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const search = ref('')
const selectedIds = ref([])
const saving = ref(false)

watch(show, (open) => {
  if (!open) return
  search.value = ''
  selectedIds.value = []
})

// Already linked — excluded from the pool rather than offered and then
// rejected by the unique index.
const existingLinks = useLiveQueryWithDeps(
  [() => props.capaId],
  async (db, [id]) => (id ? db.RecordLink.where('[toType+toId]', ['Capa', id]).exec() : []),
  { models: ['RecordLink'], initial: [] },
)
const linkedNcIds = computed(
  () =>
    new Set(
      existingLinks.value.filter((l) => l.fromType === 'Nonconformance').map((l) => l.fromId),
    ),
)

const candidates = useLiveQueryWithDeps(
  [() => search.value, () => linkedNcIds.value.size],
  async (db, [q]) => {
    const rows = (await db.Nonconformance.where().exec()).filter(
      (n) => !linkedNcIds.value.has(n.id),
    )
    const needle = String(q ?? '')
      .trim()
      .toLowerCase()
    const matched = needle
      ? rows.filter(
          (n) =>
            (n.ncNumber ?? '').toLowerCase().includes(needle) ||
            (n.title ?? '').toLowerCase().includes(needle),
        )
      : rows
    return matched
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, 50)
  },
  { models: ['Nonconformance', 'RecordLink'], initial: [] },
)

function toggle(id) {
  const i = selectedIds.value.indexOf(id)
  if (i >= 0) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

// REST, not the SyncEngine. `app_user` holds SELECT and nothing else on
// record_links, so the GraphQL write this used to attempt was refused
// ("permission denied for table record_links") and linking never worked at all
// — found 2026-08-29 while building the generic picker. The endpoint authorizes
// both sides, which is why the table is server-write-only in the first place.
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
const createLink = (payload) => post('/v1/services/record-links', payload)

async function submit() {
  if (!selectedIds.value.length || saving.value) return
  saving.value = true
  let linked = 0
  const failures = []
  try {
    for (const ncId of selectedIds.value) {
      try {
        await createLink({
          fromType: 'Nonconformance',
          fromId: ncId,
          toType: 'Capa',
          toId: props.capaId,
          relation: 'CAUSED',
        })
        linked += 1
      } catch (e) {
        // One rejected link must not abandon the others — most likely a
        // duplicate that slipped past the filter on a stale read.
        failures.push(e?.message || 'could not be linked')
      }
    }
    if (linked) toast.success(`Linked ${linked} nonconformance${linked !== 1 ? 's' : ''}.`)
    if (failures.length) toast.error(`${failures.length} could not be linked.`)
    if (linked) show.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Link nonconformances" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <BaseCaption>
        Pick the nonconformances this CAPA addresses. More than one is normal — several NCs sharing
        a root cause are corrected by a single CAPA.
      </BaseCaption>

      <div class="tw:relative">
        <IconSearch
          :size="16"
          class="tw:pointer-events-none tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
        />
        <BaseTextInput
          v-model="search"
          placeholder="Search by NC number or title…"
          class="tw:pl-9"
        />
      </div>

      <div class="tw:max-h-80 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-divider">
        <label
          v-for="nc in candidates"
          :key="nc.id"
          class="tw:flex tw:cursor-pointer tw:items-center tw:gap-3 tw:border-b tw:border-divider tw:px-3 tw:py-2 tw:last:border-b-0 tw:hover:bg-main-hover"
        >
          <input
            type="checkbox"
            class="tw:accent-primary"
            :checked="selectedIds.includes(nc.id)"
            @change="toggle(nc.id)"
          />
          <span class="tw:min-w-0 tw:flex-1">
            <span class="tw:block tw:truncate tw:text-sm tw:text-on-main">{{ nc.title }}</span>
            <span class="tw:text-xs tw:text-secondary">{{ nc.ncNumber || 'Draft' }}</span>
          </span>
          <NcStatusBadgeById v-if="nc.statusId" :statusId="nc.statusId" />
        </label>

        <p
          v-if="!candidates.length"
          class="tw:px-3 tw:py-6 tw:text-center tw:text-sm tw:text-secondary"
        >
          {{
            search
              ? 'No nonconformances match that search.'
              : 'Every nonconformance is already linked to this CAPA.'
          }}
        </p>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :submitLabel="
          selectedIds.length ? `Link ${selectedIds.length} selected` : 'Link nonconformances'
        "
        :loading="saving"
        :disabled="!selectedIds.length || saving"
        @cancel="close"
        @submit="submit"
      >
        <template #icon><IconLink :size="14" /></template>
      </BaseDialogFooter>
    </template>
  </BaseDialog>
</template>
