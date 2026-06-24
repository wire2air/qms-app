# Form Field Rules Engine — design (2026-06-24)

> Moves form validation from a single central `validate()` function onto the
> fields themselves: each `BaseField` declares its own `:rules`, the form
> collects them on submit, and errors render both inline (under the field) and
> in the existing `ValidationSummary`. Builds on the form system
> ([2026-06-23-form-system-design.md](2026-06-23-form-system-design.md)) and is
> proven first on the Phase-1 reference form, `NonconformancesCreate.vue`.

## Problem

Today `BaseForm` takes one `:validate` function that returns
`[{ id, label, message }]`. For `NonconformancesCreate.vue` that's a ~25-line
block listing every field, its id, its label, and its message — duplicating
information already present in the template (each field already has an `id`, a
`label`, and a `required` flag). The function lives far from the fields it
guards, and `BaseField`'s existing `:error` slot (inline per-field error) goes
unused — all errors funnel through the top summary only.

We want validation rules co-located on each field, a small reusable validator
library with overridable messages, and inline per-field errors — without a
big-bang rewrite of the other ~49 forms still on the central `validate()`.

## Approach (chosen: A)

Each `BaseField` gains `:value` and `:rules`. Fields self-register with the
enclosing `BaseForm` via provide/inject. On submit, `BaseForm` runs every
registered field's rules, merges the results with the (still-supported) legacy
`:validate` prop, and feeds the existing `ValidationSummary` + jump-to-field.
Each field also owns its own inline `:error`, set from the same run.

Rejected alternatives:

- **B — `BaseField` owns the `v-model`.** Cleaner (no double-binding) but
  changes the binding contract of every input in every migrated form and forces
  every custom control (`SegmentedControl`, the `XSelectMenu`s, `BaseDateField`)
  to conform. Too large and risky mid-migration.
- **C — keep central `validate()`, add validator helpers.** Smallest change but
  doesn't move rules onto components or give inline-per-field errors, so it
  doesn't meet the goal.

Back-compat is explicit: the `:validate` prop keeps working, so forms migrate
off the central function one at a time.

## Components

### 1. `validators.js` — the rule library

`resource/js/shared/components/form/validators.js`

A rule is `(value) => true | string`. A string return is the error message; the
field stops at its first failing rule. Factories return rules.

**Shipped now** (everything the NC form needs — all ten of its rules are
"required" or "required-when"):

```js
required(msg?)              // fails on '', null, undefined, [], NaN; false counts as empty
requiredWhen(condFn, msg?)  // runs required() only when condFn() is truthy; condFn closes over `form`
// raw inline rules need no factory:  :rules="[v => v > 0 || 'Must be positive']"
```

**Deferred** — one-liners to add the first time a migrating form needs each;
not shipped speculatively (no call sites = untested in practice):
`minLen`, `maxLen`, `min`, `max`, `pattern`, `email`.

#### Message resolution

When a rule fails, the message is resolved in this order:

1. The explicit `msg` passed to the factory (`required('Give it a title')`).
2. Else a default templated from the field's `label`, supplied by `BaseField`
   at run time: `required` → `"{label} is required."`. (`requiredWhen` reuses
   `required`'s default.)
3. Else a generic fallback when the field has no label
   (`"This field is required."`).

So `required()` on a field labeled "Title" yields `"Title is required."`
automatically, and any rule's message can be overridden inline. To make
label-aware defaults work, a factory's default is a function of the label;
`BaseField` passes its `label` when invoking the rule. Concretely, a rule may
return either a string or a `(label) => string` resolver for its default
message; `BaseField` resolves the latter. Explicit `msg` is always a plain
string and wins.

### 2. `BaseField` — self-registering field

`resource/js/shared/components/form/BaseField.vue`

New props:

- `value` — the value to validate (the same thing bound to the inner control's
  `v-model`). Passing it explicitly keeps `BaseField` a wrapper and avoids
  changing every control's binding contract (that's Approach B).
- `rules` — `Array` of rules, default `[]`.

Behavior:

- `inject`s a registry provided by `BaseForm`. On mount registers
  `{ id, label, validate }`; unregisters on unmount. If there is no provider
  (field used outside a `BaseForm`), registration is a no-op and the field still
  renders + still honors an externally-passed `:error`.
- Owns an internal `error` ref. The rendered error is `props.error || internalError`
  (an explicitly-passed `:error` — e.g. a server error — still shows).
- `validate()` runs each rule against `props.value` in order, stops at the first
  failure, resolves its message (passing `label` for defaults), sets the
  internal `error`, and returns `{ id, label, message } | null`.
- `id`/`label` for the returned object reuse the field's existing `fieldId` and
  `label` props — no new identifiers to keep in sync.

### 3. `BaseForm` — collect + merge

`resource/js/shared/components/form/BaseForm.vue`

- `provide`s a registry (a reactive `Set`/`Map` of registered fields) and
  register/unregister functions.
- `submit()` (current pipeline) additionally: runs every registered field's
  `validate()`, concatenates those `{ id, label, message }` results with the
  result of the optional `:validate` prop, de-dupes by `id` (existing
  `shownErrors` logic already de-dupes), then drives `ValidationSummary` +
  `focusField` exactly as today.
- Field order in the summary follows DOM/registration order so "jump to first
  error" lands on the topmost offending field.

## Interaction model (touched / live revalidation)

- Nothing shows until the **first submit attempt** (unchanged from today —
  `attempted` gates `shownErrors`).
- Once a field has been flagged invalid ("touched"), it **re-validates live** on
  `value` change and clears its own inline error the instant it passes; the
  summary shrinks correspondingly (same `attempted`-resets-clean watch that
  exists now, now also driven by per-field state).
- A field never yet invalid stays quiet until the next submit.

## Data flow

```
submit()
  ├─ for each registered BaseField: field.validate()  → {id,label,message}|null  (also sets inline error)
  ├─ props.validate?.()                                → [{id,label,message}]      (legacy escape hatch)
  ├─ merge + de-dupe by id  → shownErrors
  └─ shownErrors.length ? show ValidationSummary + focus first : emit('submit')
```

## NonconformancesCreate.vue — target shape

The central `validate()` is deleted. Each field carries its rule:

```vue
<BaseField id="nc-title" label="Title" required
  :value="form.title" :rules="[required()]">
  <template #default="field">
    <BaseTextInput v-bind="field" v-model="form.title" placeholder="Describe the nonconformance…" />
  </template>
</BaseField>

<BaseField id="nc-supplier" label="Supplier" :required="form.isSupplierFacing"
  :value="form.supplierId"
  :rules="[requiredWhen(() => form.isSupplierFacing,
    'Pick a supplier before marking this NC as supplier-facing.')]">
  …
</BaseField>
```

The ten current rules map directly: title, severity, type, source, site,
department, owner, detected date, workflow version → `required()`; supplier →
`requiredWhen(() => form.isSupplierFacing, …)`. `workflowVersionId` is bound on
a section, not a labeled field, so its rule attaches to the `BaseField`/wrapper
carrying `id="nc-workflow"` (or stays in a minimal `:validate` if no field owns
it — decided during implementation against the actual template).

## Out of scope

- The deferred validators (`minLen`, etc.) — added on demand.
- Approach B's model-owning `BaseField`.
- Async/server-side rules — server errors keep arriving via `:submitError`
  (form-level) and `:error` (field-level), unchanged.
- Migrating the other ~49 forms — this only converts the Phase-1 reference;
  the rest follow the form-migration plan one at a time.

## Verification

Per the migration's definition of done, build/lint passing ≠ verified. On the
real Raise-NC screen: submit empty → every required field shows an inline error
and the summary lists them; fix one → its inline error and summary entry clear
live; toggle "supplier-facing" without a supplier → the supplier rule fires;
valid submit → proceeds to the existing reviewer/CAPA flow.
