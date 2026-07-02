# Typography Audit — 2026-07-02

Full-codebase audit of font families, sizes, weights, line heights, letter spacing, and text colors.
Scope: `src/`, `resource/`, `index.html`, global CSS. Excludes `node_modules`, `dist`, `storybook-static`.

## Baseline: what exists today

- **No custom font family is loaded anywhere.** No `@fontsource` package, no Google Fonts link, no
  `@font-face`, no `--font-sans` override. The entire app renders in Tailwind v4's default
  `ui-sans-serif, system-ui, …` stack — i.e. a different font on every OS (SF Pro on macOS, Segoe UI
  on Windows, Roboto on Android).
- A **named font-size token scale exists** in `src/css/base.css` `@theme` (`page-title` 28 /
  `section-title` 18 / `subheading` 15 / `body` 14 / `label` 12 / `caption` 11 / `badge` 11 /
  `table-header` 11 / `micro` 10) and a **semantic variant system** exists in
  `resource/js/shared/components/typography/typography.js` (BaseHeading/BaseText/BaseLabel/…).
- **Adoption is near zero.** Raw utilities dominate: 1292× `tw:text-xs`, 1249× `tw:text-sm` vs
  0 uses of `page-title`/`section-title`/`subheading`/`badge`/`table-header` in feature code.
  `BaseHeading` is never used directly. Only `caption` (147) and `micro` (248) took hold.
- No base font-size is set, so any element without an explicit `text-*` class renders at the
  browser's 16px — visibly larger than the app's de-facto 14px body.

---

## CRITICAL — files/systems that ignore or break the typography system

1. **No global font family (entire app).**
   Problem: typography is OS-dependent; there is no brand font at all.
   Fix: load one font (Inter) and set it as `--font-sans` in `src/css/base.css` `@theme`.

2. **Dead font-size classes in the core form inputs** — `tw:text-11`, `tw:text-12`, `tw:text-14`
   are not defined anywhere and emit no CSS, so labels/inputs/help text silently inherit 16px:
   - `resource/js/shared/components/BaseTextInput.vue` (label, input, instructions)
   - `resource/js/shared/components/BaseTextarea.vue` (instructions)
   - `resource/js/shared/components/BaseSelect.vue` (label, hint, group headers, option subtitles)
   Fix: replace with real tokens (`tw:text-label` / `tw:text-sm` / `tw:text-caption`).

3. **Form labels rendered three different ways across sibling inputs:**
   - `BaseTextInput` — dead size class, **no weight**, only `tw:dark:text-white` (no light-mode color)
   - `BaseTextarea` — **no size class at all**, no weight, only `tw:dark:text-white`
   - `BaseSelect` — `tw:text-sm`/dead `text-12`, `tw:font-medium`, `tw:text-on-main`
   None of them use the canonical `BaseLabel`. Labels in the same form literally differ in size,
   weight, and color. Fix: one label style (`tw:text-label tw:font-medium tw:text-on-main`).

4. **Auth pages: two competing brand-wordmark systems** for the identical "QMS" logo text:
   - Scoped CSS `.branding-title`: `3.25rem/800/-1.5px` (`signin.vue`) and `3rem/700/-0.5px`
     (`forgot-password.vue`, `reset-password.vue`, `reset-esign-pin.vue` — copy-pasted 3×)
   - Tailwind `tw:text-5xl tw:font-bold tw:tracking-tight` = 48px/700 (`signup.vue`,
     `accept-invitation.vue`)
   Fix: one treatment (48px / 700 / tight tracking) everywhere.

5. **Orphaned Quasar-era stylesheets (dead code):**
   - `resource/js/shared/components/WTable/w-table.scss` — its own 11px/700/0.06em table-header
     system, Quasar `var(--q-*)` colors, hardcoded `#fff`
   - `resource/js/shared/components/input/w-checklist.scss` — same era
   Zero references anywhere. Fix: delete both.

6. **Last live Quasar typography classes:** `resource/js/shared/components/ErrorHeader.vue:17`
   uses `text-h4 font-weight-medium` — Quasar is gone, so these render nothing.

## MEDIUM — inconsistent sizes/weights for the same role

7. **Page titles render at three sizes for one role:** `PageHeader` top-bar `<h1>` = 18px
   (`tw:text-lg tw:font-bold tw:tracking-tight`, raw utility not the token); hand-rolled portal/
   standalone titles = 24px `tw:text-2xl tw:font-bold` (help, supplier portal, workflow summaries,
   `TrainingVerificationsHome` — which also uses the wrong color token `text-on-sidebar`); and
   20px `tw:text-xl` (`support/ticket/[id].vue`, `ComplaintFormRenderer.vue`). The 28px
   `page-title` token is used 0 times.

8. **Section titles land on four styles:** token path (`PageSection`/`BaseSectionHeader` →
   15px semibold) vs hand-rolled `tw:text-lg tw:font-bold` (30+, split between `text-on-main` and
   `text-on-sidebar`) vs `tw:text-base tw:font-semibold` (7) vs `tw:text-base tw:font-bold` (5).

9. **Two `<h1>` header components disagree:** `PageHeader.vue` (`tw:text-lg tw:font-bold
   tw:tracking-tight`) vs `DetailHeader.vue` (`tw:text-section-title tw:font-bold`, no tracking) vs
   the token definition itself (`section-title` = semibold).

10. **Dialog title size exists in no scale:** `BaseDialog.vue` title = `tw:text-base` (16px) —
    the token scale has 15 and 18, nothing at 16. Subtitle `tw:text-xs` instead of a token.

11. **DataTable is internally inconsistent and off-token:** column headers
    `tw:text-xs tw:font-bold tw:tracking-widest tw:uppercase` (12px) while its own group/eyebrow
    header uses `tw:text-micro tw:font-medium tw:tracking-wide` (10px) — and the dedicated
    `tw:text-table-header` (11px) token is used 0 times. Filter pill uses hardcoded `tw:text-[10px]`.

12. **Five competing "uppercase eyebrow/overline" treatments:** the `overline` token
    (11px semibold tracking-wider secondary) vs `BaseRailCard` (12px), `BaseSelect` group headers
    (dead 11px class), `DataTable` (10px medium, `text-placeholder`), `w-table.scss` (11px/700).
    App-wide, uppercase labels split 116× `text-xs` / 86× `text-micro` / 8× `text-caption`.

13. **Weight system has no ceiling:** 24× `tw:font-black` and 4× `tw:font-extrabold` alongside
    409× `font-bold` / 418× `font-semibold` / 566× `font-medium`, plus 71 numeric `font-weight:`
    declarations in scoped styles duplicating Tailwind weights.

14. **Badges diverge from `BaseBadge`:** `ExpiryPill.vue` hand-rolls 10px/semibold/`rounded`
    (BaseBadge sm = 12px/medium/`rounded-md`); `EquipmentBadge.vue` injects `tw:font-mono` into a
    badge; `BaseButton` `xs` and `BaseTabs` count badge use hardcoded `tw:text-[10px]` instead of
    `text-micro`.

15. **Empty states range 12px→30px for one role:** `BaseEmptyState` (14px semibold / 12px
    secondary) vs hand-rolled variants — `[...all].vue` 404 at `tw:text-3xl tw:font-bold`,
    `AuditRequirementsEditor.vue` 12px italic, `TrainingAssessmentEditor.vue` no size class.

16. **Sidebar hierarchy is flat:** group section labels, nav items, and the user-menu rows are all
    `tw:text-sm tw:font-medium` — no overline/eyebrow differentiation; the user name renders
    `font-bold` in one spot (`MainSidebar.vue:605`) and `font-semibold` in another (`:619`).

17. **Muted-text color has 6 expressions:** `tw:text-secondary` dominates (2108) but ~154 outliers
    use `tw:text-gray-400/500/600/700`, `tw:text-slate-*`, `opacity-*`, or raw hex (`#999` in
    `MentionList.vue`/`DocumentMentionList.vue`).

## MINOR

18. Remaining arbitrary px sizes: `tw:text-[8px]` (`BaseFileItem.vue:177`), `tw:text-[9px]`
    (`AuditFindingLinkedChip.vue:60`, `companyPrintCard.vue:141`), plus scattered `text-[10px]`/`[11px]`.
19. `BaseRichTextEditor.vue:701` uses `'Courier New', monospace` while every other code surface
    uses the `ui-monospace` stack.
20. Scoped-style rem sizes off-scale in editor extensions (`0.8125rem`, `0.6875rem`) and auth pages
    (`0.72rem`–`3.25rem`).
21. `form-templates.vue:492` raw hex text/bg (`tw:text-[#4ade80]` on `tw:bg-[#1e293b]`) bypassing
    the `--color-code` token.
22. 14 `<h3>` elements with no size class (inherit ambient size), several "headings" rendered as
    `<div>`s, and one inverted case (`RolePageId.vue:338` — an `<h3>` at 20px, larger than page
    `<h2>`s).
23. Print modules (`src/components/print/*`) carry a self-contained px/hex print stack — legitimate
    for print output, but each module re-declares the same `ui-monospace` eyebrow stack.
24. No `!important` typography rules found (clean); `tw:text-neutral-*` unused (clean).

---

## Standardization strategy (implemented 2026-07-02)

- **One font: Inter** (`@fontsource-variable/inter`, self-hosted variable font) set as `--font-sans`
  → flows into Tailwind's `--tw-default-font-family` → whole app. `--font-mono` stays the
  `ui-monospace` system stack (used by `tw:font-mono`).
- **Base body size = `--text-body` (14px)** with antialiasing, so unsized text matches the app's
  de-facto body size instead of 16px browser default.
- **Roles, one style each** (token-backed):
  - Page title (top bar / detail header): `tw:text-section-title tw:font-semibold tw:tracking-tight`
  - Standalone/portal page title: `tw:text-2xl tw:font-semibold tw:tracking-tight`
  - Section title: `PageSection`/`BaseSectionHeader` token path (15px semibold)
  - Dialog title: `tw:text-section-title tw:font-semibold`; description `tw:text-label tw:text-secondary`
  - Form label: `tw:text-label tw:font-medium tw:text-on-main`; helper `tw:text-caption tw:text-secondary`
  - Table header: `tw:text-table-header tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary`
  - Overline/eyebrow: `tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary`
  - Badge: `BaseBadge` metrics (12px medium) — no bespoke pills
  - Weight ceiling: `font-bold` (700). No `font-black`/`font-extrabold` in UI text.
  - Muted text: `tw:text-secondary` only.
- **No monospace on screen at all** (decided after review — the owner chose absolute font
  uniformity over the mono-for-machine-values convention). All `tw:font-mono` usages removed
  (identifiers first, then code/JSON/keys/cron too); `--default-mono-font-family` points at the
  Inter stack so `<pre>`/`<code>`/`<kbd>` render Inter; scoped `ui-monospace` rules removed from
  chat/editor/help components; `tw:font-mono` is hard-banned by the design-system ratchet.
  Print modules keep their own scoped print stack (print output only).
