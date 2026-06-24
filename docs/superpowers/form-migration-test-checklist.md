# Form Migration — Runtime Test Checklist

> Covers the 34 forms migrated in commit `0c55e17` (creates + dialogs + detail
> pages). All auto-checks pass (eslint, lint:forms/layout/ds, vitest 807, `pnpm
> build`) — this list is for the **runtime/visual** behaviors those can't verify.
> The patterns are uniform, so you don't need to test all 34: do the **Must-test**
> items (real behavior changes / unique flows), then **spot-check** a couple per
> surface.

Generic things to look for everywhere:
- **Validation**: submitting with a required field empty shows an **inline error
  under the field** + a **red summary box at the top** listing the issues (clicking
  one jumps to the field); the error **clears live** when you fix it. **No toast**
  for validation anymore.
- **No console errors/warnings** when the screen opens (esp. "Extraneous children").

---

## A. Full-page creates (6) — `*Create.vue`

**Must-test:**
- [ ] **Raise NC** (`/nonconformances/new`): empty submit → inline + summary; toggle
      **Supplier-facing** without a supplier → supplier error fires; valid submit →
      supplier-facing opens the **CAPA shortcut dialog**, internal opens the
      **reviewer picker**. Type then **Cancel** → unsaved-changes prompt.
- [ ] **Documents create**: the **3 tabs** (Properties / Content / Training) are still
      there (NOT one long scroll); a required Properties field (e.g. Title) blocks
      submit with an inline error even though it lives in the Properties tab.
- [ ] **CAPA create** & **Change Request create**: empty submit validates; valid
      submit still opens the workflow **reviewer picker** / creates the draft.

**Spot-check:**
- [ ] **Customer Complaint create**: Subject required; submit + create works.
- [ ] **Training create**: Title required; create works.

---

## B. Dialogs (18) — `*Dialog.vue`

**Must-test (unique flows):**
- [ ] **CAPA effectiveness check — Complete** (and **Renew**): validation fires first,
      then the **e-signature** step still appears, then it completes. (Schedule = just
      a date.)
- [ ] **Audit "Create" dialogs** (Instance / Program / Standard): both the **Create**
      and **Create & open** buttons validate, and "& open" navigates to the new record.
- [ ] **Audit Standard — Import**: the import/preview flow still works end-to-end.
- [ ] **Convert Complaint → NC**: conversion still creates the NC and navigates.
- [ ] **Add Record** (the 3-step wizard): all 3 steps still work (this one was kept a
      wizard, not converted to a plain dialog).
- [ ] **Complaint Form Edit** (the form builder): the builder (add/remove/config
      fields, preview, logo) is unchanged; only the name field validates inline.

**Spot-check (the uniform pattern):**
- [ ] **Add Product Family** (you already validated this) — reference behavior.
- [ ] **Quality Event** create, **Defect Catalog** create, **Training Matrix Add**
      (training + role selects; the "all roles already mapped" hint only shows when
      there truly are none left).
- [ ] On any one: cause a save to fail if you can → error shows **in the dialog footer**
      and the dialog **stays open** with your data intact; a successful save **closes** it.

---

## C. Detail pages (11) — `*PageId.vue` / `*DetailPage.vue`

These already autosaved; the change is visual (cards → `FormSection`) plus two
toast→inline fixes. **Confirm autosave/inline-edit still works** and sections render.

**Must-test:**
- [ ] **NC detail**: sections (NC Details / Disposition / Linked CAPAs) render as cards;
      **inline-edit a field → it still autosaves**; the **Linked CAPAs** section only
      appears when the NC requires a CAPA; supplier chips show in the section header.
- [ ] **Change Request detail → Cancel**: cancelling with an empty reason shows the
      required error **inline in the cancel dialog** (not a toast); the action is still
      blocked until you fill it.
- [ ] **Training detail → Publish** without a Training Manager set: shows the error
      **inline in the publish dialog** (not a toast); publish is still blocked.

**Spot-check:**
- [ ] **CAPA detail** and **Customer Complaint detail**: sections render as cards,
      header actions (counts / Add buttons / version chips) still present + working,
      inline-edit autosaves, right-rail unchanged.
- [ ] **Audit Instance/Program/Standard detail**, **Log Book detail**: open each,
      confirm sections render and nothing is visually broken.

---

## If something's wrong
Note the **screen + what you did + what you saw** and send it back — I'll fix it and
re-scan the whole class (like the cron-hint slot bug, which I then build-gated against).

## Not yet migrated (don't test — still old style)
Phase 4 settings/admin cards, Phase 5 list/home pages, Phase 6 panels + auth
(48 files remain in the allowlist).
