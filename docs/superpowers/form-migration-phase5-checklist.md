# Phase 5 — Admin list/home & settings pages (8 files)

> Surface: list/index/settings pages (a table or list + maybe a filter bar /
> create button / empty-state), NOT real forms. The work is mostly a **card-chrome
> swap** (`bg-white…p-5` → `BaseCard` / `PageSection`), plus **toast→inline** on the
> two `card+toast` files. Each comes off the `lint:forms` allowlist.

Legend: `[card]` = chrome swap · `[toast]` = toast-validation → inline · `[card+toast]` = both.

## Migration + test checklist

### customerComplaints (6)
- [ ] **CannedResponsesHome.vue** `[card+toast]` — swap card; the create/edit canned-response validation toast → inline error. **Test:** add a canned response with an empty required field → inline error (no toast); list renders in a themed card.
- [ ] **ComplaintFormsHome.vue** `[card]` — swap the list card → `BaseCard`/`PageSection`. **Test:** forms list renders; dark mode OK.
- [ ] **EmailChannelsHome.vue** `[card]` — swap card. **Test:** channels list renders; add/connect flow unaffected.
- [ ] **RoutingRulesHome.vue** `[card+toast]` (434L, biggest) — swap card; rule-builder required-field toast → inline. **Test:** create a routing rule with a missing field → inline error; rules list renders.
- [ ] **SuspendedEmailsHome.vue** `[card]` (smallest) — swap card. **Test:** suspended-emails list renders.
- [ ] **ComplaintSlaSettings.vue** `[card]` — swap card. **Test:** SLA settings render + save still works.

### inspectionsLogs (2)
- [ ] **InspectionsLogsHome.vue** `[card]` (already uses BasePage) — find + swap the flagged card (a non-`p-5` variant). **Test:** logs list/dashboard renders.
- [ ] **InspectionsLogsTemplatesHome.vue** `[card]` — swap card. **Test:** templates list renders.

## Rules for this phase
- Card wrapping a **table/list/filter** → `BaseCard` (plain surface) or `PageSection` (titled group); a **display panel** → `BaseCard`. If it's just an index page, prefer `PageSection`/`BaseCard`, do **not** wrap in `BaseForm` (these aren't submit forms).
- `toast→inline`: only the create/edit validation toasts (the `*Home` pages often open a small create dialog — convert that dialog's toast to per-field `:rules` like the Phase-2 dialogs, or inline `BaseField :error`).
- Preserve all behavior: tables, filters, pagination, row actions, create/edit flows, queries.
- Don't touch `BasePage`/`PageHeader` layout.
- Gates per file group: eslint + `lint:forms`/`layout`/`ds` + vitest + **`pnpm build`**.

## Approach
Pilot **ComplaintFormsHome** (clean `card`-only) first to lock the list/home swap
pattern, then fan out the rest in 1–2 groups, then the two `card+toast` ones.
