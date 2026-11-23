# Executive Office (EO) frontend module — implementation report

Branch: `rnd/temporal-workflows`. Verified against the live backend on
`http://localhost:8080` and the Vite dev server on `:5173`, driven in headless
Chromium (Playwright).

**Status: DONE_WITH_CONCERNS** — all five scope items work end to end in a real
browser. The concerns are backend gaps and two deliberately deferred controls,
listed in §6.

---

## 1. What works, proven in the browser

Every row below was exercised through the UI, not through curl. Screenshots in
`/tmp/claude-1000/-home-ks-lig-cintrix/115a9cf0-c151-4a35-b57a-ea44e666a33c/scratchpad/eoshots2/`.

| # | Scope item | Result | Evidence |
|---|---|---|---|
| 1 | EO register | **works** | 4 real records (`EO-DIR-2026-001/002`, `TSK-2026-00001`, `IN-2026-0001`), state badges resolved to names, type filter, priority filter, pager — `01-register-all.png` |
| 2 | Record detail | **works** | 26 fields rendered by kind, dropdowns as labelled pills, org_unit as "Executive Office", children tab, transitions count — `04-detail.png`, `13-after-transition.png` |
| 3 | Dynamic create/edit form | **works** | Form generated from the type's effective fields; **created a real record through the UI** (`POST /eo-records` → 201, reference `EO-DIR-2026-003` issued by the engine); edit prefilled and saved (`PUT` → 200) — `10-create-filled.png`, `14-edit-prefilled.png` |
| 4 | Transitions | **works** | Modal listed the two real transitions, executed one, **state moved Recorded → Planning** (`POST /:id/transition` → 200) — `12-transition-selected.png`, `13-after-transition.png` |
| 5 | Wiring | **works** | Dashboard card present and routed; sidebar lists all 11 concrete record types; routes, permissions and i18n in place — `00-dashboard.png` |

Also verified: **dark mode** (`16-dark-create.png`, `17-dark-register.png` — no
white cards) and **Arabic RTL** (`18-arabic-register.png`,
`19-arabic-create.png` — `document.dir === "rtl"`, layout mirrors, chevrons
flip, chrome strings in Arabic, field labels without `label_ar` degrade to
English exactly as specified).

`npm run type-check` passes. `npx eslint` over every new file: 0 errors, 0
warnings.

---

## 2. Where the brief was wrong, and what I did instead

The brief is accurate on conventions. On the **API contract** it was written
from the Go models rather than from live responses, and five details differ.
Each was verified by calling the backend before any code was written.

### 2.1 Field definitions do not come with the record type
`GET /admin/eo-record-types` returns no `fields` key at all. A type's own
definitions come from `GET /admin/eo-record-types/:id/fields`, and that
endpoint returns **only that type's own fields** — the 17 fields every type
inherits live on the abstract `eo_base` type.

So "11 types × 127 fields" is really `eo_base`'s 17 plus each type's own, and
the frontend must merge them. `src/lib/eoFields.ts:resolveEffectiveFields`
mirrors `services.ResolveEffectiveFields` (`internal/services/eo_fields.go:36`)
exactly, including the subtle rule that an override replaces the ancestor's
field **at the ancestor's position** — the override's own `sort_order` is
ignored, so a field sits in the same place on every type's form.
`useEoEffectiveFields` fetches the whole ancestor chain and merges.

### 2.2 The 17 inherited fields are columns, not `values`
A record carries `subject_ar`, `priority`, `due_date`, `owning_body_id` … as
top-level columns; only a type's own fields sit in the `values` jsonb. Reading
`record.values` alone makes every inherited field look empty.
`flattenRecordValues` mirrors `services.eoFlattenStored`. Writes still send
everything under `values` — the server's `eoApplyValues` splits it again.

### 2.3 Pagination is `total_items` / `total_pages`
Not the `total` that `GoalListResponse` uses. A register built on `data.total`
would have shown "Page 1 of 1" forever.

### 2.4 Filter params differ
`record_type_id`, `state_id`, `priority` … are **repeated array params**
(`[]string`), the state filter is `state_id` not `state`, and the direction is
`sort_dir` not `sort_order`. `sort_by` is allow-listed server side to
`created_at | updated_at | due_date | reference`; anything else is rejected.

### 2.5 Transitions have no `can_execute` and usually no `requirements`
`GET /eo-records/:id/transitions` returns bare `WorkflowTransition` objects
that `eoTransitionService.AvailableTransitions` has **already** filtered to
what the actor may run. Copying `MetricTransitionModal`'s
`transitions.filter(tr => tr.can_execute)` verbatim would have emptied the
list, and `tr.transition.id` would have been `undefined` — the EO objects are
not wrapped. `requirements` is present only when the workflow configures any,
so comment-required is treated as false when absent and the server's rejection
surfaces as a toast.

### 2.6 There is no `dashboard:eo` permission
Checked `internal/database/postgres.go` — the backend seeds `eo:view`,
`eo:create`, `eo:update`, `eo:delete`, `eo:transition`, `eo:types:manage` and
per-type `eo:<key>:view|create|update`. No dashboard code. The card is gated on
`PERMISSIONS.EO_VIEW`, which the brief gave as the fallback.

---

## 3. A backend bug the form has to work around

**Submitting a partial `values` map can turn a 400 into a 500.**

`eo_directive.origin_record` is `required_mode: conditional` with
`required_rule: directive_origin in ["correspondence", …]`. If the payload
omits `directive_origin`, the formula evaluator fails:

```
[POST /api/v1/eo-records] internal error: create eo record: validate record values:
  field "origin_record" required_rule: eoformula: unresolved reference: directive_origin
→ HTTP 500 {"success":false,"error":"Internal server error"}
```

Sending `null` for the empty field fails differently, also as a 500:

```
field "corrective_action" required_rule: eoformula: compile: invalid operation:
  matches (mismatched types unknown and string) (1:14) | delay_reason matches "\\S"
```

Only `""` satisfies both the evaluator and the column writers. So
`buildValuesPayload` deliberately sends **every writable field, empty ones as
`""`**, and `EoRecordForm` seeds every writable key up front. This is a real
workaround for a backend defect, not tidiness — it is commented as such in
`src/lib/eoFields.ts`. **Worth filing against the backend**: a missing
reference in a conditional rule is bad *input*, and should be a 400 naming the
field, not a 500.

### 3.1 One exception: `yes_no`
The server's `eoIsEmpty` treats `""` as empty but a bool as filled. An unchecked
checkbox sent as `""` therefore failed `plan_required` (an `always` required
`yes_no`) with "Plan required is required" and **the user had no way to answer
"No"**. Caught in the browser, not in review — screenshot `11-after-create.png`
from the first run shows it. `emptyValueForKind` now sends `false` for
`yes_no`, `""` for everything else.

---

## 4. Files

### New
```
src/types/eoRecord.ts                     types, written from live responses
src/api/eoRecords.ts                      eoRecordApi / eoRecordTypeApi / eoWorkflowApi
src/lib/eoFields.ts                       effective-field merge, flatten, payload rules
src/hooks/useEoRecords.ts                 eoKeys factory + queries/mutations
src/components/eo/EoFieldInput.tsx        kind → control (19 kinds)
src/components/eo/EoFieldValue.tsx        kind → read-only display
src/components/eo/EoStateBadge.tsx        state_id → coloured badge
src/components/eo/EoRecordFilters.tsx     search / type / priority + chips
src/components/eo/EoRecordForm.tsx        the dynamic form
src/components/eo/EoTransitionModal.tsx   transition picker + comment
src/components/eo/index.ts
src/components/layout/EoLayout.tsx        shell + licence guard
src/pages/eo/EoRecordsPage.tsx            register (3 routes)
src/pages/eo/EoRecordDetailPage.tsx       detail + children + transitions
src/pages/eo/EoRecordCreatePage.tsx
src/pages/eo/EoRecordEditPage.tsx
src/pages/eo/index.ts
```

### Edited
```
src/App.tsx                     4 lazy imports + route block + EoLayout import
src/pages/DashboardPage.tsx     Briefcase import + navigationCards entry
src/constants/permissions.ts    EO_VIEW/CREATE/UPDATE/TRANSITION/TYPES_MANAGE
src/components/layout/index.ts  export EoLayout
src/i18n/locales/en.json        "eo" namespace
src/i18n/locales/ar.json        "eo" namespace, same keys
```

Nothing outside this list was touched. `src/hooks/usePermissions.ts` was left
alone — the optional convenience methods add a second place to keep the EO
permission names in step for no gain at this size.

---

## 5. Conventions followed

- **React Query** with a frozen `eoKeys` factory; mutations invalidate
  `lists()` / `detail(id)` / `transitions(id)` / `children(id)`.
- **One deliberate deviation, which the brief called for:** `useCreateEoRecord`
  and `useUpdateEoRecord` carry **no** `onError` toast. A 400 is
  `{errors:{field_key:msg}}` and the form needs that map, so the page handles
  the rejection in its `mutateAsync` catch and toasts there. `useExecuteEoTransition`
  keeps its toast — it has no per-field surface.
- **Forms** are `useState` + `errors: Record<string,string>` + `validateForm()`.
  No react-hook-form, no zod.
- **API 400 mapping** follows `IncidentCreatePage.tsx:913-938`. EO keys arrive
  as field keys already, so no case conversion. Messages are shown **verbatim**
  (English-only by backend design); client-side required messages go through
  `t()` so Arabic users get Arabic for the common case.
- **Field labels** come from the API via `useLocalizedField()`. No invented
  Arabic. UI chrome has normal en/ar keys in both bundles.
- **Styling**: new EO components use the token idiom
  (`bg-[hsl(var(--background))]`) so they are dark-correct without `dark:`
  twins; blocks copied from `GoalsPage` keep their `dark:` classes.
- **RTL**: logical properties only (`ms-*`, `ps-*`, `start-*`,
  `ltr:text-left rtl:text-right`), `rtl:-rotate-180` on every directional icon.
- **Routing**: `AdminProtectedRoute → EoLayout → PermissionRoute(EO_VIEW)`,
  static segments before `:typeKey`.

### A fix the brief's plan needed
The brief says `ProtectedRoute` loads the licence store and that module routes
nest inside it. **They do not** — `ProtectedRoute` wraps only `/dashboard`,
`/profile` and `/settings` (`src/App.tsx:605`); every module, Goals included,
sits under `AdminProtectedRoute` alone, which does not touch the licence.

A layout-level `isFeatureLicensed("eo_platform")` guard would therefore have
seen `hasLicense === false` forever on a deep link and **never fired**.
`EoLayout` calls `useLicenseInfo()` itself (react-query dedupes it against the
dashboard's call) so the guard has data to act on. Confirmed unlicensed and
unauthorised EO calls return **403**, so the global 401 logout interceptor
does not fire.

---

## 6. Concerns

1. **`GET /admin/eo-record-types` requires `eo:types:manage`.** The register,
   the sidebar, the detail page and the form all need the type catalogue, but
   that endpoint is gated on a *management* permission, not `eo:view`. A plain
   EO user holding `eo:view` + `eo:create` will get **403 on the catalogue** and
   see an empty sidebar and no type names. Verified super-admin only. **This is
   the most likely thing to break with a real pilot user** and it needs a
   backend change (a read-only catalogue route under `eo:view`), not a frontend
   one.
2. **Workflow state names need the workflows module.** Records carry only
   `state_id`; names come from `GET /admin/workflows/:id/states`, which wants
   `workflows:view` and the `workflows` licence feature. Handled gracefully —
   `retry: false` and `EoStateBadge` degrades to a neutral "—" pill — but an
   EO-only tenant will see no state names. Same shape of fix as (1).
3. **`link` fields have no record picker.** 8 of the 127 definitions are
   `kind: "link"`. They render as a plain id input that round-trips the existing
   value so editing does not destroy it. A real cross-type record picker is the
   obvious next piece of work.
4. **`file` / `multi_file` accept Documenta ids, they do not upload.** EO
   Documenta is disabled in this deployment (`EO_DOCUMENTA_ENABLED=false`) and
   the transition executor checks attachment ids for presence then drops them —
   there is no `eo_record_attachments` table. Wiring `AttachmentUpload` against
   a service that is off would have looked like it worked and stored nothing.
5. **`required_mode: conditional` and `at_state` are not evaluated client-side.**
   Only `always` is checked in the browser; the rest come back from the server
   as per-field 400s and are shown under the right control. Correct, but it
   means a conditional miss costs a round trip.
6. **Pre-existing RTL leaks in shared components** that EO now surfaces:
   `SelectInput.tsx` uses `text-left` and `ml-2`, `TreeSelect.tsx` indents tree
   nodes with `paddingLeft`. Not introduced here and not fixed here — changing
   shared primitives is outside this module's blast radius — but they are
   visible in the Arabic form.
7. **`my-assigned` shows nothing** because no seeded record has an
   `assigned_user_id`. The route, query and empty state are correct; there is
   simply no data. Assign a record to `admin@automax.com` to see it populate.
8. **Test records left in the pilot database.** Probing the API contract and
   then driving the UI created `EO-DIR-2026-002` ("UI smoke create", from a
   curl probe) and several `EO-DIR-2026-00N` records titled "Browser E2E
   directive <n>" — one per run of the verification script, three at the time
   of writing. They are harmless but not pilot data; delete them with
   `DELETE FROM eo_records WHERE subject_en LIKE 'Browser E2E directive%'
   OR subject_en = 'UI smoke create';` if the seed set is meant to stay
   pristine.

---

## 7. How to re-run the browser check

```
node /tmp/claude-1000/-home-ks-lig-cintrix/115a9cf0-c151-4a35-b57a-ea44e666a33c/scratchpad/eoe2e.mjs
```

Logs in, creates a Directive, runs a transition, edits it, then captures dark
mode and Arabic. Prints PASS/FAIL per flow and every `POST`/`PUT` status.
