# Document Detail Page — BaseDetailLayout Migration (Design)

**Date:** 2026-06-23
**Branch:** `feat/ds-document-migration` (off `develop`)
**Status:** Approved design — ready for implementation plan.

## Context

`documents/DocumentsPageId.vue` (721 lines) is the document control detail page. It
was marked EXEMPT in wave-1 and an earlier migration attempt was reverted (`d9c6ff1`)
because wrapping it in `BaseDetailLayout` produced a redundant one-item "Content"
anchor nav above the document's own tabs and a cramped header. The user has decided to
re-attempt a **full restructure** onto `BaseDetailLayout`, designed specifically to
avoid those two failure modes.

### Current structure (as-is)

- **`DocumentsPageId.vue`** owns: a large sticky **toolbar** (~16 actions), the
  `DocumentsMainContent` child, `SharedWithPanel`, and ~9 dialogs. Root is
  `BaseDetailPage` with only `#title` used.
- **`DocumentsMainContent.vue`** (97 lines) owns the tabs (`BaseTabs`): **Content**,
  **Change Control** (revision-only — hidden on v1.0), **Training**. The `content` tab
  is a 2-col grid: `DocumentsMainContentLeft` (editor, 2/3) + `DocumentsMainContentRight`
  (sidebar, 1/3). The other two tabs are full-width.
- **`DocumentsMainContentRight.vue`** (390 lines) is the editable sidebar: Properties
  (Owner/Author/Type/Status/Department/Related Standard/Periodic Review/Auto-Effective/
  Effective Date — inline editors), Collaborators, Workflow card + selection dialog +
  Workflow Timeline, and Table of Contents.

### Why wave-1 failed

1. **Redundant nav** — using `sections` (anchor nav) on a page that already renders its
   own Content/Training tabs gave a pointless one-item "Content" pill above the tabs.
2. **Cramped header** — cramming the 16-button toolbar into the compact detail header.

## Decisions (from brainstorming)

- **Depth:** Full restructure — hoist the tabs into `BaseDetailLayout` panel-tabs AND
  the sidebar into `#rail`.
- **Rail scope:** The rail **persists on all tabs** (Properties/Collaborators/Workflow
  are document-level). The **Table of Contents card hides when `activeTab !== 'content'`**
  (it is content-specific).
- **Width:** `wide` (96rem) — the editor + persistent rail need room; `standard` is what
  felt cramped in wave-1.

## Target design

### 1. Config module — `documents/documentDetailConfig.js` (+ `.spec.js`, TDD)

Pure builders, mirroring the wave-2 configs:

- `buildDocumentBanners(document)` → `[]` normally; an `archived` neutral read-only
  banner when `document.statusId === 'ARCHIVED'`.
- `buildDocumentTabs(isRevisionVersion)` → **panel-mode** tab descriptors:
  `content`, `changeControl` (only when `isRevisionVersion`), `training`. Each
  `{ value, label, icon, mode: 'panel' }`.
- `buildDocumentActions(gates, handlers)` → `DetailActionBar` descriptors:
  - **primary** (status-driven, one visible at a time per its gate): `createDraft`
    (canCreate), `submitForReview` (canSubmitForReview), `setEffective` (canSetEffective),
    `cancelReview` (canCancelReview, danger).
  - **secondary:** `print`.
  - **overflow:** `reports`, `revisionHistory`, `auditLog`, `export`, `discussion`,
    `showWorkflow` (when in review), `deleteVersion` (draft + canDelete), `archive`
    (canEdit). Each carries `visible`/`disabled`/`onSelect`/`priority`.

NOT placed in `buildDocumentActions` (remain bespoke in the `#actions` slot because they
are not plain buttons): `AskAiButton`, **Summarize**, **What-changed**, `TaskActionBar`,
and the **Version picker** popover.

### 2. `DocumentsPageId.vue` — rewritten onto `BaseDetailLayout`

`defineDetailConfig({ variant: 'standard', width: 'wide', breadcrumbs, banners, actions, tabs })`.
**No `sections`** (this is the wave-1 fix). Slots:

- `#title`: `document.title` + `docNumber`.
- `#status`: selected-version status badge (`DocumentVersionStatusBadgeById`) + version label.
- `#meta`: `docNumber` · `v{versionLabel}` · next-review date (when present).
- `#actions`: a flex cluster — bespoke controls (AskAi, Summarize, What-changed,
  TaskActionBar, Version picker) + `<DetailActionBar :actions="documentActions" />`.
- `#tab-content`: `DocumentsMainContentLeft` (full-width now).
- `#tab-changeControl`: `DocumentsChangeControlTab` (slot only rendered when the tab exists).
- `#tab-training`: `DocumentsTrainingTab`.
- `#rail`: `DocumentsMainContentRight`, passed the active tab so its TOC card hides off-Content.

All dialogs (`DocumentWorkflowPreviewDialog`, training reminder, `AuditLogDialog`,
`DocumentRevisionHistoryDialog`, `DocumentObsoletionDialog`, AI summary/diff,
`DocumentsNewVersionDialog`, `DocumentsMessages` drawer) + `SharedWithPanel` move to be
**siblings after `</BaseDetailLayout>`** (the established gotcha: unslotted children of
`BaseDetailLayout` land in the never-rendered default slot when tabs/sections exist).

### 3. `DocumentsMainContent.vue` — dissolved

Its tab list + `isRevisionVersion` + `activeTab` model logic (it queries `DocumentVersion`
by `documentId`/`versionId`) moves into `DocumentsPageId` so the page can build the
panel-tab descriptors and drive `v-model:tab`. The three tab bodies are slotted directly.
`DocumentsMainContent.vue` is deleted once nothing imports it (it is auto-imported, so a
repo-wide usage check is required before deletion).

### 4. `DocumentsMainContentRight.vue` — TOC visibility

Add an `activeTab` prop (default `'content'`); wrap the Table-of-Contents card in
`v-if="activeTab === 'content'"`. Properties/Collaborators/Workflow/Timeline are unchanged
and now render on every tab. No other behavior change; all existing live queries and
mutations are preserved verbatim.

## Out of scope (YAGNI)

- No change to the editor (`DocumentsMainContentLeft`), Change Control, or Training tab internals.
- No change to any dialog internals, the print flow, AI dialogs, or `useDocuments` action RPCs.
- No new permissions, queries, or backend changes.

## Verification gates (per the program recipe)

1. `documentDetailConfig.js` exists; config `.spec.js` green.
2. `grep -c ':config=' page` ≥1 AND `grep -c ':banners=|:sections=' page` == 0.
3. No duplicate title (title only in `#title` + breadcrumb).
4. Dialog count unchanged vs. original AND all dialogs are siblings after `</BaseDetailLayout>`.
5. `pnpm build` green; `pnpm exec eslint` clean; `pnpm run lint:layout` clean.
6. Human visual pass on the running auth page: tabs switch (incl. Change Control appearing
   only on a revision), rail persists with TOC hiding off-Content, primary action correct
   per status with overflow, version picker + AI + TaskActionBar work, every dialog opens,
   editor autosaves, no redundant nav, header not cramped.
