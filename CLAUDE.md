# Qability — Claude Instructions (frontend)

> Frontend-specific rules. For monorepo architecture (api/worker/sync services, the logical-replication → IndexedDB pipeline, backend conventions), see the root [`../../CLAUDE.md`](../../CLAUDE.md). Don't duplicate cross-service context here.

## Rules

Non-negotiable in new and touched code. Migration sections below show what to replace and how.

1. **Auto-imports.** Components from `src/components/`, Vue APIs (`ref`, `computed`, `watch`, `onMounted`, `provide`, `inject`), `vueuse`, and `vue-router` are all auto-imported (see `auto-imports.d.ts`, `components.d.ts`). Don't write explicit imports for them.
2. **Icons are NOT auto-imported.** Always use `@tabler/icons-vue` and import explicitly: `import { IconTrash } from '@tabler/icons-vue'`. Never `@heroicons/vue`, `@material-design-icons`, or any other icon library.
3. **No Quasar in new code.** Don't use `Q*` components or their `W*` wrappers (`WBtn`, `WInput`, etc.). Replace existing usage when you touch a file. See [Migration: Quasar → Tailwind](#migration-quasar--tailwind). Entity-lookup `W*` components (the ones that wrap an entity select) are still allowed until explicitly migrated.
4. **No axios composables for entity CRUD. No provide/inject for data.** Don't import `get`/`post`/`put`/`del` from `@/api` to read or mutate a SyncEngine-modeled record — use `useLiveQuery` + `useLiveMutation` instead. Don't write `provideX()` / `useX()` data-fetching composables. Don't pass full objects as props — components receive an `id` and query/mutate via the syncEngine. **Exception — action RPCs.** Verb-shaped endpoints that aren't entity CRUD (e.g. `POST /v1/services/.../launch`, `POST /v1/services/.../cancel`, `POST /v1/services/.../verify`, secret-return endpoints like `POST /v1/services/ai/pats`) may use `post`/`put`/`del` from `@/api` directly. The test: _is the server response a synced model record, or just an action outcome?_ If the latter, action-RPC is correct. Tag the import with `// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.` See [Migration: axios → syncEngine](#migration-axios--provideinject--syncengine).
5. **`function` keyword.** Define functions with `function foo() {}`, not `const foo = () => {}`.
6. **`defineModel` for v-model.** Don't use the computed-getter/setter pattern.
7. **Tailwind has a `tw:` prefix.** Always: `tw:flex tw:gap-4 tw:rounded-lg`.
8. **No `<form>` elements.** Use `<div>` wrappers with click/change handlers. **But a clickable element must be keyboard-operable** — never `<div class="tw:cursor-pointer" @click>` (not focusable, ignores Enter/Space, no role; fails WCAG 2.1.1/4.1.2). For a clickable row/card/cell use `BaseClickableRow` (renders a `RouterLink` via its `to` prop for nav, or a focusable `role="button"` that fires `click` on Enter/Space); always give it an `aria-label`. Nested actions inside it must `@click.stop`. For a single inline action, use a real `<button>`.
9. **PascalCase component usage** in templates, never kebab-case.
10. **Dates are luxon `DateTime`.** The axios response transformer already converts backend dates to `DateTime` instances. Format with the project-wide `dt.formatDate()` — never `.toFormat()`, `.toISO()`, or any ad-hoc formatting in components.
11. **Soft deletes are automatic.** Never manually filter `!record.deletedAt` — the syncEngine excludes soft-deleted records from queries by default. Use `{ force: true }` only when you explicitly need them (e.g. computing the next version number).
12. **`useLiveMutation` for creates** — don't call `db.Model.create()` + `save()` directly inside a component method.
13. **Use `Base*` first.** `BaseTextInput`, `BaseTextarea`, `BaseColorPicker`, `BaseDialog`, `BaseTable`, `BaseSelectMenu`, `BaseClickableRow`, etc. live in `resource/js/shared/components/`. Reuse before building.
14. **Reuse before adding** — especially badges and select menus, which follow the [triad pattern](#component-pattern-badge-triad-xbadge--xbadgebyid--xselectmenu).
15. **Every page root is `<BasePage>`.** Never set page-level padding, max-width, or section gap by hand (no `tw:p-5`, no ad-hoc `tw:max-w-*`, no `tw:gap-3` at the page root). `BasePage` owns width/padding/rhythm. See [Page layout](#page-layout).

### Feature component naming

Feature folders use a per-feature prefix; pages are camelCase, reusable components are PascalCase:

- `formTemplatesIndex.vue` — provider/route wrapper
- `formTemplatesHome.vue` — main page
- `formTemplatesTable.vue` — display
- `DocumentTypeSelectMenu.vue` — reusable filter

### Select component props

Both flags belong on every entity select wrapper:

```vue
<script setup>
const props = defineProps({
  required: { type: Boolean, default: false }, // when false: include "All X" option (null value)
  multiple: { type: Boolean, default: false },
})
// required=true: auto-select first item
</script>
```

---

## Page layout

Every authenticated app page's root is `<BasePage>` — the single owner of content width, horizontal padding, and vertical rhythm. Pages never hand-pick `tw:p-5`, `tw:max-w-*`, or section `tw:gap-*`. Full design: [`docs/superpowers/specs/2026-06-17-page-layout-system-design.md`](docs/superpowers/specs/2026-06-17-page-layout-system-design.md).

```vue
<BasePage width="standard" :fullHeight="false">
  <PageHeader :icon="IconUsers" title="Users"><template #actions>…</template></PageHeader>
  <BaseFilterBar v-model:search="filters.search">…</BaseFilterBar>
  <PageSection title="Members" :icon="IconUsers">…</PageSection>
  <ContentGrid min="18rem">…stat cards…</ContentGrid>
</BasePage>
```

- **`width`**: `narrow` (detail/forms, 48rem) · `standard` (default, lists, 80rem) · `wide` (dashboards/wide tables, 96rem) · `full` (escape hatch).
- **`fullHeight`**: only when the page owns an internal scroll region (sticky table headers, kanban). Mark the scrolling child `tw:flex-1 tw:min-h-0 tw:overflow-auto`. Otherwise the shell scrolls.
- **`density`**: `comfortable` (default, `gap-6`) · `compact` (`gap-4`).
- **Reuse, don't rebuild:** toolbar → `BaseFilterBar`; tabs → `BaseTabs`; titled groups → `PageSection`; card grids → `ContentGrid`. There is no `PageToolbar`/`PageTabs` — those are `BaseFilterBar`/`BaseTabs`.
- **No page-level horizontal scroll** — only bounded table wrappers (`tw:overflow-x-auto`) scroll.
- **The page title lives in the top bar.** `PageHeader` teleports the icon+title to the bar's left and `#actions` to its right (search sits centered between). Don't hand-roll an in-body `tw:text-3xl` title block, and don't `SafeTeleport to="#main-header-title"`/`#main-header-actions` directly — use `PageHeader`.
- **One width, no inner box.** Don't wrap page content in a bespoke `tw:max-w-* tw:mx-auto` box or add page-level padding inside `BasePage` — content fills `BasePage`'s width and shares one gutter. (Card/dialog padding is fine.)
- **Enforced by `npm run lint:layout`** (runs as part of `npm run lint`) — flags bespoke `max-w` content boxes, direct header teleports, and `PageHeader` without `BasePage`. Genuine exceptions (full-canvas editors, public pages) live in the allowlist in `scripts/check-page-layout.mjs`.
- **List/index pages use whole-page scroll** (no `fullHeight`) — `BaseTable`'s sticky header keeps columns visible. Reserve `fullHeight` for detail/create pages that already have an internal scroll region (sticky toolbar/footer + a `tw:flex-1 tw:min-h-0 tw:overflow-auto` body).
- **Full-canvas editors/designers are exempt** (e.g. `WorkflowEditor`, `FormAssignmentEditor`, the form builder) — a surface that fills the viewport with its own panes/scroll is not a content page; keep its `tw:flex tw:flex-col tw:h-full tw:overflow-hidden` root, don't wrap it in `BasePage`. Public/auth pages are also out of scope.

---

## Component pattern: badge triad (XBadge → XBadgeById → XSelectMenu)

Every entity that appears as a badge or in a select menu follows this triad. **Never use `BaseSelectMenu` directly for an entity** — always wrap it.

### Roles

```
XBadge       — receives a full object; styling only (SCHEME_MAP: id → class)
XBadgeById   — receives an id; resolves to an object (IDB or static map); renders <XBadge>
XSelectMenu  — uses BaseSelectMenu + XBadgeById in the button slot
```

Invariants:

- `XBadge` never accepts an `id` prop. It receives the full object and renders `object.name` (with `object.id` as fallback).
- `XBadgeById` is the only component that takes an `id` and resolves it.
- Inside `XBadgeById`, never fall back to `BaseBadge` directly — let `XBadge` render even before IDB loads, using `{ initial: () => (props.statusId ? { id: props.statusId } : null) }`. `XBadge`'s `name || id` fallback covers the gap.

### Two flavors

| Flavor   | When                                                                        | `XBadgeById` resolves via    |
| -------- | --------------------------------------------------------------------------- | ---------------------------- |
| **Full** | A SyncEngine model exists (e.g. `Site`, `Department`, `TaskInstanceStatus`) | `useLiveQueryWithDeps` → IDB |
| **Enum** | No DB model — just an id field on the parent (e.g. user `userStatusId`)     | static `STATUS_MAP` constant |

`SCHEME_MAP` lives in `XBadge` and **only** holds styling: `{ ID: { class: 'tw:bg-...' } }`.
`STATUS_MAP` lives in `XBadgeById` (enum flavor only) and **only** holds data: `{ ID: { id: 'ID', name: 'Label' } }`.
Never mix — labels never go in `SCHEME_MAP`, classes never go in `STATUS_MAP`.

### Full pattern (Site)

```vue
<!-- SiteBadge.vue -->
<script setup>
defineProps({ site: { type: Object, required: true } })
</script>
<template>
  <BaseBadge v-bind="$attrs">{{ site.name }}</BaseBadge>
</template>
```

```vue
<!-- SiteBadgeById.vue -->
<script setup>
const props = defineProps({ siteId: { type: String, default: null } })
const site = useLiveQueryWithDeps([() => props.siteId], async (db, [siteId]) => {
  if (!siteId) return null
  return db.Site.findByPk(siteId)
})
</script>
<template>
  <SiteBadge v-if="site" :site="site" v-bind="$attrs" />
</template>
```

```vue
<!-- SiteSelectMenu.vue -->
<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})
const modelValue = defineModel({ type: [String, Array, null], default: null })
const sites = useLiveQuery(async (db) => db.Site.where().exec(), { initial: [] })
function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>
<template>
  <BaseSelectMenu v-model="modelValue" :items="sites" :required="required" :multiple="multiple">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <SiteBadgeById
              v-for="siteId in getArray()"
              :key="siteId"
              :siteId="siteId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(siteId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Sites</span>
        </template>
        <template v-else>
          <SiteBadgeById
            v-if="modelValue"
            :siteId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Site</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
```

For status badges that need per-id colors, add `SCHEME_MAP` to `XBadge`:

```vue
<!-- TaskInstanceStatusBadge.vue -->
<script setup>
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
})
const SCHEME_MAP = {
  APPROVED: { class: 'tw:bg-green-100 tw:text-green-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
  PENDING: { class: 'tw:bg-amber-100 tw:text-amber-700' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>
<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class" :showDot="showDot">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
```

### Enum pattern (UserStatus)

```vue
<!-- UserStatusBadgeById.vue — only the resolution differs from the full pattern -->
<script setup>
const props = defineProps({ statusId: { type: String, default: null } })
const STATUS_MAP = {
  ACTIVE: { id: 'ACTIVE', name: 'Active' },
  INACTIVE: { id: 'INACTIVE', name: 'Inactive' },
  INVITED: { id: 'INVITED', name: 'Invited' },
}
const status = computed(
  () =>
    STATUS_MAP[props.statusId] ||
    (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>
<template>
  <UserStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
```

`UserStatusBadge` is identical in shape to `TaskInstanceStatusBadge` (object prop, `SCHEME_MAP`). `UserStatusSelectMenu` is identical in shape to `SiteSelectMenu` but feeds `BaseSelectMenu` a static `items` array of the `STATUS_MAP` values.

### File locations

- Badges: `src/components/badges/`
- Select menus: `src/components/menus/`

### Checklist when adding a new entity

- [ ] Need a badge? Create `XBadge` (object → display, optional `SCHEME_MAP` for color).
- [ ] SyncEngine model exists? Create `XBadgeById` with `useLiveQueryWithDeps` → `findByPk`.
- [ ] No model (enum)? Create `XBadgeById` with a static `STATUS_MAP`.
- [ ] Need a select menu? Create `XSelectMenu` using the matching pattern.
- [ ] Don't use `BaseSelectMenu` directly. Don't render an entity inline with `useLiveQuery` + display logic when an `XBadgeById` exists.

---

## Component pattern: inline edit + auto-save

When a page shows entity details that can be edited, edit inline on the page — no separate edit dialog, no separate form ref.

Rules:

1. Bind `v-model` directly to the entity from the live query (e.g. `user.value.firstName`). No copy.
2. Auto-save with a deep watcher + `useDebounceFn`. Skip the first watcher trigger so the initial load doesn't trigger a save.
3. Don't pre-validate. `BaseModel` validates on save — surface errors from `save()`.
4. Show `isSaving` and `saveError`.

```javascript
const isSaving = ref(false)
const saveError = ref(null)
const isFirstLoad = ref(true)

const debouncedSave = useDebounceFn(async () => {
  if (!user.value) return
  isSaving.value = true
  saveError.value = null
  try {
    await user.value.save()
  } catch (err) {
    saveError.value = err.message || 'Failed to save'
  } finally {
    isSaving.value = false
  }
}, 500)

watch(
  user,
  (u) => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (u) debouncedSave()
  },
  { deep: true },
)
```

Each field shows the edit control when `canUpdate`, otherwise the read-only badge:

```vue
<div>
  <p class="tw:text-secondary tw:mb-1">Site</p>
  <SiteSelectMenu v-if="canUpdate" v-model="user.siteId" :required="true" />
  <template v-else>
    <SiteBadgeById v-if="user.siteId" :siteId="user.siteId" />
    <span v-else class="tw:text-sm tw:text-secondary">—</span>
  </template>
</div>
```

For text fields, click-to-edit:

```vue
<template v-if="editingName && canUpdate">
  <BaseTextInput
    v-model="user.firstName"
    placeholder="First Name"
    size="sm"
    @keyup.enter="editingName = false"
    @blur="editingName = false"
  />
</template>
<h2
  v-else
  class="tw:text-3xl tw:font-bold tw:text-on-sidebar tw:cursor-pointer tw:hover:text-primary"
  @click="canUpdate && (editingName = true)"
>
  {{ user?.firstName }} {{ user?.lastName }}
</h2>
```

### Join-table mutations (e.g. role assignments)

Role assignments are `RoleOnUser` records, not direct user fields. Diff against the live list and apply with `useLiveMutation` for creates and `instance.delete()` for removals:

```javascript
const addRoleOnUser = useLiveMutation(async (db, { userId, roleId }) => {
  const assignment = db.RoleOnUser.create({ userId, roleId })
  await assignment.save()
  return assignment
})

async function handleRolesChange(newRoleIds) {
  const currentIds = assignedRoleIds.value
  const toAdd = newRoleIds.filter((id) => !currentIds.includes(id))
  const toRemove = currentIds.filter((id) => !newRoleIds.includes(id))
  for (const roleId of toAdd) await addRoleOnUser({ userId: props.id, roleId })
  for (const roleId of toRemove) {
    const match = roleAssignments.value.find((ra) => ra.roleId === roleId)
    if (match) await match.delete()
  }
}
```

---

## Migration: Quasar → Tailwind

The project is actively migrating off Quasar. Replace on touch.

### Cheatsheet

| Quasar / `W*`                    | Replace with                                                         |
| -------------------------------- | -------------------------------------------------------------------- |
| `QBtn` / `WBtn`                  | `<button>` + Tailwind, or `BaseButton`                               |
| `QInput` / `WInput`              | `BaseTextInput` (or `<input>` + Tailwind)                            |
| `QSelect` / `WSelect`            | `BaseSelectMenu` — or an `XSelectMenu` if one exists for that entity |
| `QDialog`                        | `BaseDialog`                                                         |
| `QCard`                          | `<div>` + Tailwind, or `BaseCard`                                    |
| `QTable`                         | `BaseTable`                                                          |
| `QForm`                          | `<div>` with handlers — never `<form>`                               |
| `QBadge`                         | `<span>` + Tailwind, or the entity's `XBadge`/`XBadgeById`           |
| `QChip`                          | `BaseChip`                                                           |
| `QTooltip`                       | `BaseTooltip`                                                        |
| `QSeparator`                     | `<hr>` + Tailwind                                                    |
| `QSpinner` / `QCircularProgress` | `BaseSpinner`                                                        |
| `QIcon` / `WIcon`                | `@tabler/icons-vue`                                                  |

Check `resource/js/shared/components/` for existing `Base*` components before building anything new.

### Example

```vue
<!-- ❌ Old -->
<QForm @submit="handleSubmit">
  <QInput v-model="name" />
  <QBtn type="submit">Save</QBtn>
</QForm>

<!-- ✅ New -->
<div class="tw:flex tw:flex-col tw:gap-4">
  <BaseTextInput v-model="name" />
  <button class="tw:btn-primary" @click="handleSubmit">Save</button>
</div>
```

### Pre-commit checklist

- [ ] No `Q*` components, no `W*` wrappers (entity-lookup `W*` are still allowed)
- [ ] All icons from `@tabler/icons-vue`, explicitly imported
- [ ] Tailwind classes carry the `tw:` prefix
- [ ] No `<form>` elements
- [ ] `defineModel` used for v-model

---

## Migration: axios + provide/inject → syncEngine

> **Core principle.** Components receive only an `id` prop. They query and mutate their own data via the syncEngine. No data is fetched by a parent composable or passed down as props. There is no shared provided state.

### Read

```javascript
// ❌ Old — composable with manual fetch, provided to tree
async function fetchDocuments() {
  const data = await get('/v1/services/documents', { params: { companyId }, loader: loading })
  documents.value = data.documents || []
}
onMounted(() => fetchDocuments())

// ✅ New — live query directly in the component
const document = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.Document.findByPk(id),
)
const versions = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) =>
    db.DocumentVersion.where('documentId', id).orderBy('createdAt', 'desc').exec(),
  { initial: [] },
)
```

### Create / update / delete

```javascript
// Create — useLiveMutation
const createDoc = useLiveMutation(async (db, payload) => {
  const doc = db.Document.create(payload)
  await doc.save()
  return doc
})
await createDoc({
  /* ... */
})

// Update — mutate and save
document.value.statusId = 'ARCHIVED'
await document.value.save()

// Soft delete (paranoid) — never refetch after; syncBus updates live queries automatically
await document.value.delete()
```

No manual refetch — `syncBus` fires and live queries refresh on their own.

### Reactive filters

```javascript
const search = ref('')
const statusId = ref(null)

const documents = useLiveQueryWithDeps(
  [() => search.value, () => statusId.value],
  async (db, [search, statusId]) => {
    const results = await db.Document.where('statusId', statusId).exec()
    return results.filter((d) => d.title.includes(search))
  },
  { initial: [] },
)
```

### Loading state

A live query returns `undefined` before its first result — use that as the loading signal:

```javascript
const document = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.Document.findByPk(id),
)
const loading = computed(() => document.value === undefined)
// template: v-if="!document" → loading/not-found, v-else → ready
```

For lists, passing `{ initial: [] }` skips the `undefined` phase but you lose the ability to distinguish loading from empty. Pick one based on the UI.

### Auto-select after a mutation

Watch the live list — never re-fetch + `find`:

```javascript
watch(versions, (list) => {
  if (!list?.length) {
    selectedVersion.value = null
    return
  }
  const currentId = selectedVersion.value?.id
  const found = currentId ? list.find((v) => v.id === currentId) : null
  selectedVersion.value = found ?? list[0]
})
```

### Passing data between components

```vue
<!-- ❌ Old: parent fetches and passes objects down -->
<DocumentsMainContent :document="document" :currentVersion="selectedVersion" :canEdit="canEdit" />

<!-- ✅ New: child receives ids and queries itself -->
<DocumentsMainContent :documentId="props.id" :versionId="selectedVersion?.id" />
```

### Pre-commit checklist

- [ ] No imports from `@/api` (`get`/`post`/`put`/`del`)
- [ ] No `provideX()` / `useX()` data-fetching composable
- [ ] No manual `loading` refs wrapping API calls
- [ ] No `fetch*` functions hitting the network
- [ ] No `companyId` guards (syncEngine handles scoping)
- [ ] Reads via `useLiveQuery` / `useLiveQueryWithDeps`
- [ ] Creates via `useLiveMutation` (never `db.Model.create()` + `save()` inline)
- [ ] Components receive `id` props, not full object props
- [ ] No manual refetch after mutations
- [ ] No manual `deletedAt` filtering

---

## SyncEngine API Reference

> For the cross-service flow (Postgres logical replication → `sync` service → frontend → IndexedDB), see the root [`../../CLAUDE.md`](../../CLAUDE.md). This section only covers the in-frontend API.

### Engine lifecycle (no service worker)

The syncEngine runs entirely on the main thread. There is no service worker, no `TransactionQueue`, no optimistic IDB writes.

`syncEngine.install()` (called once after login when the active company is known):

1. Open / create the company-scoped IndexedDB. The DB name is timestamped and stored in `localStorage`; on schema change, the old DB is nuked and a new one is opened.
2. Build `MetaCache` — in-memory cache of GraphQL queries/mutations per model.
3. Wire `BaseModel._saveStrategy = directSaveStrategy` (pessimistic save: API first, then IDB).
4. Run `bootstrapAll()` — paginated delta-sync via GraphQL for every `INSTANT`-strategy model, using a `lastSyncValue` watermark per model in `syncMetaStore`. A `localStorage` gate (`bootstrapGate`) dedupes across tabs and skips re-bootstrap when data is < 5 min old. Non-blocking — UI starts rendering from IDB immediately.
5. `initSocketSubscriber()` — attach a `'sync'` listener to the existing app socket from `src/api/socket.js`.

**Mutations** (`instance.save()` / `.delete()`):

1. `directSaveStrategy` calls `MutationRunner` → GraphQL.
2. On success: write the server record to IDB, `markAsRecentlyWritten` (suppresses the echo socket event for 2 s), update the in-memory `ObjectPool`, emit on `syncBus`. Live queries refresh.
3. On failure: throw. IDB is untouched, no rollback needed. **Surface the error in the UI** — pessimistic saves mean a failed save means no change anywhere.

`LOCAL`-strategy models bypass the network and just write IDB.

**Server-pushed updates** (from `backend/sync` via socket.io):

1. Backend emits `{ table, action, pkValue }` on the `sync` event.
2. `socketSubscriber` looks up `MetaCache` by table, fetches the full record via GraphQL, writes it to IDB, advances the `syncMetaStore` watermark, emits on `syncBus`.
3. Echo events for records the local save just wrote (within 2 s) are dropped to avoid double-fetching what's already in IDB.

`syncEngine.teardown()` — detaches the socket listener, closes IDB, clears the `ObjectPool`. Call before switching company DB or on logout.

### Defining a model

```javascript
import { ClientModel, BaseModel, Property, Computed } from '@syncEngine/index.js'

@ClientModel('document_versions', {
  primaryKey: 'id',
  loadStrategy: 'instant', // 'instant' | 'lazy' | 'local'
  customIndex: 'documentId', // or '[documentId+statusId]' for compound
  schemaVersion: 1,
})
class DocumentVersion extends BaseModel {
  static paranoid = true // soft-delete via deletedAt; or 'fieldName' for custom

  @Property({ type: String, required: true }) id = null
  @Property({ type: String }) documentId = null
  @Property({ type: String }) statusId = null
  @Property({ type: Number }) versionMajor = 0
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = null
  @Property({ type: DateTime }) deletedAt = null // required when paranoid

  get label() {
    return `${this.versionMajor}.${this.versionMinor}`
  }
}
```

- `@Property({ type })` — persisted, dirty-tracked. `type` is required: `String`, `Number`, `Boolean`, `Date`, `DateTime`.
  - `timestamp: true` — auto-set to "now" on `Model.create()`. Format depends on `type`: `Number` → `Date.now()`, `String` → ISO string, `Date` → `new Date()`, `DateTime` → `DateTime.now()`.
  - `autoUpdate: true` — auto-set to "now" before every `save()`.
- `@Computed` — Vue computed getter, never persisted.

### Querying

```javascript
// Indexed lookup (fast)
await db.DocumentVersion.where('documentId', id).exec()

// Indexed + chained filters/sort/limit (filters after the first .where() are in-memory)
await db.DocumentVersion.where('documentId', id)
  .where('statusId', 'DRAFT')
  .orderBy('createdAt', 'desc')
  .limit(10)
  .exec()

// Compound index
await db.Issue.where('[status+priority]', ['OPEN', 1]).exec()

// Full scan — use sparingly
await db.DocumentVersion.where().exec()

// First only
await db.DocumentVersion.where('documentId', id).orderBy('createdAt', 'desc').first()

// Include soft-deleted (bypass paranoid)
await db.DocumentVersion.where('documentId', id, { force: true }).exec()
await db.Document.findByPk(id, { force: true })

// findByPk — null if soft-deleted
await db.Document.findByPk(id)
```

### Mutations

```javascript
const v = db.DocumentVersion.create({ documentId: id, statusId: 'DRAFT', versionMajor: 1 })
await v.save()

v.statusId = 'APPROVED'
await v.save()

await v.delete() // soft (paranoid)
await v.hardDelete() // bypass paranoid
await v.restore() // un-soft-delete
```

### Live queries

```javascript
// Re-runs when deps change AND when syncBus fires
const versions = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.DocumentVersion.where('documentId', id).orderBy('createdAt', 'desc').exec(),
)

// No deps
const allDocs = useLiveQuery(async (db) => db.Document.where().exec())

// Options
useLiveQueryWithDeps(deps, fn, {
  models: 'DocumentVersion', // only this model's sync events trigger re-run (default '*')
  initial: [], // value before first load (default undefined)
  debounce: 50, // coalesce burst syncs, ms
})
```

### File map

| File                                      | Purpose                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `syncEngine/index.js`                     | Public exports                                                              |
| `syncEngine/syncEngine.js`                | `SyncEngine.install()` / `.teardown()` — engine entry point                 |
| `syncEngine/core/BaseModel.js`            | Base class — create/save/delete/findByPk/where                              |
| `syncEngine/core/directSaveStrategy.js`   | Pessimistic save (API first, then IDB) — wired into `BaseModel`             |
| `syncEngine/core/MetaCache.js`            | In-memory GraphQL query/mutation cache per model                            |
| `syncEngine/core/ObjectPool.js`           | Reactive instance cache — same `id` returns the same Vue object             |
| `syncEngine/core/syncBus.js`              | Per-model event bus that drives live-query re-runs                          |
| `syncEngine/decorators/ClientModel.js`    | `@ClientModel`                                                              |
| `syncEngine/decorators/Property.js`       | `@Property`                                                                 |
| `syncEngine/decorators/Computed.js`       | `@Computed`                                                                 |
| `syncEngine/network/MutationRunner.js`    | Runs GraphQL mutations + per-record refetch                                 |
| `syncEngine/network/graphqlClient.js`     | GraphQL fetch client                                                        |
| `syncEngine/persistence/IndexedDB.js`     | Low-level IDB adapter                                                       |
| `syncEngine/persistence/syncMetaStore.js` | `lastSyncValue` watermarks per model (delta-sync)                           |
| `syncEngine/persistence/schemaManager.js` | Schema-hash detection → nuke old DB on change                               |
| `syncEngine/sync/bootstrap.js`            | Paginated delta-sync on install                                             |
| `syncEngine/sync/bootstrapGate.js`        | Cross-tab bootstrap dedup via `localStorage`                                |
| `syncEngine/sync/socketSubscriber.js`     | Attaches `'sync'` listener to the app socket                                |
| `syncEngine/query/QueryBuilder.js`        | Chainable IDB query builder                                                 |
| `src/composables/useLiveQuery.js`         | Vue composables (`useLiveQuery`, `useLiveQueryWithDeps`, `useLiveMutation`) |
| `frontend/app/models/`                    | All model definitions                                                       |
