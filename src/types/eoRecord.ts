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

export type EoFieldKind =
  | "text"
  | "long_text"
  | "dropdown"
  | "multi_select"
  | "date"
  | "date_time"
  | "number"
  | "percent"
  | "yes_no"
  | "user"
  | "org_unit"
  | "multi_org_unit"
  | "external_body"
  | "file"
  | "multi_file"
  | "auto_number"
  | "link"
  | "workflow_state"
  | "user_date";

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

/** The EO list envelope. Note total_items/total_pages, not `total`. */
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
 */
export type EoAvailableTransition = WorkflowTransition;

export type EoWorkflowState = WorkflowState;
