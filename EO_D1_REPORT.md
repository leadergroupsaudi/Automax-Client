# Task D1 — Files can be attached from the form

Branch `rnd/temporal-workflows`. One commit: *feat(eo): upload control for file and multi_file fields*.

**Status: DONE_WITH_CONCERNS.** The control is built, wired and driven in a
real headless Chromium against the live backend on `:8080` and Vite on `:5173`.
`npm run type-check` passes. `npm run lint` reports the same **2** pre-existing
errors as before the change (`e2e/fixtures.ts:35`, `src/hooks/useSavedViews.ts:88`)
and **0** in anything this task touched. The concerns in §7 are backend gaps,
not loose frontend ends.

---

## 1. What the field did, and what it does now

`attachments` (on `eo_base`, so on every type), `draft_file`, `study_report`,
`brief_file`, `proof`, `evidence`, `reply_files`, `response_files` — ten
definitions across the pilot — rendered as:

```
Attachments  [ Documenta file id________________ ]
```

An office user has never seen a Documenta file id and has no way to obtain
one. The field now renders `EoFileField`: a dropzone that uploads the file
through `POST /eo-records/:id/files` and keeps the returned id to itself, a
list of what is attached with name, size and a remove action, and a
download / preview pair on every file the record actually holds.

The stored value is unchanged — one id for `file`, an array for `multi_file`,
`""` when empty — so nothing downstream of the form moved.

The read-only side had the mirror defect: `EoFieldValue` printed the raw UUID
for `file` and "1 file(s)" for `multi_file`. The detail page now renders each
attachment as a row a person can open.

---

## 2. The upload-timing decision, and why

**Upload after the first save.** On a create form the field does not offer a
file picker at all; it says *"Save the record first — files can be attached
from the record once it exists."* On a record that exists, the file uploads
the moment it is picked.

The reasoning, in order of weight:

1. **The route needs a record id and creates nothing.** `POST
   /eo-records/:id/files` files into that record's own
   `documenta_folder_id`; the handler explicitly refuses rather than minting a
   folder. There is nothing to upload against before the record exists.
2. **Staging and uploading on save would always half-fail on this
   deployment.** The sequence would have to be create → upload → update. With
   `EO_DOCUMENTA_ENABLED=false` the upload leg refuses every time, so every
   create with a staged file would leave a *created* record that never got its
   file, and a staged file the user must now re-attach somewhere else. That is
   the failure the brief warns about, reached by design rather than by
   accident.
3. **A picker you cannot honour is the thing that loses files.** Nothing is
   staged, so nothing can be silently lost. The field says plainly what has to
   happen first instead of accepting bytes it cannot send.
4. **The 503 is discovered at the moment of the action.** Uploading on pick
   means the user learns that document storage is off when they attach, not
   after filling in a 26-field form and pressing Save.

**The cost, stated:** a clerk who wants to attach a document to a new record
saves once and then attaches. And see §7.1 — a `file` field whose
`required_mode` is `always` cannot be created by *any* client, under either
approach; that is a backend chicken-and-egg, not a consequence of this choice.

**Orphan bytes — yes, this approach can produce them.** Uploading on pick puts
the bytes in Documenta before the record is saved. If the clerk then removes
the file, presses Cancel, or closes the tab, the id is never written into the
record and the file sits in the record's folder referenced by nothing. It is
not invisible — the handler tags every upload with `record_reference`,
`uploaded_by` and `uploaded_at` — but Automax has no route that deletes a
Documenta file, so the frontend cannot clean up after itself. A
`DELETE /eo-records/:id/files/:file_id` would close it.

---

## 3. The three backend facts the control is shaped around

### 3.1 A file is only readable once the record is saved with its id
`serveFile` answers the ownership check from the record's **stored** values,
so between the 201 and the save there is nothing to link to. `EoRecordForm`
therefore passes the form **two** values per field: the live one and
`flattenRecordValues(record)[key]`, what the server currently holds. An id in
the form but not in the record renders as *"Uploaded — save the record to keep
it"* in amber, with a remove action and **no** links. An id the record holds
gets Preview and Download. Proven both ways in the browser — 0 download
buttons before the save, 1 after.

### 3.2 503 is a state, not an error
There is no endpoint that reports whether EO Documenta is on. The 503 refusal
is the only signal, so it is written into the react-query cache
(`eoKeys.documenta()`) and `useEoDocumentaStatus()` subscribes every file
field to it: one field's 503 teaches the rest of the form. The field then
shows an amber notice — the meaning in the reader's language, the server's own
sentence (which names `EO_DOCUMENTA_ENABLED=false`) verbatim underneath — and
the form stays fully usable: existing attachments still list, still open,
still remove, and the record still saves.

The per-file row for a 503 says only *"Not attached"*; the notice above it
already carries the sentence, and repeating it under each file turned one fact
into a wall (that was the first draft — see `03-disabled-503-live.png` from
the earlier run).

### 3.3 The reads are authenticated streams, not URLs
`GET …/files/:file_id` requires the Bearer header, so a bare `<a href>` would
401 — and `src/api/client.ts`'s global interceptor turns a 401 into a logout.
`useEoFileActions` fetches through `apiClient` as a Blob and hands it to the
browser from an object URL, the shape `documentApi.download` already uses.
Preview opens its tab **synchronously** inside the click, before the bytes are
in flight, or the popup blocker eats it.

---

## 4. Files

### New
```
src/components/eo/EoFileField.tsx     the control + EoFileLinks (read-only view)
```

### Edited
```
src/api/eoRecords.ts               eoFileApi: upload / download / preview
src/types/eoRecord.ts              EoFileUploadResult, EoDocumentaStatus
src/lib/eoFields.ts                eoErrorMessage / eoErrorStatus / toFileIdList
src/hooks/useEoRecords.ts          eoKeys.documenta(), useEoDocumentaStatus(),
                                   useUploadEoRecordFile(), useEoFileActions()
src/components/eo/EoFieldInput.tsx  file/multi_file → EoFileField; recordId +
                                    persistedValue props
src/components/eo/EoFieldValue.tsx  file/multi_file → openable rows; recordId prop
src/components/eo/EoRecordForm.tsx  passes record?.id and the persisted values;
                                    file kinds widened to md:col-span-2
src/components/eo/index.ts          barrel
src/pages/eo/EoRecordDetailPage.tsx passes recordId to EoFieldValue
src/i18n/locales/en.json            18 eo.file.* keys; dropped the dead
                                    eo.form.filePlaceholder / eo.detail.fileCount
src/i18n/locales/ar.json            the same keys, in Arabic
```

`package-lock.json` carries an uncommitted modification that is not from this
task; it was left unstaged and unchanged.

---

## 5. Conventions followed

- **React Query, frozen key factory.** `eoKeys.documenta()` added to the
  existing factory. `useUploadEoRecordFile` carries no toast: the refusals are
  per-field facts and belong under the control the user just used. It does not
  invalidate the record caches — an upload changes nothing about the record
  until the form is saved.
- **No react-hook-form, no zod.** `EoFileField` is a controlled
  `value`/`onChange` pair inside the existing `useState` + `errors` form, and
  takes `invalid` (a boolean for the red ring) rather than `error`, because
  `EoFieldInput`'s wrapper already prints the message — the same contract
  `EoRecordPicker` uses.
- **Server messages verbatim.** The 409 names the record and the 502 names the
  id Documenta returned; paraphrasing either would cost the operator the only
  handle they have. Client-side messages (empty file, "save first") go through
  `t()`.
- **Field labels** still come from the API via `useLocalizedField()`. No
  invented Arabic for EO field labels; the 18 new chrome strings are normal
  en/ar keys in both bundles.
- **Direction-agnostic CSS only.** `text-start`, `ms-*`, `gap-*`. No
  `text-left`, `pl-*`, `ml-*`, `left-*`, no `paddingLeft` — grepped across
  every file touched, including the reused `AttachmentDropzone`.
- **Reuse.** The picker area is the repo's existing `AttachmentDropzone`
  (`components/attachments/AttachmentUpload.tsx`), so drag-and-drop, keyboard
  access and the dark/RTL styling are the ones the rest of the app already
  has. `useAttachmentPolicy` is deliberately **not** used: its rules are the
  citizen/internal attachment config, which the EO route does not enforce —
  printing "Allowed types: .pdf, .docx" beside an endpoint that accepts
  anything non-empty would be a lie with a settings page behind it. The one
  rule EO does enforce, "not zero bytes", is mirrored client-side.

---

## 6. Browser verification

Driver: `/tmp/claude-1000/-home-ks-lig-cintrix/115a9cf0-c151-4a35-b57a-ea44e666a33c/scratchpad/d1e2e.mjs`
Screenshots: `/tmp/claude-1000/-home-ks-lig-cintrix/115a9cf0-c151-4a35-b57a-ea44e666a33c/scratchpad/d1shots/`

Three runs in three fresh contexts, on `EO-DIR-2026-005`
(`8d12a074-1d84-4ca0-9596-fe83da9817c7`), logged in as `admin@automax.com`.

### Run A — entirely live, nothing intercepted

| shot | what it shows |
|---|---|
| `01-create-save-first.png` | the New Directive form: Attachments is a dashed info panel, "Save the record first — files can be attached from the record once it exists." **0 file inputs on the page** |
| `02-edit-dropzone.png` | the edit form: a real dropzone, "Drag files here or browse / Each file is filed on this record. / No file attached" |
| `03-disabled-503-live.png` | a file picked for real → `POST …/files → 503` → amber notice: the Arabic-or-English lead sentence plus the server's own *"Documenta is not configured for the Executive Office (EO_DOCUMENTA_ENABLED=false)…"*, the file listed as "Not attached", the rest of the form untouched and saveable |

### Run B — `POST …/files` intercepted with a 201; everything else live

The intercepted body is the handler's own:
`{documenta_file_id:"7c9f1b2e-4a53-4d18-9f0a-2b6c8e5d13a7", file_name:"eo-sample-brief.txt", file_size:78, mime_type:"text/plain"}`.
**No file was uploaded to anything.** The canonical uuid is required: the save
pipeline applies `services.EOIsDocumentaFileID` to the value.

| shot | what it shows |
|---|---|
| `04-uploaded-not-saved.png` | the row: `TXT / eo-sample-brief.txt / 1 KB · Uploaded — save the record to keep it`, a remove ✕, and **no** download button (asserted: 0) |
| `05-saved-detail-attachment.png` | after a **live** `PUT /eo-records/… → 200` and a redirect: the detail page's ATTACHMENTS block renders `Attachment 1 / 7c9f1b2e` with preview and download icons |
| `06-after-download-click.png` | the download clicked with `GET …/files/<id>` intercepted: Playwright's `download` event fired, the bytes saved to `d1shots/downloaded-attachment.txt` and read back as the expected text |
| `07-edit-saved-attachment-links.png` | the edit form reopened in a fresh navigation: the stored id now carries 1 download button (asserted) |

### Run C — Arabic, live

| shot | what it shows |
|---|---|
| `08-arabic-dropzone.png` | `document.dir === "rtl"`, the dropzone mirrored, Arabic chrome |
| `09-arabic-503-live.png` | the live 503 in Arabic: the lead sentence in Arabic, the server's English sentence beneath it, "لم يُرفق" on the failed row; the file-type chip sits on the **right** and the ✕ / ↓ / 👁 on the **left**, i.e. the whole row mirrors |
| `10-arabic-dark-503.png` | the same with `dark` on `<html>`: no white panel, the amber notice and both rows are dark-correct |

A computed-style sweep of every node inside the field found no element whose
`text-align` resolves to a *physical* direction against the document
(everything is `start`, which Chromium reports as `right` under `dir="rtl"`).

**Proven live:** the create-form state, the dropzone, the 503 refusal and its
message, the whole Arabic and dark path, the `PUT` that saves an id, and the
detail page's rendering of a saved attachment.
**Proven against an intercepted response:** the 201 → row → save → link flow,
and the download click. Nothing was uploaded to Documenta, and nothing in this
report claims it was.

**Test data:** Run B writes a fabricated (canonical, but not real) file id into
`EO-DIR-2026-005.attachments`. The run is bracketed by
`scratchpad/d1reset.py`, which puts the field back to `""`; it was run after
the final pass and the record is as it was found.

---

## 7. Concerns

1. **A `file` field with `required_mode: always` cannot be created by any
   client.** `services.validateRecordValues` (`eo_fields.go:206`) enforces
   `always` on create, and the only way to obtain a file id is to upload
   against a record that already exists. So `eo_draft_decision_study`
   (`draft_file`, `study_report`), `eo_objection` (`proof`) and
   `eo_incoming_correspondence` (`attachments`) are uncreatable — with
   Documenta on *or* off, and whether the frontend stages files or not. **This
   is the single most important finding of the task.** It needs a backend
   answer: a draft/`pending` record, a multipart create, or relaxing those
   four definitions to `at_state`.
2. **Downloads lose their real filename.** The record stores only the id, and
   the server's `Content-Disposition` is not readable by the browser: the API
   is cross-origin and `cmd/server/main.go`'s CORS block sets `AllowHeaders`
   but no `Access-Control-Expose-Headers`. The client parses the header anyway
   and falls back to `attachment` (Chromium appends an extension from the MIME
   type). Adding `ExposeHeaders: "Content-Disposition"` is a one-line backend
   fix that makes this correct.
3. **A page that did not perform the upload knows no file names.** There is no
   `GET /eo-records/:id/files` listing, so a reloaded detail page can only say
   "Attachment 1" and the id's first eight characters. A listing route, or
   storing `{id, name}` in the field value, would fix it; the latter changes
   the stored shape and is not a frontend decision.
4. **Orphan bytes.** As §2 states: uploading on pick means an abandoned form
   leaves a tagged file in the record's Documenta folder referenced by
   nothing, and there is no delete route to clean up with.
5. **No size or type limits are shown or enforced.** The EO route accepts any
   non-empty file up to Fiber's 100 MB body limit; there is no per-module
   attachment policy for EO, and borrowing the incident one would have
   advertised rules the endpoint does not apply. If the pilot wants limits,
   they belong on the route first.
6. **The 409 path could not be exercised.** Every record in the pilot has an
   empty `documenta_folder_id` (folders are only created when Documenta is
   on), and the handler checks the 503 *before* the 409, so the conflict arm
   is unreachable on this deployment. The code shows it verbatim like any
   other refusal, but that is untested.
7. **One upload at a time, sequentially.** A multi-file drop uploads files one
   after another so a mid-batch refusal stops the rest from piling up. With
   large files over a slow link this will feel slow; parallelising is easy but
   makes the failure story worse, so it was not done.
