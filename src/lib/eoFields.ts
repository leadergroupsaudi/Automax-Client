import { isEoDestructiveKey } from "./eoRefusalText";
import type {
  EoFieldDefinition,
  EoFieldDefRequest,
  EoFieldKind,
  EoRecord,
  EoRecordType,
  EoValues,
} from "../types/eoRecord";

/**
 * Client-side mirrors of three server rules the EO API does not expose as an
 * endpoint. Each one is cited against the Go file it mirrors so the two can be
 * kept in step.
 */

/**
 * Keys the save pipeline writes itself. Submitting one of these is rejected
 * with "is set by the engine and cannot be written".
 * Mirrors services.eoEngineOwnedKeys (eo_record_service.go).
 */
export const EO_ENGINE_OWNED_KEYS = new Set([
  "reference",
  "record_type_id",
  "parent_record_id",
  "state_id",
  "closed_at",
  "created_by_id",
  "created_at",
  "updated_at",
]);

/**
 * Field keys stored as real columns on eo_records rather than in the `values`
 * jsonb. Reads must look here first; writes still send them under `values`.
 * Mirrors services.eoFlattenStored (eo_record_service.go).
 */
const EO_COLUMN_KEYS = [
  "reference",
  "subject_ar",
  "subject_en",
  "parent_record_id",
  "state_id",
  "priority",
  "sensitivity",
  "source",
  "owning_body_id",
  "assigned_user_id",
  "due_date",
  "closed_at",
  "created_by_id",
  "change_reason",
  "delay_reason",
  "created_at",
  "updated_at",
] as const;

/**
 * Resolves the fields a record type effectively has: its own plus every
 * ancestor's, ordered ancestors-first then by sort_order then by key. A type
 * that redefines an ancestor's key replaces it IN THE ANCESTOR'S POSITION —
 * the override's own sort_order deliberately has no effect, because a field
 * must sit in the same place on every type's form.
 *
 * Mirrors services.ResolveEffectiveFields (eo_fields.go).
 *
 * @param type        the concrete record type
 * @param typesById   every record type, keyed by id (for the parent walk)
 * @param defsByTypeId each type's OWN definitions, keyed by record type id
 */
export function resolveEffectiveFields(
  type: EoRecordType | undefined,
  typesById: Map<string, EoRecordType>,
  defsByTypeId: Map<string, EoFieldDefinition[]>,
): EoFieldDefinition[] {
  if (!type) return [];

  // Walk to the root, then reverse so the base type's fields come first.
  const chain: EoRecordType[] = [type];
  const visited = new Set<string>([type.id]);
  let cur: EoRecordType | undefined = type;
  while (cur?.parent_type_id) {
    const parentId: string = cur.parent_type_id;
    if (visited.has(parentId) || chain.length >= 32) break; // cycle / depth guard
    const parent = typesById.get(parentId);
    if (!parent) break;
    visited.add(parentId);
    chain.push(parent);
    cur = parent;
  }
  chain.reverse();

  const out: EoFieldDefinition[] = [];
  const indexByKey = new Map<string, number>();
  for (const rt of chain) {
    const own = [...(defsByTypeId.get(rt.id) ?? [])].sort((a, b) =>
      a.sort_order !== b.sort_order
        ? a.sort_order - b.sort_order
        : a.key.localeCompare(b.key),
    );
    for (const def of own) {
      const at = indexByKey.get(def.key);
      if (at !== undefined) {
        out[at] = def;
        continue;
      }
      indexByKey.set(def.key, out.length);
      out.push(def);
    }
  }
  return out;
}

/**
 * A field the engine fills; never render it as an input.
 *
 * It takes the three attributes it reads rather than a whole definition, so
 * the DESIGNER can ask the same question of a draft that is not a stored
 * definition yet. The rule has to be shared and not restated: whether a field
 * reaches `EoFieldInput` at all is decided here, and the designer's "this
 * kind has no form control" warning is only true for fields that do.
 */
export function isReadOnlyField(
  field: Pick<EoFieldDefinition, "kind" | "provenance" | "key">,
): boolean {
  return (
    field.provenance === "auto" ||
    field.provenance === "derived" ||
    EO_ENGINE_OWNED_KEYS.has(field.key) ||
    field.kind === "auto_number" ||
    field.kind === "workflow_state"
  );
}

/** Fields the user may actually edit, in form order. */
export function writableFields(
  fields: EoFieldDefinition[],
): EoFieldDefinition[] {
  return fields.filter((f) => !isReadOnlyField(f));
}

/**
 * Flattens a record into one field-key → value map across both the columns and
 * the `values` bag, so a field definition can be rendered without caring which
 * side of the split its key lives on.
 *
 * Mirrors services.eoFlattenStored (eo_record_service.go). Columns are applied
 * last so a stale jsonb key left by an earlier configuration cannot shadow the
 * column that now owns it.
 */
export function flattenRecordValues(record: EoRecord): EoValues {
  const out: EoValues = { ...(record.values ?? {}) };
  for (const key of EO_COLUMN_KEYS) {
    out[key] = (record as unknown as Record<string, unknown>)[key];
  }
  return out;
}

/**
 * Builds the `values` payload for create/update.
 *
 * Every writable field is sent, including the empty ones, and empties are sent
 * as "" rather than omitted or null. That is not tidiness — it is required:
 *
 *  - OMITTING a key that another field's `required_rule` references makes the
 *    server's formula evaluator fail with "unresolved reference", which
 *    surfaces as a 500, not a 400. (e.g. eo_directive.origin_record's rule
 *    reads directive_origin.)
 *  - Sending NULL fails the same evaluator differently: "invalid operation:
 *    matches (mismatched types unknown and string)", also a 500.
 *
 * "" is the only empty the evaluator and the column writers both accept, and
 * the server treats it as absent for required checks.
 */
export function buildValuesPayload(
  fields: EoFieldDefinition[],
  form: EoValues,
): EoValues {
  const values: EoValues = {};
  for (const field of writableFields(fields)) {
    const v = form[field.key];
    values[field.key] =
      v === undefined || v === null ? emptyValueForKind(field.kind) : v;
  }
  return values;
}

/**
 * The empty a field of this kind should be SENT as.
 *
 * "" for everything except yes_no, which must be a real boolean: the server's
 * eoIsEmpty treats "" as empty but a bool as filled, so an unchecked box sent
 * as "" fails an `always` required yes_no with "… is required" and the user
 * has no way to answer "No".
 */
function emptyValueForKind(kind: EoFieldKind): unknown {
  return kind === "yes_no" ? false : "";
}

/**
 * Seeds form state from a record (edit) or from empty (create). Every writable
 * field gets a key so controlled inputs never flip between uncontrolled and
 * controlled.
 */
export function seedFormValues(
  fields: EoFieldDefinition[],
  record?: EoRecord,
): EoValues {
  const stored = record ? flattenRecordValues(record) : {};
  const form: EoValues = {};
  for (const field of writableFields(fields)) {
    const v = stored[field.key];
    form[field.key] =
      v === undefined || v === null ? emptyValueForKind(field.kind) : v;
  }
  return form;
}

/** True when a field must be filled before the form may be submitted. */
export function isAlwaysRequired(field: EoFieldDefinition): boolean {
  return field.required_mode === "always";
}

/** The server's emptiness test, for client-side required checks. */
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * The first few fields worth showing as register columns: subject first, then
 * whatever the type puts near the top of its own form.
 */
export function registerColumnFields(
  fields: EoFieldDefinition[],
  max = 3,
): EoFieldDefinition[] {
  const skip = new Set([
    ...EO_ENGINE_OWNED_KEYS,
    "subject_ar",
    "subject_en",
    "priority",
    "due_date",
    "attachments",
    "change_reason",
    "delay_reason",
  ]);
  // Attachments are excluded by KIND as well as by key: `file` was filtered
  // and `multi_file` was not, so a type that defines a multi_file field of
  // its own (any key but "attachments") put a column of download buttons in
  // the register — in a cell with no room for them and no record context.
  return fields
    .filter(
      (f) => !skip.has(f.key) && f.kind !== "file" && f.kind !== "multi_file",
    )
    .slice(0, max);
}

/**
 * The subject of a record in the reader's language.
 *
 * A record has `subject_en` and `subject_ar` but NO bare `subject` column, and
 * useLocalizedField's last resort is that bare key — so on an English UI it
 * would return "" for every record. The localize function is still passed in
 * (it is what picks `subject_ar` for an Arabic reader); the explicit chain
 * after it is the fallback the hook cannot provide, so a record with only one
 * of the two subjects shows that one rather than a blank.
 */
export function eoRecordSubject(
  record: Pick<EoRecord, "subject_en" | "subject_ar">,
  // eslint-disable-next-line no-unused-vars
  localize: (rec: Record<string, unknown>, field: string) => string,
): string {
  return (
    localize(record as unknown as Record<string, unknown>, "subject") ||
    record.subject_en ||
    record.subject_ar ||
    ""
  );
}

/**
 * `reference — subject`: the only way an office user identifies a record. The
 * em dash is dropped when either half is missing so a record awaiting its
 * reference does not read as "— subject".
 */
export function eoRecordLabel(
  record: Pick<EoRecord, "reference" | "subject_en" | "subject_ar">,
  // eslint-disable-next-line no-unused-vars
  localize: (rec: Record<string, unknown>, field: string) => string,
): string {
  const subject = eoRecordSubject(record, localize);
  return [record.reference, subject].filter(Boolean).join(" — ");
}

/**
 * The server's own words out of an axios rejection.
 *
 * EO refuses with `{success:false, error:"…"}` (utils.ErrorResponse) and
 * validates with `{success:false, errors:{…}}`. Both are English-only by
 * backend design and are shown verbatim — the 503 and 409 refusals in
 * particular name the setting and the record, which is the whole value of
 * them.
 */
export function eoErrorMessage(error: unknown, fallback = ""): string {
  const data = (
    error as {
      response?: { data?: { error?: string; message?: string } };
    }
  )?.response?.data;
  return data?.error || data?.message || fallback;
}

/**
 * The PER-FIELD half of an EO refusal: `{success:false, errors:{key: msg}}`
 * (handlers.eoFieldErrors), as a plain Record, or `{}` when the rejection
 * carries no field map.
 *
 * This is the part that tells someone what to fix. Reading only `message` /
 * `error` was how a transition refused for one missing field became "Failed
 * to execute transition": `eoFieldErrors` writes NO message beside the map,
 * so every extractor that looked for one found nothing and fell through to a
 * generic sentence while the server's actual answer sat one key away.
 *
 * Values are coerced to strings because the map is JSON the server built and
 * a non-string value must still be printable rather than "[object Object]".
 */
export function eoFieldErrorMap(error: unknown): Record<string, string> {
  const errors = (error as { response?: { data?: { errors?: unknown } } })
    ?.response?.data?.errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    errors as Record<string, unknown>,
  )) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

/**
 * One readable sentence for an EO refusal, field map included.
 *
 * Prefers the server's own `error` / `message` when it wrote one — the
 * backend is adding a human-readable `error` ALONGSIDE `errors` for exactly
 * this — and otherwise joins the field map, which is all a validation
 * refusal carries today. The fallback is reached only when the rejection says
 * nothing at all (a network failure).
 */
export function eoRefusalMessage(error: unknown, fallback = ""): string {
  const direct = eoErrorMessage(error);
  if (direct) return direct;
  const fields = Object.entries(eoFieldErrorMap(error));
  if (fields.length > 0) {
    return fields.map(([key, message]) => `${key}: ${message}`).join("; ");
  }
  return fallback;
}

/** The HTTP status of an axios rejection, or 0 when there is none. */
export function eoErrorStatus(error: unknown): number {
  return (error as { response?: { status?: number } })?.response?.status ?? 0;
}

/**
 * A `file` field stores one id, a `multi_file` field an array of them. Both
 * arrive as "" when empty (see buildValuesPayload), so normalising once here
 * keeps every caller from re-deciding what an empty attachment looks like.
 */
export function toFileIdList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/**
 * The EO file routes' DEPLOYMENT-level refusal — "this deployment has no
 * Documenta" — as opposed to any other 503, returning the server's own
 * sentence or null.
 *
 * Keying on the status alone was wrong, and visibly so: a gateway or proxy
 * 503 (an HTML body, no Automax payload) made the field announce that
 * document storage is not configured, which is an authoritative claim about
 * the deployment that may simply be false. The discriminator is the payload:
 * only `utils.ErrorResponse`'s envelope — `{success:false, error:"…"}` with a
 * non-empty message — is Automax speaking. Anything else is the network
 * between the browser and Automax, and is reported as a failure of that one
 * file, not of the deployment.
 */
export function eoDocumentaDisabledMessage(error: unknown): string | null {
  if (eoErrorStatus(error) !== 503) return null;
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const body = data as {
    success?: unknown;
    error?: unknown;
    message?: unknown;
  };
  if (body.success !== false) return null;
  const text =
    (typeof body.error === "string" && body.error.trim()) ||
    (typeof body.message === "string" && body.message.trim()) ||
    "";
  return text || null;
}

/**
 * The §7.14 guard rail's refusal — "this edit is destructive while records
 * exist" — as the server's own sentence, or null when the rejection is
 * something else.
 *
 * WHY THE SHAPE AND NOT THE WORDS. The sentence is built in
 * models.eoDestructiveChanges and varies by rule ("removing field %q is
 * destructive while records exist", "changing kind of field %q from %q to
 * %q…"), so matching on its text would be a guess that goes stale the first
 * time a rule is reworded — and a guard keyed on a signal that stops arriving
 * is the failure this programme keeps producing. The BODY tells them apart
 * without reading them: every attribute-shape refusal on these routes goes
 * through handlers.eoFieldErrors and therefore carries an `errors` MAP, while
 * the guard rail answers through utils.ErrorResponse and carries only
 * `error`. A 400 with a sentence and no map is the guard rail.
 *
 * The one other 400-without-a-map these routes can produce is a request body
 * fiber could not parse, which this client cannot send.
 *
 * This is also where Task F5's confirmation attaches: the sentence returned
 * here is what the operator must be shown before they may override it, and
 * the change identifier it refuses is the one their confirmation has to name.
 */
export interface EoServerRefusal {
  /** The server's own sentence, shown verbatim. */
  message: string;
  /**
   * True when the sentence is recognisably the §7.14 guard rail's, and
   * therefore when it is honest to tell the operator that this type holds
   * records and that a confirmation is what overrides the refusal.
   */
  destructive: boolean;
  /** `message_key`/`message_args`: the same refusal as data (Task B4). */
  key?: string;
  args?: Record<string, string>;
  /** The optional second clause: a mismatched confirmation, or several changes. */
  detailKey?: string;
  detailArgs?: Record<string, string>;
}

const stringMap = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
};

export function eoServerRefusal(error: unknown): EoServerRefusal | null {
  if (eoErrorStatus(error) !== 400) return null;
  if (Object.keys(eoFieldErrorMap(error)).length > 0) return null;
  const message = eoErrorMessage(error);
  if (!message) return null;
  // Every refusal models.eoDestructiveChanges builds says so in the sentence
  // — "removing field %q is destructive while records exist", "changing kind
  // … is destructive while records exist", and the seven others. The word is
  // the only thing those nine have in common besides the shape, and the
  // shape alone is what this used to key on.
  //
  // KEYING ON THE SHAPE ALONE WAS THE WRONG WAY ROUND. It was true that
  // nothing else on these routes answers 400-without-a-map today; it was not
  // true that nothing ever would. A refusal that is map-less for some other
  // reason — a malformed confirmation, which is exactly what Task F5 will
  // start sending — would have been rendered under a heading asserting that
  // this type holds records, a claim the server never made, with the toast
  // that would have said otherwise suppressed behind the same test.
  //
  // So the sentence is ALWAYS surfaced, and only the explanation is gated. A
  // rewording of the refusals costs the explanation, not the message.
  //
  // THE DISCRIMINATOR IS THE SERVER'S `message_key`, and only it. Every §7.14
  // refusal carries one (Task B4), so a body without a key, or with a key
  // outside the §7.14 family, is NOT a guard-rail refusal whatever its
  // sentence says: its sentence is shown, but the records claim and the
  // confirm route are not offered.
  const data = (error as { response?: { data?: Record<string, unknown> } })
    ?.response?.data;
  const key =
    typeof data?.message_key === "string" ? data.message_key : undefined;
  const detailKey =
    typeof data?.message_detail_key === "string"
      ? data.message_detail_key
      : undefined;
  return {
    message,
    destructive: isEoDestructiveKey(key),
    key,
    args: stringMap(data?.message_args),
    detailKey,
    detailArgs: stringMap(data?.message_detail_args),
  };
}

/**
 * One destructive change a field edit makes, in the vocabulary of
 * models.EODestructiveChanges — the identifier a confirmation has to name.
 */
export interface EoFieldDestructiveChange {
  /** `field_removed`, `field_kind` or `field_required`. */
  change: "field_removed" | "field_kind" | "field_required";
  /** The STORED key: the server names the field by what it is called now. */
  fieldKey: string;
  /** field_removed by a key rename: the key the field is being given. */
  renamedTo?: string;
  from?: string;
  to?: string;
}

/**
 * The destructive changes a PUT of `request` over `stored` makes, in the order
 * models.eoDestructiveChanges finds them — which is the order the server
 * refuses in, so the first is the one a confirmation must name.
 *
 * It mirrors the three field-level rules because the refusal is a sentence
 * and a confirmation needs the identifier: reading it back out of the
 * sentence would key the override on wording. If this ever disagrees with the
 * server the confirmation is refused with the server's own mismatch sentence,
 * which the dialog shows — it cannot authorise anything the server did not.
 *
 * A KEY RENAME IS `field_removed`. Fields are matched by key, so the old key
 * is gone from the edited set and the server judges it exactly as a removal.
 * A removed field has no kind or requiredness left to change, so it is the
 * only change reported for it (the server `continue`s the same way).
 */
export function eoFieldDestructiveChanges(
  stored: EoFieldDefinition,
  request: EoFieldDefRequest,
): EoFieldDestructiveChange[] {
  const newKey = request.key.trim();
  if (newKey !== stored.key) {
    return [
      { change: "field_removed", fieldKey: stored.key, renamedTo: newKey },
    ];
  }
  const out: EoFieldDestructiveChange[] = [];
  if (request.kind && request.kind !== stored.kind) {
    out.push({
      change: "field_kind",
      fieldKey: stored.key,
      from: stored.kind,
      to: request.kind,
    });
  }
  const neverBefore = !stored.required_mode || stored.required_mode === "never";
  const neverAfter =
    !request.required_mode || request.required_mode === "never";
  if (neverBefore && !neverAfter) {
    out.push({
      change: "field_required",
      fieldKey: stored.key,
      to: request.required_mode,
    });
  }
  return out;
}
