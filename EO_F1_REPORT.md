# Task F1 — the EO type list and the designer shell

Branch `rnd/temporal-workflows`, on top of `83eec2a`. Verified against the
live backend on `:8080` and the running Vite dev server on `:5173`, driven in
headless Chromium. Neither server was started, stopped or restarted.

**Status: DONE_WITH_CONCERNS.** Everything in scope works in a real browser.
The concerns are §6: two of them are backend findings, one is a limit on what
the client can know.

---

## 1. What was built

| File | |
|---|---|
| `src/api/eoTypes.ts` | new — the five type routes (`list`, `getById`, `create`, `update`, `remove`) |
| `src/hooks/useEoTypes.ts` | new — `eoTypeKeys` frozen factory, reads, writes, the record-count roll-up |
| `src/pages/admin/EoTypesPage.tsx` | new — the catalogue list + the create form |
| `src/pages/admin/EoTypeDesignerPage.tsx` | new — the three-tab shell F2–F4 fill |
| `src/types/eoRecord.ts` | edit — `EoRecordTypeDetail`, `EoRecordTypeRequest`, `EoDestructiveConfirmation` |
| `src/App.tsx` | edit — two lazy imports, a route block gated on `eo:types:manage` |
| `src/components/layout/AdminLayout.tsx` | edit — the System sidebar entry |
| `src/i18n/locales/{en,ar}.json` | edit — the `eo.types` chrome namespace, both bundles, same keys |
| `src/pages/eo/EoRecordsPage.tsx` | edit — carried fix 2 |
| `src/pages/eo/EoRecord{Create,Edit}Page.tsx` | edit — carried fix 1 |

`src/constants/permissions.ts` needed **no** change: `EO_TYPES_MANAGE` was
already there from Plan 3.

The create form is on the list page rather than in the designer, because a
type has no id until it exists and the shell is routed by id. F2 owns the
*edit* of the same attribute set, in the Attributes tab.

---

## 2. How the screen knows whether a type holds records

**There is no endpoint, and there is no field.** `GET /admin/eo-record-types`
serves the repository rows unchanged and `GET /:id` adds only `Fields`;
neither carries `has_records` or a count. The server keeps the answer to
itself in `handlers.eoTypeHasRecords`.

So `useEoTypeRecordCounts` asks the register the same question the server
asks:

1. one `GET /eo-records?record_type_id=<id>&limit=1` per **concrete** type,
   reading `total_items`;
2. the subtree of every type from `parent_type_id` (`eoDescendantIds`,
   mirroring `repository.DescendantIDs`, with a visited set and a depth
   bound);
3. a type's count is the sum over its subtree.

**The roll-up is the whole point, not an optimisation.** An abstract type
holds no records *by definition*: `record_type_id=<eo_base>` answers `0` while
its descendants held all 48. A "has records" flag read off that `0` would be
false on exactly the types §7.14 exists to protect — the inert-guard shape the
programme keeps producing. Verified both ways on the live server: `eo_base`
direct = 0, `eo_base` subtree = 48, and the designer shows 48 (screenshot 03).

**It is advisory, and the UI says so.** The server counts with `IsAdmin: true`;
this count is the caller's own register view, which
`applyEORecordVisibility` and `applyEORecordTypePermissions` narrow for anyone
who is not a super admin. A designer with `eo:types:manage` and no per-type
view codes will read `0` where the server reads records. **F2 and F5 must not
use `0` to permit a destructive edit** — only the server's 400 decides. A
banner says this whenever any register query failed (`isPartial`), and the
hook's doc comment states it at the source.

---

## 3. The two carried fixes

**1. The per-type page guard on create and edit.** Both routes are gated on
`eo:view` alone, so `/eo/<key>/new` rendered a full form the server then 403'd.
Each page now returns a refusal card instead, after the catalogue has settled
so `canEoRecordType` is answering about a real key and not `undefined`. The
guard is live: with the per-type codes for `eo_task` but not `eo_directive`,
`/eo/eo_task/new` still renders the form and `/eo/eo_directive/new` does not
(screenshots 11/12), and the same discrimination holds for `…/edit` (16/17).

**2. Every register's extra columns were blank.** `EoRecordsPage` read them
with `rec.values?.[f.key]`, but `sensitivity` and `source` are columns on the
record, not keys in the jsonb bag — and because ancestor fields sort first they
are the first two extra columns on *every* type. Each row now reads from
`flattenRecordValues(rec)`, the merge the detail page and the edit form
already use. The Directive register now shows Classification = Internal and
Source = Committee / Weekly meeting / Correspondence on every row
(screenshot 10).

---

## 4. The staleness trap, and how it is closed

The record module caches the catalogue under `eoKeys.types()`; the designer
caches it under `eoTypeKeys.lists()`. **Every write invalidates both**
(`useInvalidateCatalogue`), plus `eoKeys.typeFields(id)` by way of
`eoKeys.all`. Refreshing only the designer's copy would have put a new type in
the designer's list while the EO sidebar and the register still could not see
it — the restart Plan 3's Task A3 removed, reintroduced on the client.

Proven: creating a type took the list from 12 rows to 13 with no reload
(screenshot 08), and the EO module's own sidebar listed the new register on
the next navigation, also with no reload (09).

---

## 5. What was proved live, and what was intercepted

**Live, against the real server, with no interception:** the admin sidebar
entry; the catalogue list of all 12 seeded types with 127 own-field
definitions summed across them; the record counts including the abstract
roll-up; the designer shell and its three tabs; the create form's client
validation; `POST /admin/eo-record-types` → 201 and the type appearing without
a reload; the EO sidebar picking it up; the register's Classification and
Source columns; dark mode; Arabic RTL (`document.dir === "rtl"`, 0 px of
horizontal overflow).

**Intercepted, and only this:** the answer to `GET /users/me`, in the two
guard runs. The demo database holds exactly one user and they are a super
admin, who passes every per-type check by design; creating a restricted role
and user was refused by this environment's permission classifier. The run
therefore rewrites `is_super_admin` and `permissions` in that one response.
The token is untouched, and the page, the hook, the guard and the catalogue
are all live. It is the user's identity that is faked, not the guard.

### Screenshots
`/tmp/claude-1000/-home-ks-lig-cintrix/115a9cf0-c151-4a35-b57a-ea44e666a33c/scratchpad/f1shots/`

| file | what it shows |
|---|---|
| `01-admin-sidebar-entry.png` | the admin panel with the EO item present in the System section |
| `02-type-list.png` | all 12 types, key / name / kind / pattern / own fields / records |
| `03-designer-attributes.png` | the shell on `eo_base` — abstract, and "hold 48 records" from the subtree |
| `04-designer-fields-tab.png` | the Fields tab, `?tab=fields` in the URL |
| `05-create-modal-empty.png` | the create form |
| `06-create-validation.png` | an empty submit — three field messages, no request sent |
| `07-create-filled.png` | the probe type filled in |
| `08-after-create-no-reload.png` | 13 rows, the new key visible, no reload |
| `09-eo-sidebar-new-type.png` | the EO module's own sidebar listing the new register |
| `10-register-extra-columns.png` | Classification and Source populated on every row |
| `11-guard-allowed-eo_task-new.png` | the create form still renders where the code is held |
| `12-guard-refused-eo_directive-new.png` | the refusal card where it is not; no form |
| `13-sidebar-entry-scrolled.png` | the sidebar item, scrolled into view and active-styled |
| `14-type-list-dark.png` | dark mode — no white cards |
| `16-edit-guard-allowed.png` / `17-edit-guard-refused.png` | the same discrimination on `…/edit` |
| `18-type-list-arabic.png` | RTL, Arabic headers, 12 rows |
| `19-create-modal-arabic.png` | the create form mirrored, 0 px horizontal overflow |

---

## 6. Concerns

1. **The record count is the caller's view, not the server's** (§2). Nothing
   on the client can fix it. A one-line backend addition — `records_count` or
   `has_records` on the by-id read, computed by the function the guard rails
   already call — would make the designer's indicator exact and would let F5
   show an accurate warning before the operator types a confirmation.
   Worth filing.
2. **Deleting a record type orphans its permission rows.** Creating the probe
   type seeded `eo:eo_f1_probe_type:{view,create,update}` and attached them to
   the EO roles; `DELETE /admin/eo-record-types/:id` returned 200 and left all
   three behind. That matters because `ErrEOTypePermissionCodesExist` refuses
   a *new* type whose key already has codes — so a key, once used and deleted,
   cannot be reused until someone removes the permissions by hand. Backend.
3. **The designer costs 23 parallel requests on first paint** (one field list
   and one register count per type). They are small, cached for a minute, and
   the field lists are the same cache the record forms already fill, but a
   deployment with many types will feel it. A count on the catalogue (1) makes
   half of it go away.
4. **No page-level permission check inside the two new pages, deliberately.**
   The route already requires `eo:types:manage`, so a check inside could never
   be false — the inert guard this programme keeps finding. The permission
   does real work in the sidebar, which renders for every admin user.
5. **The admin sidebar's licence gate cannot fire on a deep link.**
   `AdminProtectedRoute` does not bootstrap the licence store (only
   `ProtectedRoute` does), so `hasLicense` is false and `itemAllowed` shows
   every licensed item. Pre-existing — `escalation` has the same gate — and
   the EO entry follows the house pattern rather than diverging from it. The
   backend refuses the routes regardless.
6. **Pre-existing RTL leaks in `AdminLayout`'s language dropdown**
   (`right-0`, `origin-top-right`, `text-left`), now visible beside the new
   screens. Not introduced here and not fixed here.

---

## 7. Demo data

Created, during verification: one record type, `eo_f1_probe_type` ("F1 Probe
Type"), with no fields and no records, plus the three permission rows the
backend seeds with it.

Removed, all of it: the type (`DELETE /admin/eo-record-types/:id` → 200) and
the three orphaned permissions. The catalogue is back to its 12 seeded types
and the permission table to its 179 rows. **No EO records were created.**

---

## 8. Checks

`npm run type-check` passes. `npm run lint` reports the same **two**
pre-existing errors and nothing else — `npx eslint` over every file touched
here is clean, and `npx prettier --check` passes on all of them.
`package-lock.json` was left unstaged and unmodified.

### Re-running the browser check
```
node .../scratchpad/f1e2e.mjs     # list, create-without-restart, register columns
node .../scratchpad/f1guard.mjs   # the create guard  (intercepts /users/me)
node .../scratchpad/f1extra.mjs   # the edit guard, dark mode  (intercepts /users/me)
node .../scratchpad/f1ar.mjs      # Arabic / RTL
```
`f1e2e.mjs` creates a record type; delete it afterwards.
