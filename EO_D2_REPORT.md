# Task D2 — Link fields offer a record picker

Branch `rnd/temporal-workflows`. One commit: *feat(eo): record picker for link fields*.

**Status: DONE.** Exercised end to end in headless Chromium against the live
backend on `:8080` and Vite on `:5173`. `npm run type-check` passes; `npm run
lint` reports the same 2 pre-existing errors as before the change, 0 in any
file this task touched.

---

## 1. What the field did, and what it does now

`origin_record` on the Directive type is `kind: "link"`. The dynamic form
rendered it as a plain text input labelled "Related record id", so saving one
meant pasting a UUID. It now renders `EoRecordPicker`: a combobox that searches
the register and lists each hit as **`reference — subject`**, storing the
record's id exactly as before.

The read-only side had the same defect in the other direction — `EoFieldValue`
had no `link` case, so the detail page and register cells printed the stored
UUID. It now resolves the id to the same `reference — subject` label.

---

## 2. What the field definition actually says

The brief said to inspect a real definition rather than guess the config key.
Doing so changed the design twice.

**The key is `target_type_key`**, confirmed against the live API and against
`internal/database/seed_eo_pilot.go:1762,1809,1899,1945`. All eight `link`
definitions in the pilot:

| type | field | `config` |
|---|---|---|
| `eo_assignment` | `from_stage` | `{"target_type_key":"eo_execution_plan_stage"}` |
| `eo_decision_record` | `supersedes` | `{"target_type_key":"eo_decision_record"}` |
| `eo_execution_plan` | `supersedes` | `{"target_type_key":"eo_execution_plan"}` |
| `eo_referral` | `parent_referral` | `{"target_type_key":"eo_referral"}` |
| `eo_directive` | **`origin_record`** | **`{}`** |
| `eo_base` | `record_type_id`, `parent_record_id` | `{}` (engine-owned, never rendered) |
| `eo_decision_record` | `parent_record_id` | `{}` (engine-owned) |

**The pilot's one conditional link field carries no target type at all.**
`origin_record` is `required_mode: conditional`, `required_rule:
directive_origin in ["correspondence","official_visit","media_commitment"]` —
and a directive's origin may be a correspondence, a visit or a committee, which
are different record types. So an empty `config` there is *"any record type"*,
not a misconfiguration. A picker that treated a missing key as an error, or
that defaulted to the field's own type, would have been wrong on the one field
this task was asked to prove.

The picker therefore has two modes, both exercised below:

- **target type given** — `record_type_id` is sent, and the panel says
  "Showing *Referral* records only".
- **no target type** — the whole register is searched and each row carries its
  record type's name underneath, so a reader can tell an `EO-DIR-` from an
  `IN-` at a glance.

A third guard: when a `target_type_key` is present but the type catalogue has
not loaded yet, the query is held rather than run unscoped. Searching every
type for a moment would have offered records the server then rejects.

---

## 3. Why `POST /search` and not `GET /eo-records`

Both exist. `GET` binds `models.EORecordFilter` through Fiber's `QueryParser`,
where `record_type_id` is a `[]string` and so must be sent as repeated query
params. `POST /eo-records/search` binds the same struct from a **body**
(`internal/handlers/eo_record_handler.go`), where it is a plain JSON array.
The picker sends one type id and the body form is the honest way to say so, so
`useEoRecordSearch` uses `POST`. Verified in the browser's network log:

```
{"record_type_id":["a44eb4f9-d1c0-497b-b6af-bc57b2c980c5"],"limit":20,"page":1}
```

---

## 4. A localisation bug the task surfaced

The brief said to use `useLocalizedField()` for `label`/`label_ar`, and that
"subjects have the same `_ar`/`_en` pairing". They do not, quite.

A record has `subject_en` **and** `subject_ar` but **no bare `subject`
column**, and `useLocalizedField`'s last resort (`src/hooks/useLocalizedField.ts:44-46`)
is that bare key. So:

- English reader: `langSuffix("en")` is `""`, the current-language branch is
  skipped, the default-language branch is skipped, and it falls through to
  `record["subject"]` → **`""` for every record**.
- Arabic reader with no `subject_ar`: falls through to the same `""` rather
  than to the English subject.

The hook is still used — it is what picks `subject_ar` for an Arabic reader —
with the fallback it cannot provide added after it, in
`eoRecordSubject()` / `eoRecordLabel()` (`src/lib/eoFields.ts`). The same
fallback chain was already inlined in three pages
(`EoRecordsPage.tsx:145`, `EoRecordDetailPage.tsx:131`, `EoRecordEditPage.tsx:74`);
it is now stated once. Those three call sites were left as they are — this task
was not a refactor — but they are the obvious follow-up.

Field labels, dropdown option labels and record-type names still go through
`useLocalizedField()` unchanged, because those shapes do have the bare key.

---

## 5. Files

### New
```
src/components/eo/EoRecordPicker.tsx      the picker (375 lines)
```

### Edited
```
src/components/eo/EoFieldInput.tsx    kind `link` → EoRecordPicker
src/components/eo/EoFieldValue.tsx    kind `link` → resolved reference — subject
src/components/eo/index.ts            barrel export
src/hooks/useEoRecords.ts             eoKeys.search() + useEoRecordSearch()
src/lib/eoFields.ts                   eoRecordSubject() / eoRecordLabel()
src/types/eoRecord.ts                 EoFieldConfig.target_type_key, EoRecordSearchBody
src/i18n/locales/en.json              11 eo.form.link* keys
src/i18n/locales/ar.json              the same 11, in Arabic
```

Nothing else was touched. `package-lock.json` carries an uncommitted
modification that is not from this task; it was left unstaged and unchanged.

---

## 6. Conventions followed

- **React Query, frozen key factory.** `eoKeys.search(body)` added to the
  existing factory; `useEoRecordSearch(body, enabled)` sits beside the other
  module hooks. `enabled` keeps the register unqueried until the dropdown
  opens; `keepPreviousData` stops the list blanking between keystrokes while
  the 300 ms debounce catches up. The selected record resolves through
  `useEoRecord(id)`, i.e. the same `eoKeys.detail` cache the detail page fills,
  so reopening an edit form costs nothing.
- **No react-hook-form, no zod.** The picker is a controlled `value`/`onChange`
  pair inside the existing `useState` + `errors` form. It takes `invalid` (a
  boolean for the red ring) rather than `error`, because `EoFieldInput`'s
  wrapper already prints the message and two copies would be worse than none.
- **Plain markup, token colours.** Modelled on `src/components/ui/SelectInput.tsx`:
  trigger plus an absolutely positioned panel, all
  `bg-[hsl(var(--background))]` / `text-[hsl(var(--foreground))]`, so dark mode
  needs no `dark:` twin. No new shared primitive was introduced.
- **Direction-agnostic CSS only.** `text-start`, `ps-8`, `pe-8`, `ms-2`,
  `start-2.5`, `end-2.5`. No `text-left`, `pl-*`, `ml-*`, `left-*`, no
  `paddingLeft`. Nothing D3 cleaned up was reintroduced.
- **Empty value is `""`, never `null`.** Clearing the picker sends `""`, for
  the reason `src/lib/eoFields.ts` documents: the server's formula evaluator
  fails on a `null` inside a conditional `required_rule`.

---

## 7. Browser verification

Screenshots in
`/tmp/claude-1000/-home-ks-lig-cintrix/115a9cf0-c151-4a35-b57a-ea44e666a33c/scratchpad/d2shots/`.
Drivers: `…/scratchpad/d2e2e.mjs` (main flow + Arabic) and
`…/scratchpad/d2scoped.mjs` (the scoped target-type path).

Exercised on **`EO-DIR-2026-005` → Origin record**, the pilot's real
conditional link field.

| shot | what it shows |
|---|---|
| `01-form-picker-closed.png` | the edit form, picker collapsed, showing the stored link resolved |
| `02-picker-open-results.png` | panel open: search box, 7 rows as `EO-DIR-2026-005 — Browser E2E directive 651643` with the type name beneath |
| `03-picker-search-filtered.png` | typing `IN-2026` narrows to the single `IN-2026-0001 — Smoke test incoming letter` |
| `04-record-chosen.png` | trigger reads `IN-2026-0001 — Smoke test incoming letter`, clear ✕ present |
| `05-after-save-detail.png` | `PUT /eo-records/… → 200`, redirected to the detail page |
| `06-detail-reloaded-link.png` | **hard reload**: `ORIGIN RECORD · IN-2026-0001 — Smoke test incoming letter`, not a UUID |
| `07-edit-reopened-roundtrip.png` | edit form reopened from scratch: the picker resolves the stored id back to the same label |
| `08-arabic-picker-open.png` | `document.dir === "rtl"`, layout mirrored, chevron and ✕ on the left, search icon and text right-aligned, subjects rendered from `subject_ar` |
| `09-arabic-dark-picker.png` | the same in dark mode — no white panel, no unstyled control |
| `10-scoped-target-type.png` | `Referral.parent_referral`: "Showing Referral records only" and the correct empty state (no referral records are seeded) |

Round-trip confirmed twice over: once through the detail page after a full
page load, and once by reopening the edit form in a fresh navigation — both
render `IN-2026-0001 — Smoke test incoming letter`. The whole flow was re-run
against the committed tree after the pre-commit hook reformatted the files.

---

## 8. Concerns

1. **The brief's lint baseline is slightly off.** It says `e2e/fixtures.ts` has
   2 pre-existing errors. It has **one** (`react-hooks/rules-of-hooks:35`); the
   second is `src/hooks/useSavedViews.ts:88` (`react-hooks/refs`). Both are
   pre-existing and neither file was touched. Total is 2 errors before and
   after, as required — just not both in the file named.
2. **Every target-scoped link field points at a type with zero records.**
   `eo_referral`, `eo_execution_plan_stage`, `eo_decision_record` and
   `eo_execution_plan` are all unseeded, so the scoped path could only be
   proven as far as the correct request body, the correct banner and the empty
   state. The populated path was proven on the unscoped `origin_record`.
   Seeding one record of each would close this.
3. **The panel is an absolutely positioned element with no collision
   detection.** On `Referral.parent_referral`, the last field on its form, the
   list opens below the fold and the page must be scrolled. This is exactly how
   the repo's existing `SelectInput` behaves, so the picker is not worse than
   its neighbours — but a form whose link field sits at the bottom will feel
   cramped. A shared popover primitive would fix both at once; introducing one
   was outside this task.
4. **Results are capped at 20 with no paging.** Past that the footer says
   "Showing 20 of N — refine the search". With 7 records in the pilot this is
   academic; in a real register, a type with hundreds of records will need
   either infinite scroll or a "see all" escape hatch.
5. **A link the reader cannot see degrades, it does not explain.** If
   `GET /eo-records/:id` 403s under §7.11 row-level visibility, both the picker
   and the detail page show "Linked record (not accessible)". That is the right
   answer, but it is indistinguishable from a deleted record — and EO has no
   delete, so in practice it always means a permission boundary.
6. **Test records remain in the pilot database**, from this run and the
   earlier module work: `EO-DIR-2026-002` through `-005`. `EO-DIR-2026-005` now
   also carries `origin_record → IN-2026-0001`, set by this verification. Same
   cleanup as before:
   `DELETE FROM eo_records WHERE subject_en LIKE 'Browser E2E directive%' OR subject_en = 'UI smoke create';`
7. **`EoFieldValue` now issues one `GET /eo-records/:id` per link cell.**
   React Query dedupes by id and the detail page has usually warmed the cache,
   but a register column built on a link field would fan out one request per
   row. No register currently uses one (`registerColumnFields` picks the first
   few non-engine fields, and no type puts a link there), so this is latent
   rather than live.
