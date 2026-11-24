# Task F2 — the designer's Fields tab

Branch `rnd/temporal-workflows`, on top of `ad5d878`. Verified against the
live backend on `:8080` and the running Vite dev server on `:5173`, driven in
headless Chromium. **Neither server was started, stopped or restarted.**

**Status: DONE_WITH_CONCERNS.** Everything in scope works in a real browser
with no interception of any kind. The concerns are §8.

Commit: `1f53b7d` — the code. This report is the commit on top of it.

---

## 1. What was built

| File | |
|---|---|
| `src/lib/eoFieldKinds.ts` | new — the 27 kinds, the per-kind configuration contract, the draft shape, the validation |
| `src/components/eo/designer/EoFieldsTab.tsx` | new — own fields + inherited fields, add / edit / remove |
| `src/components/eo/designer/EoFieldEditor.tsx` | new — the one-field editor |
| `src/api/eoTypes.ts` | edit — `eoTypeFieldApi`: POST / PUT / DELETE on `:id/fields` |
| `src/hooks/useEoTypes.ts` | edit — own fields, inherited fields per ancestor, the three writes |
| `src/lib/eoFields.ts` | edit — `eoDestructiveRefusal` |
| `src/types/eoRecord.ts` | edit — `EoFieldKind` widened to 27, `EoFieldDefRequest`, `recompute_on` |
| `src/pages/admin/EoTypeDesignerPage.tsx` | edit — the Fields panel is the tab |
| `src/i18n/locales/{en,ar}.json` | edit — `eo.kind.*`, `eo.provenance.*`, `eo.requiredMode.*`, `eo.types.field.*`, both bundles, same keys |

The read is **not** duplicated: `eoRecordTypeApi.listFields` already served it,
and the tab shares `eoKeys.typeFields(id)` with the record module's
effective-field merge, so a field added here reaches an already-open record
form without a reload. Every write goes through F1's `useInvalidateCatalogue`,
which covers both namespaces.

---

## 2. Twenty-seven kinds, not eighteen

`models.EOFieldKinds` is built from 27 `EOKind*` constants. The brief names
eighteen and the frontend's `EoFieldKind` union carried **nineteen** —
`multi_user`, `time`, `email`, `phone`, `url`, `multi_link`,
`multi_user_status` and `multi_user_ack` were missing. A designer built from
the prose would have refused eight kinds the server accepts while believing it
was being strict. The union now mirrors the Go constant block in its order, so
the two can be diffed by eye.

---

## 3. What each kind demands, and why the list is short

`handlers.eoValidateFieldShape` checks five things and **never looks at
`config`**. So the form's configuration section is not duplicated validation;
for `config` it is the only validation there is.

| kind | what the form demands |
|---|---|
| `dropdown`, `multi_select` | at least one option; every option a non-empty **value** and **label**; no two options storing the same value |
| `link`, `multi_link` | an explicit target: **"Any record type"** or a key the catalogue resolves. A key that resolves to nothing is refused |
| the other 23 | nothing structured — and the form says so, rather than inventing boxes |

**The list is short on purpose.** `options` and `target_type_key` are the only
two config keys anything in this application reads (`EoFieldInput.tsx:169`
and `:477`, `EoFieldValue.tsx:167`). A "minimum", a "maximum" or a "pattern"
box would store and then be ignored by every form that renders the field — a
worse lie than no box. A collapsible **raw configuration (JSON)** section
stays open for anything a future renderer adds, and it is also what keeps a
round trip lossless: `applyTo` overwrites the column whenever the request's
config is non-empty and `{}` is non-empty, so an editor that modelled only
part of a field's config would destroy the rest on the first save.

**A `link` with no target is NOT refused**, and the brief's example is wrong
about this one: `Directive.origin_record` ships with `config: {}` and
`EoRecordPicker` documents that as "any record type", searching the whole
register. Demanding a target would have made the pilot's own field
unsaveable. What the form demands instead is that the absence be a **choice**
— the picker's first option says "Any record type" in as many words.

### Requiredness

| mode | what the form demands |
|---|---|
| `never`, `always` | nothing |
| `conditional` | a `required_rule`. Without one, `services.ValidateRecordValues` returns `field %q is conditional but has no required_rule` on **every** subsequent save of **any** record of the type — a loud failure at the wrong moment, and the server stores the field that causes it without complaint |
| `at_state` | at least one state. Without one the switch finds no matching id and the field is **never required anywhere** — the opposite failure, and worse for being silent |

A `derived` provenance demands a formula; the server refuses that too, and the
form refusing first keeps the message beside the formula box.

The rule and the state list are **cleared** when the mode stops using them, so
switching a field from conditional to always does not leave a live-looking
rule behind.

### Two warnings that are not refusals

- a kind `EoFieldInput` has no case for (`email`, `phone`, `url`, `time`,
  `multi_user`, `multi_link`, `multi_user_status`, `multi_user_ack`) renders as
  a **plain text box** on every record form. The editor says so and the list
  badges it. The kind is valid and the value stores; it is the renderer that
  is missing;
- a `derived` field with an empty `recompute_on` can only use values on the
  record itself, so a formula naming a child or an ancestor silently resolves
  to nothing (`services.RecomputeDerived` drops it from the result map).

The list also flags these on fields **it did not create** — eleven types and
127 definitions were seeded before this screen existed.

---

## 4. Inherited fields

They are a **separate query over the ancestor chain** (`parent_type_id`,
nearest-parent-first, walked backwards so the root type's fields lead) and a
**separate table with no controls in it** — not disabled copies of an editable
row. That is not a style choice: the three write routes are scoped to
`:id/fields`, so an ancestor's definition is not addressable from a
descendant's designer at all. Each row carries a lock glyph, names the type
that declares it, and links to that type's own Fields tab. Proved by DOM
count: **0 buttons, inputs, selects or textareas inside the inherited rows**.

Neither `GET /:id` nor `GET /:id/fields` resolves the chain — both answer
about a type's own definitions — so the merge is the client's, as
`services.ResolveEffectiveFields` does it on the server. If an ancestor's
read fails the list says it is **incomplete**, because a missing ancestor is
not an ancestor with no fields.

A key declared on both sides is an **override**, not a collision
(`services.ResolveEffectiveFields`: the child's definition replaces the
ancestor's *at the ancestor's position*). Both rows are shown and each says
what the other does to it — `Overrides eo_base` on the own row, `Replaced by
this type's own definition` on the inherited one. Visible on the live
Directive, whose `due_date` overrides `eo_base`'s (screenshot 09).

---

## 5. How a server refusal is surfaced

Two different 400s come back from these routes and a client that reads one
loses the other.

1. **Attribute shape** — `{success:false, errors:{attr: msg}, error:"<headline>"}`.
   The map goes onto the controls (the mapping of
   `IncidentCreatePage.tsx:913-938`); the headline is capped at three
   attributes by `handlers.eoFieldErrorSummary` and goes to the toast, never
   over a field's own message.
2. **The §7.14 guard rail** — `{success:false, error:"<sentence>"}` with **no
   map**. No attribute of the field is wrong, so it is not a field error: it
   is an amber banner at the top of the dialog, which stays open, carrying the
   server's sentence verbatim plus one line saying a confirmation is what
   overrides it. On a removal it lands inside the confirm dialog, where the
   operator already is. Both carry `data-testid`s —
   `eo-field-destructive-refusal`, `eo-field-delete-refusal` — and both are
   where **Task F5's** confirmation attaches.

**They are told apart by the shape of the body, not by the words.** The
sentence is built per rule in `models.eoDestructiveChanges` and varies; a
text match would go stale the first time a rule is reworded, which is a guard
keyed on a signal that stops arriving. Every attribute-shape refusal on these
routes goes through `handlers.eoFieldErrors` and therefore carries an `errors`
map; the guard rail answers through `utils.ErrorResponse` and carries only
`error`. A 400 with a sentence and no map is the guard rail. The one other
400-without-a-map these routes can produce is an unparseable body, which this
client cannot send.

**No edit is withheld on the strength of the record count.** F1's count is the
caller's own register view and may read 0 where the server holds records, so
every button is offered, the request goes out, and the server's refusal is
what the operator reads. Proved live: the Directive holds 4 records and both
the kind change and the removal were refused by the server, not by the form.

---

## 6. The defect this round produced, and where it was caught

**The link-target check was inert.** `eoDraftConfig` deleted
`target_type_key` from the merged config whenever the picker was on "any
record type" — one line before the check written to catch a bad target. The
structured picker only ever offers real keys, so the one input that could
produce a bad target was being discarded before validation saw it. The check
could not fire on any path.

It was caught **in the browser**: a save with `{"target_type_key":"eo_nope"}`
typed into the raw-configuration box went through with a 201 while the form
reported nothing. The `delete` is gone, the picker now owns the key only when
it has one, and the check fires on both paths — 0 requests sent, "No record
type has that key" under the picker (screenshot 15).

The same question was asked of every other check. Each was then made reachable
and each was fired in the browser: a `dropdown` with no options, a
`conditional` with no rule, an `at_state` with no states — and a **second**
reachable path for the target check was added, a stored key the catalogue no
longer resolves (after a type is deleted or re-keyed, both of which the
designer allows). Without an option of its own the select rendered blank and
the next save would have silently rewritten the field to "any type"; it now
renders as `<key> — no record type has this key` and is refused.

---

## 7. What was proved live, and what was intercepted

**Nothing was intercepted. Every response in every run is the real server's.**
No request was stubbed, no identity rewritten, no route faked.

Proved live:

- the Fields tab on a child type: 17 inherited rows from `eo_base`, 0 editable
  controls inside them;
- a `dropdown` with no options refused **with no request sent** (network log:
  0 calls on the field routes while refusing);
- a `conditional` with no rule refused, still 0 requests;
- the same dropdown with two options → `POST …/fields` **201**, the row
  appears with no reload, and it is still there after a full page reload, with
  both options read back into the editor;
- a kind with no form control saved anyway, badged `Plain text box` in the
  list and warned about in the editor;
- `at_state` on a type with no workflow refused, naming the reason (that type
  has no workflow and no screen can give it one);
- a link target naming no type refused, 0 requests;
- on the live Directive (4 records): `PUT …/fields/:id` changing kind →
  **400**, the server's sentence on screen; `DELETE …/fields/:id` → **400**,
  likewise, inside the confirm dialog;
- `Overrides eo_base` on the Directive's `due_date`;
- dark mode (no white cards) and Arabic RTL (`document.dir === "rtl"`, **0 px**
  of horizontal overflow).

### Screenshots

`/tmp/claude-1000/-home-ks-lig-cintrix/115a9cf0-c151-4a35-b57a-ea44e666a33c/scratchpad/f2shots/`

| file | what it shows |
|---|---|
| `01-inherited-read-only.png` | the tab on a child type — 0 own fields, 17 inherited rows, lock glyphs, no controls |
| `02-editor-dropdown-empty.png` | the editor with kind = Dropdown and no options yet |
| `03-refused-dropdown-no-options.png` | the refusal under the options editor; no request was sent |
| `04-refused-conditional-no-rule.png` | `conditional` with no rule, refused; still no request |
| `05-editor-dropdown-with-options.png` | two options filled in |
| `06-field-added.png` | 201, the row present with no reload |
| `07-persists-after-reload.png` | the same row after a full reload — "1 own fields" in the header |
| `08-options-round-trip.png` | reopening the field: `email` / `post` read back from the server |
| `09-directive-fields.png` | a type that holds records — the warning banner, `Overrides eo_base` on `due_date` |
| `10-destructive-kind-change-refused.png` | the server's kind-change refusal, verbatim, dialog still open |
| `11-destructive-removal-refused.png` | the removal refusal, inside the confirm dialog |
| `12-kind-without-renderer-warned.png` | kind = Email address — warned, not refused |
| `13-plain-text-box-badge-in-list.png` | the badge on the list row |
| `14-at-state-no-workflow-refused.png` | `at_state` on a workflow-less type, with the reason |
| `15-link-target-unknown-refused.png` | the target check firing — the §6 defect, fixed |
| `16-fields-tab-dark.png` | dark mode |
| `17-fields-tab-arabic.png` | Arabic RTL, 0 px horizontal overflow |
| `18-editor-arabic-refusal.png` | the editor mirrored, the options refusal in Arabic |

### Re-running

```
node .../scratchpad/f2e2e.mjs     # inherited, the two form refusals, create, reload, both server refusals
node .../scratchpad/f2extra.mjs   # renderer warning, at_state, link target, dark, Arabic
```
Both need a record type with **no records**; they are written against
`eo_f2_probe`, which was created for the run and removed afterwards. Recreate
it (parent `eo_base`, prefix `F2PR`, pattern `F2PR-YYYY-NNN`) and substitute
its id.

---

## 8. Concerns

1. **A designer-created type has no workflow, and the Fields tab is where it
   first hurts.** `at_state` requiredness and `is_locked_after_state_id` both
   need the type's workflow states, and a type created on this screen has no
   `workflow_id` — the create form sends none and no attributes editor exists.
   The tab reports it rather than hiding the control, but **two of the four
   requiredness modes are unreachable on every type this platform's own
   designer can create.** This is F1's carry-forward; it did block part of
   this task and it is the next thing worth fixing.
2. **`required_rule` and `formula` are free text, validated by nobody until a
   record is saved.** The form demands that a conditional field *has* a rule;
   it cannot tell whether the rule compiles, and a rule with a syntax error is
   a 500 on the next record save rather than a refusal here. The server has
   the evaluator — `eoformula` — and a `POST /admin/eo-formula/validate` that
   compiled a rule against a type's effective field set would move that whole
   class of failure from runtime to configuration time. Backend.
3. **`recompute_on` is a JSON textarea.** The dependency shape
   (`{type, field, scope, aggregates}`) is small and structured enough to
   deserve an editor, and `scope: "child"` could offer the child types by key.
   It was left as text because the only validation available for it is "is it
   an array", and a structured editor that could not check the rest would
   suggest more safety than it has.
4. **`ar_untranslated` is not in the editor, deliberately.** It is write-only
   on the sign-off route and `TestFieldDefRequestCannotCarryTheUntranslatedMarker`
   pins its absence from the request, so a designer save cannot clear it. The
   consequence is that the tab gives no sign of which labels are awaiting
   Arabic sign-off, although every seeded definition carries the flag. A
   read-only badge sourced from the field read would be honest and is not in
   scope here.
5. **A `PUT` sends the whole attribute set, including three jsonb columns.**
   `applyTo` applies `config`, `required_at_state_ids` and `recompute_on` only
   when non-empty, and `{}` and `[]` are non-empty — so they are always sent,
   which is what makes "delete the last option" actually clear it. The flip
   side is that any config key a future renderer adds must be modelled here or
   round-tripped through the raw section, or an ordinary save will drop it.
   The raw section exists for exactly that and the stripping is keyed on the
   kind, not on a fixed key list.
6. **The editor's `siblingKeys` pre-check is a better message, not a
   guarantee.** `handlers.CreateField` refuses a duplicate key too, and the
   unique index refuses it below that. The form check is there so the message
   names the type rather than the row.

---

## 9. Demo data

Created, during verification: one record type `eo_f2_probe` ("F2 Probe Type",
parent `eo_base`, prefix `F2PR`), the three permission rows the backend seeds
with it, and three field definitions on it (`probe_channel`, `probe_email`,
and one `probe_link` from the run that caught the §6 defect).

Removed, all of it: every field definition, the type, and the three
permissions. **No EO records were created, and no seeded definition was
changed** — the two destructive attempts on the Directive were both refused by
the server, which is what they were for.

Final counts, read back from the live server:

| | |
|---|---|
| record types | **12** |
| permissions | **179**, none matching `f2_probe` |
| EO records | **48** |
| `eo_directive` | **14** own fields, `decision_reference` still `text` |

---

## 10. Checks

`npm run type-check` passes. `npm run lint` reports the same **two**
pre-existing errors and nothing else (`e2e/fixtures.ts`,
`src/hooks/useSavedViews.ts:88`). `npx prettier --check` passes on every file
touched. `package-lock.json` was left **unstaged and unmodified**; staging was
by explicit path throughout.
