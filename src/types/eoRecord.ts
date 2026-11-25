import type { WorkflowState, WorkflowTransition } from "./index";

/**
 * Executive Office (EO) record platform types.
 *
 * Shapes here were read off the live backend (GET /api/v1/eo-records,
 * /api/v1/admin/eo-record-types[/:id/fields]) rather than inferred, because
 * three details differ from what a naive reading of the Go models suggests:
 *
 *  1. A record type's `fields` endpoint returns only the type's OWN field
 *     definitions. The 17 fields every type inherits live on the abstract
 *     `eo_base` type and must be merged client-side by walking
 *     `parent_type_id` — see `resolveEffectiveFields` in lib/eoFields.ts,
 *     which mirrors services.ResolveEffectiveFields on the server.
 *  2. Those 17 inherited fields are real COLUMNS on the record
 *     (subject_ar, priority, due_date, …) while a type's own fields sit in
 *     the `values` jsonb bag. Reads must flatten both into one field space
 *     (the server's eoFlattenStored); writes send everything under `values`
 *     (the server's eoApplyValues splits it again).
 *  3. The list envelope paginates with `total_items`/`total_pages`, not the
 *     `total` that GoalListResponse uses.
 */

/**
 * Every field kind the server accepts, read off models.EOFieldKinds
 * (internal/models/eo_record_type.go) rather than off any prose list of
 * them: there are TWENTY-SEVEN, and the summaries in the specs name
 * eighteen. The eight this union was missing before the designer could
 * create a field — `multi_user`, `time`, `email`, `phone`, `url`,
 * `multi_link`, `multi_user_status`, `multi_user_ack` — are all accepted by
 * handlers.eoValidateFieldShape, so a union that omitted them would have
 * made the designer refuse kinds the platform supports while typing the
 * ones it does not.
 *
 * Order follows the Go constant block so the two can be diffed by eye.
 */
export type EoFieldKind =
  | "auto_number"
  | "text"
  | "long_text"
  | "dropdown"
  | "multi_select"
  | "number"
  | "percent"
  | "yes_no"
  | "date"
  | "date_time"
  | "time"
  | "file"
  | "multi_file"
  | "user"
  | "multi_user"
  | "user_date"
  | "org_unit"
  | "multi_org_unit"
  | "external_body"
  | "email"
  | "phone"
  | "url"
  | "link"
  | "multi_link"
  | "workflow_state"
  | "multi_user_status"
  | "multi_user_ack";

/** How the engine fills a field. `auto` and `derived` are never writable. */
export type EoProvenance = "user" | "auto" | "derived" | "system" | "";

export type EoRequiredMode =
  | "always"
  | "never"
  | "at_state"
  | "conditional"
  | "";

export interface EoDropdownOption {
  value: string;
  label: string;
  label_ar?: string;
}

export interface EoFieldConfig {
  options?: EoDropdownOption[];
  /**
   * `link` fields only: the `key` of the record type the link must point at,
   * e.g. "eo_execution_plan_stage". Verified against the live seed — four of
   * the pilot's link definitions carry it and the Directive's `origin_record`
   * does NOT, which means "any record type" rather than "misconfigured".
   */
  target_type_key?: string;
  [k: string]: unknown;
}

export interface EoFieldDefinition {
  id: string;
  record_type_id: string;
  key: string;
  label: string;
  label_ar?: string;
  kind: EoFieldKind;
  config?: EoFieldConfig;
  provenance: EoProvenance;
  required_mode: EoRequiredMode;
  required_rule?: string;
  required_at_state_ids?: string[] | null;
  formula?: string;
  /**
   * What makes a `derived` field recompute. services.RecomputeDerived parses
   * it as a list of {type, field, scope, aggregates}; a derived field whose
   * formula names a child aggregate but whose recompute_on is empty resolves
   * nothing and is silently dropped from the result map, so the designer
   * treats an empty one on a derived field as a warning.
   */
  recompute_on?: unknown[] | null;
  is_indexed?: boolean;
  is_locked_after_state_id?: string | null;
  sort_order: number;
  help_text?: string;
  help_text_ar?: string;
  ar_untranslated?: boolean;
}

export interface EoRecordType {
  id: string;
  key: string;
  name: string;
  name_ar?: string;
  icon?: string;
  parent_type_id?: string | null;
  is_abstract: boolean;
  reference_prefix?: string;
  reference_mode?: string;
  reference_pattern?: string;
  workflow_id?: string | null;
  capabilities?: unknown[];
  is_active: boolean;
}

export type EoValues = Record<string, unknown>;

/**
 * A record as the API returns it: the inherited fields as columns, the
 * type-specific ones inside `values`.
 */
export interface EoRecord {
  id: string;
  record_type_id: string;
  reference: string;
  subject_ar: string;
  subject_en: string;
  parent_record_id: string | null;
  state_id: string | null;
  priority: string;
  sensitivity: string;
  source: string;
  owning_body_id: string | null;
  assigned_user_id: string | null;
  due_date: string | null;
  closed_at: string | null;
  created_by_id: string | null;
  change_reason: string;
  delay_reason: string;
  values: EoValues;
  documenta_folder_id?: string;
  created_at: string;
  updated_at: string;
}

export interface EoRecordFilter {
  page?: number;
  limit?: number;
  /** Repeated query param — the backend binds []string. */
  record_type_id?: string[];
  state_id?: string[];
  owning_body_id?: string[];
  assigned_user_id?: string[];
  priority?: string[];
  sensitivity?: string[];
  source?: string[];
  parent_record_id?: string;
  search?: string;
  /** Allow-listed server side: created_at | updated_at | due_date | reference */
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

/**
 * The body POST /eo-records/search binds. It is models.EORecordFilter's JSON
 * side, where the array-valued filters are plain arrays rather than the
 * repeated query params the GET form needs.
 */
export interface EoRecordSearchBody {
  search?: string;
  record_type_id?: string[];
  state_id?: string[];
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

/**
 * The EO list envelope. Note total_items/total_pages, not `total`.
 *
 * Every EO list route answers with this — the register, my-assigned, search
 * AND the children of a record, which the handler serves through the same
 * `list` helper with a default limit of 20.
 */
export interface EoRecordListResponse {
  success: boolean;
  data: EoRecord[];
  page: number;
  limit: number;
  total_items: number;
  total_pages: number;
}

export interface EoRecordCreateRequest {
  record_type_id: string;
  parent_record_id?: string;
  parent_link_type_key?: string;
  values: EoValues;
}

export interface EoRecordUpdateRequest {
  record_type_id: string;
  values: EoValues;
}

export interface EoTransitionRequest {
  transition_id: string;
  comment?: string;
  attachments?: string[];
  values?: EoValues;
}

/**
 * GET /eo-records/:id/transitions returns bare WorkflowTransition objects that
 * the service has ALREADY filtered to what this actor may run — there is no
 * `can_execute` wrapper as the goals module has. `requirements` is present
 * only when the workflow configures any.
 *
 * ── the blocked indicator (Task B1) ─────────────────────────────────────────
 * A transition the actor MAY run but that an open child record forbids right
 * now is still offered, carrying three extra keys. All three are Go
 * `omitempty`, so **an absent key means false / empty / zero** and a
 * transition that is not blocked carries NONE of them. They are optional here
 * for that reason, and every consumer reads them through `lib/eoBlocking.ts`
 * rather than trusting a shape.
 *
 * `blocking_references` names only the blocking children THIS caller may see;
 * `blocking_hidden_count` counts the rest. §7.11 conceals a restricted
 * record's existence, so a blocker the caller may not open is COUNTED and
 * NEVER NAMED — the split is the confidentiality rule itself, not a
 * convenience, and the copy built from it must not undo it.
 */
export interface EoAvailableTransition extends WorkflowTransition {
  /** Absent means false: an open child record forbids this move right now. */
  blocked?: boolean;
  /** The blocking children this caller may open. Absent means none. */
  blocking_references?: string[];
  /** How many further blockers exist that this caller may NOT open. */
  blocking_hidden_count?: number;
}

export type EoWorkflowState = WorkflowState;

/**
 * 201 from POST /eo-records/:id/files. `documenta_file_id` is the value a
 * `file` / `multi_file` field stores; the other three are known only to the
 * client that performed the upload, because nothing in Automax persists them
 * (the record holds the bare id and there is no list-files route).
 */
export interface EoFileUploadResult {
  documenta_file_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
}

/**
 * Whether this deployment can store EO documents at all.
 *
 * There is no endpoint that answers it: the upload route refuses with 503
 * naming EO_DOCUMENTA_ENABLED=false, and that refusal is the only signal
 * there is. It is cached so one field's 503 teaches every other field.
 */
export interface EoDocumentaStatus {
  available: boolean;
  /** The server's own words, shown verbatim — it names the setting. */
  message?: string;
}

// ── the type designer (admin) ───────────────────────────────────────────────

/** `reference_mode`, as handlers.eoValidateTypeShape allow-lists it. */
export type EoReferenceMode = "" | "own" | "parent";

/**
 * GET /admin/eo-record-types/:id. The by-id read is the ONLY type read that
 * carries field definitions: the LIST route returns none at all (handler
 * List serves models.EORecordType rows straight from the repository, Get sets
 * t.Fields first). Written as its own type so a caller cannot read `fields`
 * off a list row and silently get `undefined`.
 */
export interface EoRecordTypeDetail extends EoRecordType {
  fields?: EoFieldDefinition[];
}

/**
 * The body POST / and PUT /admin/eo-record-types/:id bind
 * (handlers.eoRecordTypeRequest).
 *
 * PUT REPLACES the attribute set — an omitted key is read as an empty value,
 * not as "leave it alone" — so every edit sends the whole shape. The two
 * exceptions are deliberate on the server and mirrored here:
 *
 *  - `capabilities` omitted or empty leaves the stored column alone, which is
 *    load-bearing for the pilot seed's "never configured" marker. The
 *    designer does not edit capabilities, so it never sends the key.
 *  - `confirm_destructive` is not an attribute of the type. It authorises ONE
 *    §7.14-refused change and is recorded in the audit log. Task F5 fills it;
 *    F1 never sends one, so an edit this screen refuses to confirm is refused
 *    by the server rather than waved through.
 */
export interface EoRecordTypeRequest {
  key: string;
  name: string;
  name_ar?: string;
  icon?: string;
  parent_type_id?: string | null;
  is_abstract: boolean;
  reference_prefix?: string;
  reference_mode?: EoReferenceMode;
  reference_pattern?: string;
  workflow_id?: string | null;
  is_active?: boolean;
  confirm_destructive?: EoDestructiveConfirmation;
}

/**
 * models.EODestructiveConfirmation — §7.14's other half. Declared here so F5
 * has the shape to fill and so EoRecordTypeRequest can name it; F1 sends none.
 */
export interface EoDestructiveConfirmation {
  /** The key of the type the operator authorised the change on. */
  type_key: string;
  /** One of models.EODestructiveChanges — a wire contract, stored verbatim. */
  change: string;
  field_key?: string;
  /** The rule the operator states for the records the edit leaves behind. */
  reason?: string;
}

/**
 * The body POST /:id/fields and PUT /:id/fields/:field_id bind
 * (handlers.eoFieldDefRequest).
 *
 * PUT REPLACES the attribute set, exactly as the type routes do, with three
 * exceptions that live in handlers.eoFieldDefRequest.applyTo and are
 * mirrored by every caller here:
 *
 *  - `config`, `required_at_state_ids` and `recompute_on` are applied only
 *    when the request carries a NON-EMPTY value (`if len(r.Config) > 0`).
 *    Sending `{}` or `[]` is non-empty JSON and DOES overwrite; omitting the
 *    key leaves the stored column alone. So an editor that models only part
 *    of a field's `config` must send the whole stored object back, or the
 *    keys it does not model are destroyed on the first save.
 *  - `ar_untranslated` is deliberately NOT in the request: it is write-only
 *    on the sign-off route, and a designer save must never clear it
 *    (handlers.TestFieldDefRequestCannotCarryTheUntranslatedMarker pins its
 *    absence). It is therefore absent here too.
 *  - `confirm_destructive` authorises ONE §7.14-refused change — removing a
 *    field, changing its kind, or making it required while records exist.
 *    Task F5 fills it; F2 sends none, so a refused edit stays refused.
 */
export interface EoFieldDefRequest {
  key: string;
  label: string;
  label_ar?: string;
  kind: EoFieldKind | "";
  config?: EoFieldConfig;
  provenance?: EoProvenance;
  required_mode?: EoRequiredMode;
  required_rule?: string;
  required_at_state_ids?: string[];
  formula?: string;
  recompute_on?: unknown[];
  is_indexed?: boolean;
  is_locked_after_state_id?: string | null;
  sort_order: number;
  help_text?: string;
  help_text_ar?: string;
  confirm_destructive?: EoDestructiveConfirmation;
}

/**
 * A link type as the API returns it (models.EOLinkType, spec §7.6).
 *
 * `source_type_ids` / `target_type_ids` are JSONB the server stores verbatim
 * and does NOT validate on a link-type write: an array of type ids, an array
 * containing the literal "any", or the bare string "any". `eoLinkEndpoints`
 * (lib/eoLinks.ts) is the one reader that normalises them.
 */
export interface EoLinkType {
  id: string;
  key: string;
  label: string;
  label_ar?: string;
  source_type_ids: string[] | string | null;
  target_type_ids: string[] | string | null;
  cardinality: string;
  derive_deadline_from_parent: boolean;
  deadline_offset_days: number;
  blocks_parent_closure: boolean;
  blocks_parent_transition_key: string;
  cascade_sensitivity: boolean;
}

/** PUT replaces the attribute set, so create and update share one shape. */
export interface EoLinkTypeRequest {
  key: string;
  label: string;
  label_ar: string;
  source_type_ids: string[];
  target_type_ids: string[];
  cardinality: string;
  derive_deadline_from_parent: boolean;
  deadline_offset_days: number;
  blocks_parent_closure: boolean;
  blocks_parent_transition_key: string;
  cascade_sensitivity: boolean;
}
