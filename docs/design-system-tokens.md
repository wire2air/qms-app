# Qability Design Tokens — Contract

> The single source of truth for every visual decision. Tokens are **CSS
> variables** (the Tailwind v4 idiom), defined in
> [`src/css/tokens.css`](../src/css/tokens.css) and wired into Tailwind utilities
> via `@theme` / `@utility` in [`src/css/base.css`](../src/css/base.css).
>
> **Rule:** components reference a **named utility** (`tw:bg-primary`,
> `tw:shadow-floating`, `tw:text-caption`, `tw:z-modal`). Never hardcode a hex,
> a raw `z-<number>`, or a `text-[Npx]` magic number.
>
> Light/dark are both wired (`.light` / `.dark`). Per-tenant rebrand is a
> documented hook (see [Brand / tenant](#brand--tenant)).

---

## How it's wired

| Layer | File | Role |
|---|---|---|
| Token values | `tokens.css` | Raw CSS vars (`--primary`, `--z-modal`, color scales), with `.light` / `.dark` values. |
| Theme bridge | `base.css` `@theme` | Maps vars → Tailwind so `--color-primary` emits `tw:bg-primary` / `tw:text-primary`; `--shadow-*` emits `tw:shadow-*`; `--text-*` emits `tw:text-*`. |
| Named utilities | `base.css` `@utility` | For namespaces Tailwind v4 lacks — the **z-index** scale (`tw:z-modal`, …). |

A utility only appears in the built CSS when it's **used** somewhere (Tailwind v4 is usage-based) — defining a token never ships dead bytes.

---

## Colors — semantic (theme-responsive)

Always prefer the semantic token over a raw palette hue, so dark mode and future rebrands work for free.

| Token / utility | Light | Dark | Usage |
|---|---|---|---|
| `tw:bg-primary` / `tw:text-primary` | `#136dec` | `#136dec` | Brand actions, links, active state |
| `tw:bg-primary-hover` | `#105dc7` | `#136dec` | Primary hover |
| `tw:text-on-primary` | `#fff` | `#fff` | Text/icon on a primary fill |
| `tw:text-on-main` | `#111418` | `#fff` | Default body text on the page surface |
| `tw:text-secondary` | `#617289` | `#a0aec0` | Secondary / muted text |
| `tw:text-placeholder` | `#6b7280` | `#9ca3af` | Placeholder/disabled (AA-checked) |
| `tw:text-good` / `tw:text-bad` / `tw:text-warn` | `#059669` / `#dc2626` / `#d97706` | `#34d399` / `#f87171` / `#fbbf24` | Success / danger / warning text |
| `tw:bg-main` / `tw:bg-main-hover` / `tw:bg-main-selected` | `#f6f7f8` / `#f1f5f9` / `#e7f0fe` | `#101822` / `#1a222c` / `rgba(19,109,236,.15)` | Page surface + states |
| `tw:bg-card` | `#fff` | `#1a222c` | Raised panel / card surface (flips with theme) |
| `tw:bg-sidebar` / `tw:text-on-sidebar` | `#fff` / `#111418` | `#1a222c` / `#fff` | Sidebar + header surface |
| `tw:border-divider` | `#e5e7eb` | `#2d3748` | Borders, hairlines |

**Scales** (`success` / `warning` / `danger` / `info` / `neutral` / `changes`) exist at `50/100/(200)/500/600/700` as `--color-<name>-<n>` → `tw:bg-success-50`, etc. The raw Tailwind palette (`tw:bg-amber-50`, …) is **remapped in dark mode** (see the `--tw-color-*` block in `tokens.css`), so even literal hues stay theme-aware — but a semantic token is still preferred.

> ⚠️ Don't hardcode `bg-white` for surfaces — use `tw:bg-card`. (`bg-white` is force-flipped in dark mode as a safety net, but `bg-card` is the intent.)

---

## Elevation / shadow (3-tier + overlay)

`--shadow-*` in `@theme` → `tw:shadow-*`.

| Utility | Value | Usage |
|---|---|---|
| `tw:shadow-flat` | `none` | Borders-only surfaces |
| `tw:shadow-raised` | `0 1px 3px …, 0 1px 2px …` | Cards, list rows |
| `tw:shadow-floating` | `0 4px 16px …, 0 2px 4px …` | Menus, popovers, dropdowns |
| `tw:shadow-overlay` | `0 12px 40px …` | Dialogs |

---

## Typography

`--text-*` in `@theme` → `tw:text-<name>` font-size utilities (additive to Tailwind's `text-xs…`). Pair with the typography components (`BaseHeading` / `BaseText` / `BaseLabel`) which map to these — see audit §13.

| Utility | Size | Usage |
|---|---|---|
| `tw:text-page-title` | 28px | Page `<h1>` |
| `tw:text-section-title` | 18px | Section `<h2>` |
| `tw:text-subheading` | 15px | `<h3>` / card titles |
| `tw:text-body` | 14px | Body |
| `tw:text-label` | 12px | Form labels |
| `tw:text-caption` | 11px | Captions, helper/error, audit lines |
| `tw:text-badge` | 11px | Badges |
| `tw:text-table-header` | 11px | `<th>` |

> Retiring the ~417 `text-[Npx]` magic numbers onto these is the Phase 7 sweep.

---

## Z-Index — the stacking-order contract

Tailwind v4 has **no `--z-index` theme namespace**, so the scale lives as `--z-*` tokens in `tokens.css` and is exposed as named utilities via `@utility` in `base.css`. **Always use a name; never a raw `tw:z-50`.** Values match the numbers already in use, so adopting a name is a visual no-op.

| Utility | Value | Usage |
|---|---|---|
| `tw:z-raised` | 10 | Sticky table headers, raised cells/bars |
| `tw:z-dropdown` | 20 | In-flow select / menu panels |
| `tw:z-sticky` | 30 | Sticky page toolbars / action bars |
| `tw:z-overlay` | 40 | Modal & drawer backdrops |
| `tw:z-modal` | 50 | Dialogs, drawers — *adopted: `BaseDialog`, `BasePhoto`* |
| `tw:z-popover` | 60 | Popovers/menus that must sit above a dialog |
| `tw:z-toast` | 100 | Toasts / global notifications — *adopted: `BaseToastContainer`* |
| `tw:z-max` | 9999 | Tooltips & top-most critical UI (last resort) |

> ~25 feature files still use raw `tw:z-10/20/…` — migrating them onto these names is part of the Phase 7 sweep.

---

## Conventions governed by Tailwind (no custom tokens)

These are **deliberately not** custom tokens — Tailwind's defaults already encode the intended scale, and a parallel token set would drift or regress (see `tokens.css` notes).

- **Radius:** `tw:rounded-lg` (8px, components) · `tw:rounded-xl` (12px, cards) · `tw:rounded-2xl` (16px, dialogs). Do **not** re-add `--radius-*` (proven to shift 600+ corners).
- **Spacing / sizing:** Tailwind `gap-* / p-* / h-*`. `--space-*` / `--height-*` were removed (zero consumers).
- **Motion / duration:** use Tailwind's `tw:transition-colors` + `tw:duration-150/200/300` and **always** add `tw:motion-reduce:transition-none` / `tw:motion-reduce:animate-none` on animated primitives. No custom `--duration-*` / `--ease-*` tokens — almost everything uses the default transition, so named duration tokens would be dead.

---

## Focus ring

`--focus-ring` is applied globally to `*:focus-visible` in `tokens.css`. Interactive primitives additionally use `tw:focus-visible:ring-2 tw:focus-visible:ring-primary/30` for an inline ring. Don't invent per-component focus styles.

---

## Brand / tenant

Light/dark are wired. To **rebrand per tenant**, scope brand-token overrides under `[data-tenant="…"]` (set `data-tenant` on `<html>`) — override only `--primary` / `--primary-hover`, everything else inherits:

```css
[data-tenant='acme'] {
  --primary: #7c3aed;
  --primary-hover: #6d28d9;
}
[data-tenant='acme'].dark {
  --primary: #a78bfa;
  --primary-hover: #8b5cf6;
}
```

The template lives (commented) in `tokens.css`; add the real selector when onboarding a tenant — an inert `[data-tenant]` block is dead CSS.

---

## Adding a token (checklist)

1. Define the value(s) in `tokens.css` (both `.light` and `.dark` if it differs).
2. Wire it: a **color/shadow/text** token → add to `@theme` in `base.css`; a namespace Tailwind lacks (like z-index) → add an `@utility`.
3. Use a **named utility** in components — never the raw value.
4. Document it in the relevant table above.
5. Don't add a token with no consumer — that's the "defined-and-dead" anti-pattern that retired `--space-*` / `--height-*` / `--radius-*`.
