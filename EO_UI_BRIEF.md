# Executive Office (EO) Module — Frontend Implementation Brief

Target repo: `/home/ks/lig/automax3.1/frontend` (branch `rnd/temporal-workflows`).
Status: **greenfield** — verified zero EO code in `src/` and `e2e/` (grep for `eo_record|eo-record|eoRecord|eo_platform|executive office` returns nothing).

Every pattern below is cited as `path:line`. Copy the cited file; do not invent a new style.

---

## 0. House rules (read first)

- **Path alias:** `@` → `./src` (`vite.config.ts:14`, `tsconfig.app.json:21-23`). Both `@/...` and relative `../../...` imports are in use; `src/api/*` and `src/hooks/*` consistently use relative, `src/components/ui/*` and newer files use `@/`.
- **Styling:** Tailwind v4 utility classes written inline. Two colour idioms coexist: hard-coded slate/blue with explicit `dark:` variants (`src/pages/admin/GoalsPage.tsx:285`) and CSS-variable tokens `bg-[hsl(var(--primary))]` / `text-[hsl(var(--foreground))]` (`src/components/common/DynamicLookupField.tsx:124-125`). **Use the token form for new work**; it is dark-mode-correct without `dark:` duplication. Dark mode is a `dark` class on `<html>` (`src/hooks/useTheme.ts:14-19`) — there is no theme context, so every hard-coded colour needs a `dark:` twin.
- **RTL:** logical Tailwind properties only — `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `ltr:text-left rtl:text-right`, and `rtl:-rotate-180` on directional icons (`src/pages/admin/GoalsPage.tsx:319`, `:415`, `:429`; `src/components/goals/MetricTransitionModal.tsx:175`). Never `ml-*`, `mr-*`, `left-*`, `right-*`, `text-left`.
- **Icons:** `lucide-react` only.
- **Toasts:** `sonner` — `import { toast } from "sonner"` (`src/hooks/useGoals.ts:2`).
- **Lint:** `noUnusedLocals`/`noUnusedParameters` are on (`tsconfig.app.json:27-28`); the repo uses `// eslint-disable-next-line no-unused-vars` above callback-prop type signatures (`src/components/common/DynamicLookupField.tsx:11`).

---

## 1. API layer convention

**Client.** One shared axios instance: `src/api/client.ts:37-42`, default export `apiClient`, base URL from `window.APP_CONFIG.API_URL || import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1"` (`:32-35`). Two request interceptors attach `Authorization: Bearer <localStorage token>` (`:81-92`) and `Accept-Language: i18n.language` (`:190-196`). **Never create your own axios instance and never set auth headers yourself.**

**Module shape.** Model on `src/api/goals.ts`. Rules observed there:
- `import apiClient from "./client";` (`src/api/goals.ts:1`)
- `import type { ApiResponse } from "../types";` (`:2`) — defined at `src/types/index.ts:205-210` as `{ success, message?, data?, error? }`.
- All domain types live in `src/types/<module>.ts` (`src/types/goal.ts`, `src/types/kpi.ts`) and are imported `import type { ... } from "../types/goal"` (`src/api/goals.ts:3-46`).
- Export one or more **named object literals** of async methods: `export const goalApi = { ... }` (`src/api/goals.ts:83`), `export const metricApi`, `export const evidenceApi`; same in `src/api/kpi.ts:100,136,542,667,...`.
- Each method is `async (…) => { const res = await apiClient.get(...); return res.data; }` — i.e. **it returns the whole `{success,data}` envelope**, not `res.data.data` (`src/api/goals.ts:84-99`). Unwrapping happens in the component (`data?.data ?? []`, `src/pages/admin/GoalsPage.tsx:128`).
- List endpoints with filters get a shared `buildXFilterParams(filter): URLSearchParams` helper so list and export stay in sync (`src/api/goals.ts:54-81`).
- Paginated list responses get their own interface rather than `ApiResponse<T[]>` — see `GoalListResponse { success, data, total, page, limit }` (`src/types/goal.ts:486-492`). (A generic `PaginatedResponse<T>` with `total_items`/`total_pages` also exists at `src/types/index.ts:378-385`; the EO backend returns a flat list + total, so follow `GoalListResponse`.)
- **No try/catch in the api layer.** Errors propagate as axios rejections and are handled in the react-query `onError`.

### Create `src/types/eoRecord.ts`

```ts
export type EoFieldKind =
  | "text" | "long_text" | "dropdown" | "date" | "date_time" | "number"
  | "percent" | "yes_no" | "user" | "org_unit" | "multi_org_unit"
  | "external_body" | "file" | "multi_file" | "auto_number" | "link"
  | "workflow_state" | "user_date";

export interface EoDropdownOption { value: string; label: string; label_ar?: string }

export interface EoFieldDefinition {
  key: string;
  label: string;
  label_ar?: string;
  kind: EoFieldKind;
  required_mode?: string;          // e.g. always | never | conditional
  required_rule?: string | null;
  config?: { options?: EoDropdownOption[]; [k: string]: unknown };
  sort_order: number;
  help_text?: string;
  help_text_ar?: string;
}

export interface EoRecordType {
  id: string;
  key: string;
  name: string;
  name_ar?: string;
  reference_pattern?: string;
  is_abstract: boolean;
  fields?: EoFieldDefinition[];    // confirm the JSON key against a live GET
}

export type EoValues = Record<string, unknown>;

export interface EoRecord {
  id: string;
  record_type_id: string;
  record_type?: EoRecordType;
  reference?: string;
  parent_record_id?: string;
  values: EoValues;
  workflow_state?: { id: string; name: string; name_ar?: string; code?: string };
  created_at: string;
  updated_at: string;
}

export interface EoRecordFilter {
  page?: number; limit?: number; record_type_id?: string;
  search?: string; state?: string; sort_by?: string; sort_order?: "asc" | "desc";
}

export interface EoRecordListResponse {           // mirrors GoalListResponse
  success: boolean; data: EoRecord[];
  total: number; page: number; limit: number;
}

export interface EoRecordCreateRequest {
  record_type_id: string;
  parent_record_id?: string;
  parent_link_type_key?: string;
  values: EoValues;
}
export interface EoRecordUpdateRequest { record_type_id: string; values: EoValues }
export interface EoTransitionRequest { transition_id: string; comment?: string; values?: EoValues }
```

Reuse the existing `AvailableTransition` / `WorkflowTransitionBrief` / `TransitionRequirement` shapes from `src/types/goal.ts:278-297` if `GET /eo-records/:id/transitions` returns the same envelope; otherwise declare `EoAvailableTransition` with the same field names so the transition modal stays copy-compatible.

### Create `src/api/eoRecords.ts`

```ts
import apiClient from "./client";
import type { ApiResponse } from "../types";
import type { AvailableTransition } from "../types/goal";
import type {
  EoRecord, EoRecordType, EoRecordFilter, EoRecordListResponse,
  EoRecordCreateRequest, EoRecordUpdateRequest, EoTransitionRequest,
} from "../types/eoRecord";

const buildEoFilterParams = (f: EoRecordFilter): URLSearchParams => {
  const params = new URLSearchParams();
  if (f.page) params.append("page", String(f.page));
  if (f.limit) params.append("limit", String(f.limit));
  if (f.record_type_id) params.append("record_type_id", f.record_type_id);
  if (f.search) params.append("search", f.search);
  if (f.state) params.append("state", f.state);
  if (f.sort_by) params.append("sort_by", f.sort_by);
  if (f.sort_order) params.append("sort_order", f.sort_order);
  return params;
};

export const eoRecordTypeApi = {
  list: async (): Promise<ApiResponse<EoRecordType[]>> => {
    const res = await apiClient.get("/admin/eo-record-types");
    return res.data;
  },
};

export const eoRecordApi = {
  list: async (filter: EoRecordFilter = {}): Promise<EoRecordListResponse> => {
    const res = await apiClient.get(`/eo-records?${buildEoFilterParams(filter)}`);
    return res.data;
  },
  search: async (body: Record<string, unknown>): Promise<EoRecordListResponse> => {
    const res = await apiClient.post("/eo-records/search", body);
    return res.data;
  },
  myAssigned: async (filter: EoRecordFilter = {}): Promise<EoRecordListResponse> => {
    const res = await apiClient.get(`/eo-records/my-assigned?${buildEoFilterParams(filter)}`);
    return res.data;
  },
  getById: async (id: string): Promise<ApiResponse<EoRecord>> => {
    const res = await apiClient.get(`/eo-records/${id}`);
    return res.data;
  },
  create: async (data: EoRecordCreateRequest): Promise<ApiResponse<EoRecord>> => {
    const res = await apiClient.post("/eo-records", data);
    return res.data;
  },
  update: async (id: string, data: EoRecordUpdateRequest): Promise<ApiResponse<EoRecord>> => {
    const res = await apiClient.put(`/eo-records/${id}`, data);
    return res.data;
  },
  getAvailableTransitions: async (id: string): Promise<ApiResponse<AvailableTransition[]>> => {
    const res = await apiClient.get(`/eo-records/${id}/transitions`);
    return res.data;
  },
  transition: async (id: string, data: EoTransitionRequest): Promise<ApiResponse<EoRecord>> => {
    const res = await apiClient.post(`/eo-records/${id}/transition`, data);
    return res.data;
  },
  getChildren: async (id: string): Promise<ApiResponse<EoRecord[]>> => {
    const res = await apiClient.get(`/eo-records/${id}/children`);
    return res.data;
  },
  addLink: async (id: string, data: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    const res = await apiClient.post(`/eo-records/${id}/links`, data);
    return res.data;
  },
};
```

---

## 2. Data fetching

**React Query is the dominant and correct pattern.** Redux Toolkit is a dependency but `src/hooks/redux.ts` is a 5-line stub and no slice directory exists; global non-server state lives in **zustand** stores (`src/stores/authStore.ts`, `licenseStore.ts`, `incidentFilterStore.ts`). Raw axios-in-component is not used.

- Client config: `src/App.tsx:517-524` — `retry: 1`, `refetchOnWindowFocus: false`.
- **Shared hooks directory is `src/hooks/`**, one file per module: `useGoals.ts`, `useKpi.ts`, `useReviews.ts`, `useDocuments.ts`, `useLicense.ts`.
- **Query-key convention:** a frozen key factory exported from the hooks file.
  `src/hooks/useGoals.ts:40-88` — `goalKeys = { all: ["goals"] as const, lists: () => [...all,"list"], list: (filter) => [...lists(), filter], details: () => [...all,"detail"], detail: (id) => [...details(), id], ... }`. Same shape at `src/hooks/useLicense.ts:7-12`.
- **Query hook:** `useQuery({ queryKey: goalKeys.list(filter), queryFn: () => goalApi.list(filter) })` (`src/hooks/useGoals.ts:94-99`); detail hooks add `enabled: !!id` (`:101-107`).
- **Mutation hook:** `useMutation` + `queryClient.invalidateQueries({ queryKey: xKeys.lists() })` and `xKeys.detail(id)` in `onSuccess`, `toast.success` on success, `toast.error` on error (`src/hooks/useGoals.ts:113-186`).
- Ad-hoc lookups inline in a page use a literal key array: `useQuery({ queryKey: ["admin","users"], queryFn: () => userApi.list(1,100) })` (`src/pages/admin/GoalCreatePage.tsx:94-101`).
- `keepPreviousData` is used for paginated lists that shouldn't flash (`src/pages/admin/ComplaintsPage.tsx:2`).

### Create `src/hooks/useEoRecords.ts`

```ts
export const eoKeys = {
  all: ["eo"] as const,
  types: () => [...eoKeys.all, "record-types"] as const,
  lists: () => [...eoKeys.all, "list"] as const,
  list: (filter: EoRecordFilter) => [...eoKeys.lists(), filter] as const,
  myAssigned: (filter: EoRecordFilter) => [...eoKeys.all, "my-assigned", filter] as const,
  details: () => [...eoKeys.all, "detail"] as const,
  detail: (id: string) => [...eoKeys.details(), id] as const,
  transitions: (id: string) => [...eoKeys.all, "transitions", id] as const,
  children: (id: string) => [...eoKeys.all, "children", id] as const,
};
```
Hooks to export: `useEoRecordTypes()` (`staleTime: Infinity` — the catalog is static per deploy; copy `src/hooks/useLicense.ts:21-32`), `useEoRecords(filter)`, `useEoMyAssigned(filter)`, `useEoRecord(id)`, `useEoTransitions(id)`, `useCreateEoRecord()`, `useUpdateEoRecord()`, `useExecuteEoTransition()`.

**Important deviation for create/update:** do **not** swallow the error in `onError` with only a toast. The EO form needs the per-field `errors` map back. Either omit `onError` and handle it at the call site in `mutateAsync`'s `catch`, or use the hook's `onError` only for the generic toast and let the page map fields (see §4).

---

## 3. List page — the EO register

**Model file: `src/pages/admin/GoalsPage.tsx` (478 lines). Copy it.** It is the cleanest, smallest full list page in the repo and already has every element the EO register needs.

What it gives you, with line refs:
- Header block with icon tile, title, live count pill, subtitle, action buttons: `:211-269`.
- Permission-gated "New" button: `canCreate = hasPermission(PERMISSIONS.GOALS_CREATE)` (`:134`) guarding the `<Link to="/goals/new">` (`:259-267`).
- Filter bar as a separate component taking `{filters, onChange}`: `<GoalFilters filters={filters} onChange={setFilters} />` (`:282`), implemented at `src/components/goals/GoalFilters.tsx` — includes removable active-filter chips (`:45-90`) and `clearFilters` resetting to `{page:1, limit}` (`:29-34`). Every filter change resets `page: 1` (`:20-27`).
- **Tables are plain `<table>` inside a bordered card** — there is no shared DataTable component. `@tanstack/react-virtual` is used in exactly one place (`src/components/ui/virtualized-list.tsx`) and is **not** the list-page pattern. Card + `overflow-x-auto` + `<table className="w-full">`: `:285-397`. Header cells use `px-6 py-3 ltr:text-left rtl:text-right text-xs font-semibold ... uppercase tracking-wider` (`:319`).
- Three states in one ternary chain — loading spinner (`:286-289`), empty state with icon + message + hint (`:290-299`), table (`:300`). Error state is an early return with a red card (`:186-206`).
- Pagination: filter-state driven `page`/`limit`, `totalPages = Math.ceil(total/limit)` (`:132`), prev/next buttons with `rtl:-rotate-180` chevrons (`:400-432`). For a numbered pager instead, `AppPagination` exists at `src/components/ui/AppPagination.tsx` (used in `src/pages/admin/ErrorLogsPage.tsx`).
- Row selection + bulk bar: `:139-156`, `:438-447`. Skip for EO v1 unless asked.

Search debouncing: `src/hooks/useDebounce.ts` (`useDebounce(value, 300)`).

### EO-specific list design
The register is **per record type**. Route `/eo/:typeKey`, resolve `typeKey` → `record_type_id` from `useEoRecordTypes()` (skip `is_abstract` types), then pass `record_type_id` into the list filter. Build columns from the first 4-5 non-abstract field definitions sorted by `sort_order`, plus a `reference` column (link to detail) and `workflow_state`. Render each cell through the same `<EoFieldValue>` display component used on the detail page (§4) so formatting is defined once.

Create: `src/pages/eo/EoRecordsPage.tsx`, `src/components/eo/EoRecordFilters.tsx`.

---

## 4. Detail + form pages

### Form library: **do not use react-hook-form for EO.**
`react-hook-form` + `@hookform/resolvers` + `zod` appear in exactly four files — `src/components/auth/LoginForm.tsx`, `RegisterForm.tsx`, `src/pages/ProfilePage.tsx`, `src/pages/SettingsPage.tsx` — i.e. only for fixed-shape auth/settings forms. **Every business CRUD form uses plain `useState`**, which is also the only workable option for EO since the field set is server-driven.

**Model file: `src/pages/admin/GoalCreatePage.tsx` (525 lines).** The pattern:
- `const [form, setForm] = useState<XCreateRequest>({...})` (`:62-74`)
- `const [errors, setErrors] = useState<Record<string, string | undefined>>({})` (`:57`)
- `handleChange(field, value)` sets the value **and clears that field's error** (`:131-137`)
- `validateForm(): Record<string,string>` for client-side required checks (`:155-186`)
- `handleSubmit` → validate → build payload → `await mutateAsync(payload)` → `navigate(...)`, with `catch {}` because the hook toasts (`:188-246`)
- Each field is a `<div>` with `<label>` (+ `<span className="text-red-500">*</span>` when required), the control, then `{errors.x && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.x}</p>}` (`:300-318`)
- Layout: `<form>` wrapping a card `rounded-xl border ... p-6` with `grid grid-cols-1 md:grid-cols-2 gap-6`, wide fields taking `md:col-span-2` (`:270-275`)

### Mapping API 400 field errors back onto fields
**Model: `src/pages/admin/IncidentCreatePage.tsx:913-938`.** It reads `error.response?.data?.errors`, maps keys into the form's field naming, merges into `errors` state, and sets a generic `errors.submit` banner message. For EO the keys arrive already as field keys, so no case conversion is needed:

```ts
onError: (error: any) => {
  const apiErrors = error?.response?.data?.errors;
  if (apiErrors && typeof apiErrors === "object") {
    setErrors((prev) => ({ ...prev, ...Object.fromEntries(
      Object.entries(apiErrors).map(([k, v]) => [k, String(v)]))}));
  }
  toast.error(error?.response?.data?.message
    || error?.response?.data?.error
    || t("eo.fixErrorsBeforeSubmit"));
}
```
A generic extractor also exists at `src/hooks/useKpi.ts:47-55` (`getApiError`) which joins `Object.values(data.errors)` — use that only for the toast text.
**Note the backend gap:** these messages are English-only. Show them verbatim under the field; do not try to translate them. Keep *client-side* required/format messages going through `t()` so at least those are Arabic.

### The field renderer — the core of this module
**Model: `src/components/common/DynamicLookupField.tsx`.** It is the repo's existing "render a field from a server-supplied definition" component: it reads `category.field_type`, localises the label with `getLocalizedName(category)` (`:108`), defines shared `commonClasses` / `errorClasses` token-based styles (`:124-128`), and `switch`es on type returning a label + control + error paragraph per case (`:130-230+`).

Create `src/components/eo/EoFieldInput.tsx` with the same structure, `switch (field.kind)`:

| kind | control | source |
|---|---|---|
| `text` | `<input type="text">` | `DynamicLookupField.tsx:149-167` |
| `long_text` | `<textarea rows={4}>` | `DynamicLookupField.tsx:169-187` |
| `number`, `percent` | `<input type="number">` (percent: `min=0 max=100`, suffix `%`) | `DynamicLookupField.tsx:207-226` |
| `dropdown` | `Select` from `src/components/ui/SelectInput.tsx` — props `{options: Option[], value, onChange, placeholder, searchable, clearable, label, error, helperText}` (`SelectInput.tsx:9-42`). Map `config.options[]` → `{value, label: localized(opt)}` | `GoalCreatePage.tsx:282-288` |
| `date` | `DatePicker` from `src/components/ui/Datepicker.tsx` (`value?: Date`, `onChange(Date\|undefined)`, `format` from `src/constants/dateFormat.ts`). Serialise as `YYYY-MM-DDT00:00:00Z` like `GoalCreatePage.tsx:216-218` | |
| `date_time` | `DatePicker` + time input, or `<input type="datetime-local">` | |
| `yes_no` | `Checkbox` from `src/components/ui/Input.tsx` (exported via `src/components/ui/index.ts:2`) or a two-option `Select` | |
| `user` | `Select` fed by `useQuery(["admin","users"], () => userApi.list(1,100))`, label `${first_name} ${last_name} (${email})` | `GoalCreatePage.tsx:94-97,121-124` |
| `org_unit` | `TreeSelect` fed by `departmentApi.getTree()` (`src/api/admin.ts:660`) | `IncidentTransitionDialog.tsx:29,200-204` |
| `multi_org_unit` | `MultiTreeSelect` (`src/components/ui/index.ts:38`) | |
| `external_body` | `Select` over external-type departments; filter `dept.type === "external"` | `IncidentTransitionDialog.tsx:92-102` |
| `file` / `multi_file` | `AttachmentDropzone` / `AttachmentUpload` from `src/components/attachments/AttachmentUpload.tsx` + `useAttachmentPolicy()` (`src/hooks/useAttachmentPolicy.ts`) | |
| `auto_number`, `workflow_state`, `link`, `user_date` | **read-only** — render as display text, never as an input | |

Write a sibling `src/components/eo/EoFieldValue.tsx` for read-only display (detail page + list cells) using the same `switch`.

Sort fields by `sort_order` before rendering; render `help_text` as `<p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">`.

### UI primitives available by name

`src/components/ui/` (app-level, barrel at `src/components/ui/index.ts`):
`Button` (+ `buttonVariants`), `Input`, `Textarea`, `Select`, `Checkbox`, `Card`/`CardHeader`/`CardTitle`/`CardContent`/`CardFooter`/`CardDescription`/`StatCard`, `Modal`/`ModalHeader`/`ModalTitle`/`ModalDescription`/`ModalBody`/`ModalFooter`, `HierarchicalTreeSelect`, `TreeSelect`, `MultiTreeSelect`, `MultiSelect`, `LocationPicker`, `LocationPickerModal`, `PhoneNumberInput`, `PasswordChecklist`, `EmailChipInput`, `AppPagination`, `TooltipPopover`, `DatePicker` (`Datepicker.tsx`), `SelectInput` (searchable `Select`, default export), `ApplicationLinkSubModal`, `virtualized-list`.

`src/ui/` (shadcn primitives, alias `@/ui`, configured in `components.json`):
`avatar`, `button`, `calendar`, `command`, `date-range-picker`, `dialog`, `input-group`, `input`, `label`, `pagination`, `popover`, `select`, `tabs`, `textarea`.

Helpers: `cn()` from `@/lib/utils` (`src/lib/utils.ts:5-7`).

### Detail page
Model the shell on `src/pages/admin/GoalDetailPage.tsx`: back link + title + reference + action buttons in the header (`:417-495`), tabbed body with `border-b-2` tab buttons (`:604`), delete confirm modal (`:518-526`). Create `src/pages/eo/EoRecordDetailPage.tsx` with tabs: **Details** (grouped `EoFieldValue` grid), **Children** (`GET /eo-records/:id/children`), **Links**. Put the transitions bar in the header.

Create `src/pages/eo/EoRecordCreatePage.tsx` and `src/pages/eo/EoRecordEditPage.tsx` (edit sends `{record_type_id, values}` on `PUT`).

---

## 5. Workflow / transition UI

**Yes — reuse `src/components/goals/MetricTransitionModal.tsx` (255 lines). This is the exact pattern.** It:
- takes `{ entityId, entityName, transitions: AvailableTransition[], isOpen, onClose }` (`:10-16`)
- filters to `transitions.filter(tr => tr.can_execute)` (`:115`)
- renders each as a selectable bordered button, colour-coded by `transition.is_rejection` / `transition.code` prefix (`getTransitionColor`, `:78-86`; `colorClasses`, `:88-113`; render `:158-179`)
- derives `commentRequired` from `selectedTransition.requirements.some(r => r.requirement_type === "comment" && r.is_mandatory)` (`:44-49`)
- shows the comment `<textarea>` only once a transition is picked, with `*` or "(optional)" (`:184-215`)
- disables submit while `isPending` and shows a `Loader2` spinner (`:229-247`)
- "no transitions available" amber banner (`:141-147`)
- resets local state in `handleClose` (`:72-76`)

Copy it verbatim to `src/components/eo/EoTransitionModal.tsx`, swap `useExecuteMetricTransition` for `useExecuteEoTransition`, and post `{transition_id, comment, values?}`. If a transition requires extra field values, render those through `EoFieldInput` into a `values` object before submit — the richer multi-step version of this (field-change steps, attachments, assignee pickers) is `src/components/incidents/IncidentTransitionDialog.tsx`, but it is incident-specific and 1000+ lines; take ideas, not code.

A simpler non-modal variant (transition buttons directly in the detail header) is `src/pages/admin/GoalDetailPage.tsx:455-466`.

---

## 6. Routing, nav and gating — concrete steps

### 6.1 `src/constants/permissions.ts`
Add before the closing `} as const;` (file ends at the `CALL_RECORDING_HISTORY` entry):
```ts
  // Executive Office
  EO_VIEW: "eo:view",
  EO_CREATE: "eo:create",
  EO_UPDATE: "eo:update",
  EO_TRANSITION: "eo:transition",
  DASHBOARD_EO: "dashboard:eo",   // only if the backend actually issues it;
                                  // otherwise gate the card on EO_VIEW
```
Per-type permissions (`eo:eo_directive:create`) are dynamic — build them at runtime: `hasPermission(\`eo:${type.key}:create\`) || hasPermission(PERMISSIONS.EO_CREATE)`. Do not enumerate them in the constants file.

Optionally add convenience methods to `src/hooks/usePermissions.ts` next to the KPI block (`:172-195`): `canViewEo`, `canCreateEo`, `canUpdateEo`, `canTransitionEo`.

### 6.2 `src/App.tsx`
a) Add lazy imports next to the other page imports (pattern at `:58-62`; named exports need the `.then(m => ({default: m.X}))` re-wrap):
```ts
const EoRecordsPage = lazy(() => import("./pages/eo/EoRecordsPage").then(m => ({ default: m.EoRecordsPage })));
const EoRecordDetailPage = lazy(() => import("./pages/eo/EoRecordDetailPage").then(m => ({ default: m.EoRecordDetailPage })));
const EoRecordCreatePage = lazy(() => import("./pages/eo/EoRecordCreatePage").then(m => ({ default: m.EoRecordCreatePage })));
const EoRecordEditPage = lazy(() => import("./pages/eo/EoRecordEditPage").then(m => ({ default: m.EoRecordEditPage })));
```
b) Add a route block modelled exactly on the Goals block at `src/App.tsx:1331-1393`, after it:
```tsx
{/* Executive Office routes - dedicated layout */}
<Route element={<AdminProtectedRoute />}>
  <Route element={<EoLayout />}>
    <Route element={<PermissionRoute requiredPermissions={[PERMISSIONS.EO_VIEW]} />}>
      <Route path="/eo" element={<Navigate to="/eo/records" replace />} />
      <Route path="/eo/my-assigned" element={<EoRecordsPage />} />
      <Route path="/eo/:typeKey" element={<EoRecordsPage />} />
      <Route path="/eo/:typeKey/new" element={<EoRecordCreatePage />} />
      <Route path="/eo/:typeKey/:id" element={<EoRecordDetailPage />} />
      <Route path="/eo/:typeKey/:id/edit" element={<EoRecordEditPage />} />
    </Route>
  </Route>
</Route>
```
(Order the static segments `my-assigned` before `:typeKey`.)
c) Import `EoLayout` from `./components/layout` (add it to the destructured import at `:15-31`).

### 6.3 `src/components/layout/EoLayout.tsx` + `src/components/layout/index.ts`
Copy `src/components/layout/GoalLayout.tsx` wholesale — it is the dark sidebar shell every module uses (logo `BrandLogo`, collapse button, `NavLink` items with `navLinkClass` at `:110-115`, active indicator bar `absolute start-0 ... rounded-e-full` at `:156`, language switcher via `setLanguage` from `../../i18n` at `:77-85`, `ThemeToggle`, `NotificationBell`, `SoftphoneButton`, logout via `setLoggingOut(true)` then `authApi.logout()` at `:97-108`). Replace the nav item list with "My Assigned" plus one item per non-abstract record type from `useEoRecordTypes()`, each gated on `eo:<key>:view || eo:view`. Export it from `src/components/layout/index.ts`.

### 6.4 `src/pages/DashboardPage.tsx`
Append to the `navigationCards` array, which ends at `:259` (last entry = Goal Management, `:248-258`):
```ts
    {
      title: t("eo.dashboard.title", "Executive Office"),
      subtitle: t("eo.dashboard.subtitle", "Correspondence & Directives"),
      description: t("eo.dashboard.description", "Track directives, memos and executive records"),
      href: "/eo",
      icon: Briefcase,            // add to the lucide-react import at :14-29
      gradient: "from-[#6366F1] to-[#4338CA]",
      shadowColor: "shadow-indigo-500/20",
      permissions: [PERMISSIONS.DASHBOARD_EO],   // or [PERMISSIONS.EO_VIEW]
      licenseFeature: "eo_platform",
    },
```
The `NavigationCard` interface is at `:32-45`; filtering happens at `:264-276` — permission OR super-admin, then `licenseFeature` is checked against `isFeatureLicensed()` **unless** license data has not loaded (`!hasLicense` → show, to avoid flicker). Nothing else to wire; the card renders automatically.

### 6.5 Admin: record-type catalogue (optional, if in scope)
Add a `SidebarItem` to `sidebarSectionsConfig` in `src/components/layout/AdminLayout.tsx` (interface at `:55-65`, "System" section at `:125-180`):
```ts
{ icon: FileStack, labelKey: "eo.admin.recordTypes", path: "/admin/eo-record-types",
  permission: PERMISSIONS.EO_VIEW, licenseFeature: "eo_platform" },
```
Gating logic is `itemAllowed` at `:273-279` — identical semantics to the dashboard card.

### 6.6 Barrels
Pages are also re-exported from `src/pages/admin/index.ts` (goals entries near the tail). EO pages live under `src/pages/eo/`; create `src/pages/eo/index.ts` and leave `src/pages/index.ts` alone unless you need the barrel — `App.tsx` imports lazily from the concrete file anyway (`:53-57` explains why: per-page Rollup chunks).

### 6.7 Page-level license guard
There is **no license-aware route component** — `isFeatureLicensed` is only consulted in `DashboardPage` and `AdminLayout`. A user with `eo:view` but no `eo_platform` licence can still deep-link to `/eo`. Add an early return inside `EoLayout`:
```tsx
const { isFeatureLicensed, hasLicense } = useLicense();
const { isSuperAdmin } = usePermissions();
if (hasLicense && !isSuperAdmin && !isFeatureLicensed("eo_platform"))
  return <Navigate to="/dashboard" replace />;
```

---

## 7. i18n

- Bundles: `src/i18n/locales/en.json` and `ar.json`, both with the same 60 top-level namespaces, loaded at `src/i18n/index.ts:5-13`.
- **Key convention:** one top-level namespace per module, dot-nested below it. `goals` has `title`, `subtitle`, `empty`, `emptyHint`, `pageOf`, and nested groups `table.*`, `create.fields.*`, `create.errors.*`, `detail.*`, `components.*`. Mirror that: add an `"eo"` namespace to **both** files with `eo.title`, `eo.subtitle`, `eo.empty`, `eo.emptyHint`, `eo.table.*`, `eo.create.*`, `eo.detail.*`, `eo.transition.*`, `eo.dashboard.*`, `eo.admin.*`.
- Usage: `const { t } = useTranslation();` then `t("eo.title")`. An inline English default as the second argument is common for newer keys — `t("dashboard.requestManagement", "Request Management")` (`DashboardPage.tsx:160`) — but **still add the key to both JSON files**; the default is a safety net, not a substitute.
- Interpolation: `t("goals.pageOf", { current, total })` (`GoalsPage.tsx:402`).
- **RTL:** handled globally. `setLanguage()` sets `document.documentElement.dir = "rtl"` for Arabic (`src/i18n/index.ts:39-45`), plus `isRTL()` (`:53-56`) and `supportedLanguages` (`:15-18`) if a component needs to branch. Components only need logical Tailwind properties (see §0).

### Field labels from the API (`label` / `label_ar`)
Field labels are **server data, not i18n keys**. Two existing helpers do exactly this; use one, do not write a third:

1. **`useLocalizedField()` — `src/hooks/useLocalizedField.ts:14-48`.** Preferred. Returns `localize(record, "label")`; it tries `label_<lang>` for the current language, then the app-default language, then the bare `label`, then `""` (`:29-47`). Fallback is built in, so a missing `label_ar` silently shows the English `label` — which is the required behaviour while the client has not supplied Arabic.
2. `getLocalizedField(obj, "label")` — `src/lib/utils.ts:71-77`. Non-hook, reads `i18n.language` directly; same `ar → _ar, else base` rule. Use inside non-React helpers, table-column builders, or `switch` branches where a hook can't be called. `getLocalizedName` (`:56-60`) is the `name`/`name_ar` shortcut for record types.

In `EoFieldInput`/`EoFieldValue`:
```ts
const localize = useLocalizedField();
const label = localize(field, "label");            // label_ar → label → ""
const help  = localize(field, "help_text");
// dropdown options carry label/label_ar too:
const options = (field.config?.options ?? []).map(o => ({
  value: o.value,
  label: localize(o as unknown as Record<string, unknown>, "label"),
}));
```
**When `label_ar` is missing:** render the English `label` as-is — no asterisk, no "(EN)" marker, no `t()` lookup fallback, no placeholder key. The helper already does this. Do **not** key field labels off the i18n bundle; only the module chrome (page titles, buttons, column headers you add yourself, empty states, error banners) goes through `t()`. Record-type names use the same rule via `getLocalizedName(recordType)`.

---

## 8. Risks — the three things most likely to break or look wrong

1. **Dark mode + the two competing colour idioms.** `dark` is a class on `<html>` (`src/hooks/useTheme.ts:14-19`) with no runtime theme context, so any hard-coded `bg-white`, `text-slate-900` or `border-slate-200` written without its `dark:` twin produces a white card on a dark page — the single most common visual defect when copying partial snippets. Mitigation: write new EO components with the token form (`bg-[hsl(var(--background))]`, `text-[hsl(var(--foreground))]`, `border-[hsl(var(--border))]`) as `src/components/common/DynamicLookupField.tsx:124-125` does, and if you copy a block from `GoalsPage.tsx` copy the `dark:` classes with it.

2. **RTL.** Arabic flips the whole document (`src/i18n/index.ts:42`). A dynamic, dense form with dozens of server-driven fields is the easiest place in the app to leak `ml-*`/`text-left`/`left-0`/un-rotated chevrons. Mitigation: logical properties everywhere, `rtl:-rotate-180` on every directional icon (`GoalsPage.tsx:415,429`), `ltr:text-left rtl:text-right` on table headers (`:319`), and test by switching the language in the layout's language menu.

3. **The required layout wrapper + the 401 interceptor.** A page rendered outside `ProtectedRoute` → `AdminProtectedRoute` → `<XLayout>` gets no sidebar, no navbar, no license bootstrap (`ProtectedRoute` is what calls `useLicenseInfo()` and populates the license store — `src/components/layout/ProtectedRoute.tsx:11`), so `isFeatureLicensed` silently returns false everywhere. Separately, `src/api/client.ts:94-188` is a global response interceptor that on **any** 401 attempts a token refresh and, on failure, wipes localStorage and hard-navigates to `/login` (`:69-79`). Consequence: if `eo_platform` is unlicensed or a permission is missing and the backend answers 401 rather than 403, the user is **logged out**, not shown a friendly message. Mitigation: nest EO routes exactly as in §6.2, add the layout-level licence guard in §6.7, and verify against the live backend that an unlicensed/unauthorised EO call returns 403 (passes through untouched) and not 401. A secondary gotcha from the same file: `Accept-Language` is sent on every request (`:190-196`), so some EO responses may already be localised server-side — check before double-localising.

**Runner-up worth knowing:** EO validation messages from `400 {"success":false,"errors":{...}}` are English-only by backend design. They must be surfaced verbatim under the offending field; keep client-side required checks going through `t()` so Arabic users still get Arabic for the common cases.

---

## 9. File manifest (what to create)

```
src/types/eoRecord.ts                        new  — types (§1)
src/api/eoRecords.ts                         new  — service module (§1)
src/hooks/useEoRecords.ts                    new  — query keys + hooks (§2)
src/components/layout/EoLayout.tsx           new  — copy of GoalLayout.tsx (§6.3)
src/components/eo/EoFieldInput.tsx           new  — kind switch, copy DynamicLookupField.tsx (§4)
src/components/eo/EoFieldValue.tsx           new  — read-only display (§4)
src/components/eo/EoRecordFilters.tsx        new  — copy goals/GoalFilters.tsx (§3)
src/components/eo/EoTransitionModal.tsx      new  — copy goals/MetricTransitionModal.tsx (§5)
src/components/eo/index.ts                   new  — barrel
src/pages/eo/EoRecordsPage.tsx               new  — copy admin/GoalsPage.tsx (§3)
src/pages/eo/EoRecordDetailPage.tsx          new  — shell from admin/GoalDetailPage.tsx (§4)
src/pages/eo/EoRecordCreatePage.tsx          new  — copy admin/GoalCreatePage.tsx (§4)
src/pages/eo/EoRecordEditPage.tsx            new
src/pages/eo/index.ts                        new  — barrel

src/App.tsx                                  edit — lazy imports + route block after :1393 (§6.2)
src/pages/DashboardPage.tsx                  edit — navigationCards entry after :258 (§6.4)
src/constants/permissions.ts                 edit — EO_* codes (§6.1)
src/hooks/usePermissions.ts                  edit — canViewEo/canCreateEo/... (optional, §6.1)
src/components/layout/index.ts               edit — export EoLayout (§6.3)
src/components/layout/AdminLayout.tsx        edit — admin sidebar item (optional, §6.5)
src/i18n/locales/en.json                     edit — "eo" namespace (§7)
src/i18n/locales/ar.json                     edit — "eo" namespace, same keys (§7)
```
