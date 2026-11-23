# EO Plan 3 — frontend fix wave

Repo: `/home/ks/lig/automax3.1/frontend`, branch `rnd/temporal-workflows`, from `a461433`.
Backend was read-only here; a parallel agent owns `/home/ks/lig/automax3.1/backend`.

Verified against the running dev stack (Vite 5173, API 8080) with headless chromium from
`node_modules/playwright`. Neither server was started, stopped or restarted.

---

## 🔴 CRITICAL — the permission algebra was the inverse of the server's

### What the server actually does

Read, not assumed:

| action | module code | per-type code | where |
|---|---|---|---|
| list | `eo:view` | *filtered*, not gated | `repository.applyEORecordTypePermissions` |
| read one | `eo:view` | `eo:<key>:view` | `eo_record_handler.go` `RegisterRoutes` |
| create | `eo:create` | `eo:<key>:create` | same |
| update | `eo:update` | `eo:<key>:update` | same |
| **transition** | `eo:transition` | **`eo:<key>:update`** | same — a transition is a write |

Every id-carrying route carries BOTH middlewares, so the server's algebra is **AND**.
A super admin bypasses the per-type half in both the middleware and the repository.
There is no `eo:<key>:transition`: §7.11 names three per-type actions and the seed writes
exactly those three.

### What the UI did

`module OR per-type`. Every user who reaches `/eo` already holds `eo:view` through the
route's `PermissionRoute`, so the per-type disjunct could never change the answer — three
guards that read as access control and could not fire, plus a fourth defect inside one of
them: `EoRecordDetailPage` tested `eo:${key}:transition`, a code no role has ever held.

### The fix

One function, `usePermissions().canEoRecordType(typeKey, action)`, with the module/suffix
tables beside the codes in `src/constants/permissions.ts`. `transition` maps to the type's
`update` suffix, which is what the server checks. Nothing rebuilds `eo:<key>:<action>` at a
call site any more, and the instruction in `permissions.ts` now states the AND rule, says
why OR was dead, and records that `eo:<key>:transition` does not exist.

Call sites converted: `EoLayout` (nav), `EoRecordsPage` (`canCreate`, and the filter bar's
type dropdown), `EoRecordDetailPage` (`canUpdate`, `canTransition`).

### What AND reveals, and how it is handled

The catalogue (`GET /admin/eo-record-types`) is **not** filtered per caller — it returns
every concrete type in the deployment. Under AND, three surfaces had to stop trusting it:

- **The nav** is derived from `canEoRecordType(key, "view")`, not from the catalogue.
- **The type dropdown** in `EoRecordFilters` is fed the viewable subset, so a filter that
  could only ever return nothing is not offered.
- **A `/eo/:typeKey` deep link** the caller cannot use gets an explicit amber panel. It has
  to: the list route is *filtered*, not gated, so the server answers 200 with zero rows and
  the page would otherwise say "No records yet" — a different, and false, statement.

**What a user now sees for a type they hold no codes on:** the register is absent from the
sidebar; a direct link to `/eo/<key>` shows *"This register is not available to you — you
hold access to the Executive Office, but not to this record type."*; and if they hold no
per-type codes at all, the Registers section of the sidebar says so in words instead of
rendering empty. "My assigned" and "All records" stay, because they are legitimately
reachable with `eo:view` alone and the server filters their rows correctly — they will just
be empty, which is the true answer.

**This is more visible than it looks.** The backend fixer counts **six** seeded roles holding
EO module codes and no per-type codes (`eo_admin` plus the five participants). With the
correct algebra every one of them now opens `/eo` to a nav with no registers. That is the
true state of the grants, so it is said in words — *"No registers have been granted to you.
Ask an administrator for access to a record type."* — rather than rendered as an empty
section that reads like a failed load. Screenshot 03.

---

## 🟠 IMPORTANT 1 — transition refusals, and the field that could not be supplied

### The error path

`useExecuteEoTransition` read only `data.message || data.error`. The server's validation
refusal is `handlers.eoFieldErrors` — `{success:false, errors:{…}}` which, until this wave,
carried **no message field at all**. Confirmed live:

```
POST /eo-records/1784.../transition  {"values":{"verification_note":"x"}}
400 {"errors":{"verification_note":"is not a field this transition may change"},"success":false}
```

The hook's toast is gone. `lib/eoFields.ts` gained `eoFieldErrorMap` (the per-field map) and
`eoRefusalMessage` (the server's `error`/`message` when it writes one, else the joined field
map, else a generic sentence). The modal owns the wording and maps the field map onto
controls.

**The backend's `error` has landed, and it is a headline, not the answer.**
`handlers.eoFieldErrorSummary` builds it from the field map, sorts the keys and **caps it at
three** (`eoFieldErrorSummaryMax`), appending "and N more field(s)". So the modal treats
`errors` as authoritative — rendered in full, per field — and shows `error` as a banner
above the controls, which may be scrolled out of view. Proved with a four-field refusal in
the exact landed shape: the headline says "and 1 more field(s)" while all four fields are
listed below it (screenshot 18).

### The modal — the decision

**Both, because the two refusal classes need different answers and neither works alone.**

1. **Declared field changes are rendered in the modal.** `transition.field_changes` is
   already on the wire (`FindTransitionByIDWithRelations` preloads it and
   `AvailableTransitions` returns the model). `services.applyFieldChanges` accepts **only**
   declared keys and demands a value for each `is_required` one. So the modal draws each
   declared change through `EoFieldInput`, using the change's own label and requiredness
   over the type's, and posts `values` with declared, answered keys only.

2. **A field required by the TARGET STATE cannot be supplied here, and the user is told
   where it can be.** `ValidateRecordValues` runs against the state being entered, so a
   field with `required_at_state` can be reported missing although the transition declares
   no change for it. Putting that key in `values` would hit *"is not a field this transition
   may change"* — so the modal shows the server's own message verbatim in a banner and
   links to the edit form.

The modal splits the server's field map between the two surfaces on submit. Telling the
user to "go edit it first" for case 1 would be wrong (the edit form may not even expose a
field the transition owns), and rendering a control for case 2 would post a key the server
refuses — hence both.

Client-side required checks go through `t()` so Arabic users get Arabic for the common
case; server messages are shown verbatim, English, per the house rule.

---

## 🟠 IMPORTANT 2 — "attachment"

`api/eoRecords.ts` gained `contentDispositionFileName`, replacing a one-line regex:
`filename*=UTF-8''…` (RFC 6266 §4.3) wins over `filename="…"` when both are present —
which is the rule, and the only spelling that can carry an Arabic name; percent-decoding is
attempted and a non-encoded name survives it; the result is reduced to a base name so a
server string carrying `/` never reaches `a.download`. `preview` now returns the name too,
because its unrenderable-type path *saves* the bytes.

`useEoFileActions` had the precedence backwards (`caller || served || default`). The
server's name now wins: it is right for a reader who did not upload the file, where the
caller's name is `undefined`. The generic default is reached only when the header is
genuinely absent **and** the caller knew no name.

**The backend change exists in source but is not in the running process.**
`cmd/server/main.go:654` now sets `ExposeHeaders:
"Content-Disposition,Content-Range,Accept-Ranges"` (backend `b846121`, committed 16:35:54).
The binary listening on :8080 is `eo-server`, built at **15:38:33** — before that commit —
and `strings` on it finds the expose-headers literal **zero** times. `OPTIONS
/api/v1/eo-records` accordingly still returns no `Access-Control-Expose-Headers`.

I was told not to start, stop or restart either server, so I did not restart it, and the
end-to-end path therefore could not be observed on :8080. **It needs one restart of :8080 by
whoever owns that process to close out.** What was proved instead: a download served with
the exact headers the backend now sets — including
`access-control-expose-headers: Content-Disposition,Content-Range,Accept-Ranges` — is saved
through `eoFileApi.download` as `محضر الاجتماع.pdf`, the RFC 5987 name winning over the
`filename="fallback.pdf"` in the same header.

---

## 🟠 IMPORTANT 3 — the Children tab truncated at 20

`GET /eo-records/:id/children` already ships the register's envelope — the handler routes it
through its shared `list`. Confirmed live: `{"page":1,"limit":20,"total_items":0,"total_pages":0}`.
The brief's premise that the backend was still deciding was stale; nothing was built around a
missing envelope, and the defect was entirely on the client side.

`getChildren` is typed `EoRecordListResponse` and takes `page`/`limit`; `useEoChildren(id,
page)` sends `limit=20` with `keepPreviousData`; the detail page has a pager and the count
badge prints `total_items`, omitted entirely when the envelope carries no total — an
unverifiable count is worse than none. `eoKeys.childrenOf(id)` invalidates every page.

---

## 🟡 Smaller

- **Two register queries per page view.** `useEoRecords`/`useEoMyAssigned` take `enabled`;
  only the route's own query runs. While measuring this a *second* double-fetch showed up
  from the opposite end: a `/eo/:typeKey` route fired the unpinned register before the
  catalogue resolved `record_type_id`, then fired it again pinned. The query now waits for
  the catalogue, and the page's loading state absorbs that wait so the empty state cannot
  flash. Measured: 2 → 1 request on `/eo/eo_directive`, 1 on `/eo/my-assigned`.
- **`multi_file` register columns.** `registerColumnFields` excluded `kind !== "file"` but
  not `multi_file`; now both are excluded by kind.
- **403 retried three times per cell.** The `link` resolution in `EoFieldValue` passes
  `retry: false`, as its sibling `useEoWorkflowStates` does. A 403/404 there is an answer,
  not a failure.
- **A new record type was invisible until a hard reload.** `useEoRecordTypes` and the
  per-type field queries dropped `staleTime/gcTime: Infinity` for a 5-minute stale window
  and a 30-minute gc, which is what makes the designer usable without a restart.
- **Orphaned doc comment** in `types/eoRecord.ts`: the list-envelope comment was reunited
  with `EoRecordListResponse` and now also records that children share the envelope.

i18n: eleven new keys added to **both** `en.json` and `ar.json`.

---

## Verification

`npm run type-check` passes. `npm run lint`: 2 errors, both pre-existing
(`e2e/fixtures.ts`, `src/hooks/useSavedViews.ts:88`) — no new ones.

The database holds one user and they are a super admin, so `executive_office` could not be
logged in as. The AND algebra was proved by **intercepting the `/auth/login` payload** and
rewriting `is_super_admin`/`permissions`, then reading the rendered UI.

### Proven live (real server, real data)

- The refusal shape `{success:false,errors:{…}}` with no message, by `curl`.
- The children envelope `{page,limit,total_items,total_pages}`, by `curl`.
- `field_changes` is present on `GET /eo-records/:id/transitions` (empty in the seed).
- Super admin sees all 11 registers, and Move + Edit on a detail page.
- One register request per page view, counted on the wire.
- `Access-Control-Expose-Headers` is **absent** from the running backend.

### Proven by interception

- **Permissions** — login payload rewritten, four scenarios:
  - module codes only (`eo:view/create/update/transition`, no per-type): nav shows no
    registers and says so; `/eo/eo_directive` shows the not-available panel. *Under OR this
    user saw every register.*
  - `eo:view` + `eo:update` + `eo:transition` + `eo:eo_directive:view`: Directive alone in
    the nav; no "New record"; **no Move and no Edit** on a directive detail page — the
    module codes alone no longer suffice. *Under OR both buttons were shown.*
  - the same plus `eo:eo_directive:create/update`: "New record" returns, Move and Edit return.
  - `/eo/eo_task` with no task codes: the not-available panel.
- **Children** — a 30-child / 2-page envelope: badge reads 30, 20 rows, "Page 1 of 2",
  Next → 10 rows, "Page 2 of 2", requests `?page=1&limit=20` then `?page=2&limit=20`.
- **Transition modal** — a declared `change_reason` field change injected into the
  transitions response: the control renders with `*`; empty submit gives the translated
  client message; the posted body is
  `{"transition_id":"…","values":{"change_reason":"…"}}` — declared keys only;
  a `{errors:{change_reason:…, decision_reference:…}}` refusal puts `change_reason` under
  its control and `decision_reference` in the banner with "Open the edit form".
- **The landed refusal shape** — `errors` (four fields) plus the capped `error`: the
  headline renders the server's summary verbatim, `change_reason` sits under its control,
  and `decision_reference` / `due_date` / `owning_body_id` — including the one `error`
  omitted — are all listed in the banner.
- **A download served with the landed CORS headers** → `محضر الاجتماع.pdf`.
- **Filename parser**, called in the page against real headers:
  `filename="Board minutes.pdf"` → `Board minutes.pdf`; bare `filename=minutes.pdf` →
  `minutes.pdf`; `filename="fallback.pdf"; filename*=UTF-8''%D9%85%D8%AD%D8%B6%D8%B1.pdf`
  → `محضر.pdf` (the extended form wins); `filename="../../etc/passwd"` → `passwd`;
  absent header → `undefined`.

Dark mode and RTL checked on every new surface (pager, modal, both banners).

### Screenshots

`/tmp/claude-1000/-home-ks-lig-cintrix/115a9cf0-c151-4a35-b57a-ea44e666a33c/scratchpad/shots/`

| file | what it shows |
|---|---|
| `01-superadmin-register.png` | control: every register in the nav |
| `02-superadmin-detail.png` | Move + Edit for a super admin |
| `03-module-only-nav.png` | module codes only → no registers, with the explanation |
| `04-module-only-forbidden-register.png` | the not-available panel |
| `05-one-type-nav.png` | one per-type view code → one register |
| `06-one-type-detail-no-move-no-edit.png` | **module codes alone no longer show Move/Edit** |
| `07-one-type-forbidden-register.png` | `/eo/eo_task` refused in words |
| `08-full-grant-detail-move-and-edit.png` | per-type update granted → both return |
| `09-children-page1-of-2.png` | badge 30, 20 rows, pager |
| `10-children-page2-of-2.png` | page 2, 10 rows |
| `11-transition-modal-declared-field.png` | the declared field rendered |
| `12-transition-client-required.png` | translated client-side required message |
| `13-transition-server-errors-split.png` | the field map split across both surfaces |
| `18-transition-headline-and-full-map.png` | the capped `error` headline over the complete `errors` map |
| `14-dark-children-pager.png`, `15-dark-transition-modal.png` | dark mode |
| `16-rtl-children-pager.png`, `17-rtl-transition-modal.png` | RTL |

---

## Not addressed

- **`Access-Control-Expose-Headers` could not be confirmed end-to-end against :8080.** The
  code has landed (backend `b846121`); the *process* has not — its binary was built at
  15:38:33, an hour before that commit, and contains no such header. Restarting a server I
  was told not to touch was not mine to do. **One restart of :8080 closes this out**; the
  client side is proven against the exact headers it will then serve.
- **A declared `field_changes` transition could not be exercised against real data.** No
  seeded EO workflow transition declares one, so that path is interception-proved only.
  Case 2 (the undeclared-key refusal) *was* produced by the live server.
- **`EoRecordCreatePage` / `EoRecordEditPage` carry no page-level permission guard.** They
  are route-gated on `eo:view` only, so a deep link to `/eo/<key>/new` renders a form the
  server will 403 on submit. Out of this wave's scope; worth a follow-up, and the guard is
  now a one-liner (`canEoRecordType(typeKey, "create" | "update")`).
- **`useEoRecord`'s per-observer `retry`** is honoured by whichever observer registers the
  query first, a react-query property. In practice a link cell and the detail page never
  share an id, so the `retry: false` lands where it is meant to.
