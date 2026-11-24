import { isReadOnlyField } from "./eoFields";
import type {
  EoFieldConfig,
  EoFieldKind,
  EoFieldDefRequest,
  EoProvenance,
  EoRecordType,
} from "../types/eoRecord";

/**
 * What the record-type designer needs to know about a field KIND, and the
 * client-side half of "a field nobody can fill is not a configured field".
 *
 * ── where the list comes from ───────────────────────────────────────────────
 * EO_FIELD_KINDS is models.EOFieldKinds (internal/models/eo_record_type.go),
 * read off the Go constant block rather than off any prose summary of it.
 * There are TWENTY-SEVEN. The spec's own task briefs name eighteen, and the
 * frontend's union carried nineteen until this file was written — so a
 * designer built from the prose would have refused eight kinds the server
 * accepts (`multi_user`, `time`, `email`, `phone`, `url`, `multi_link`,
 * `multi_user_status`, `multi_user_ack`) while believing it was being strict.
 *
 * ── what the SERVER validates, and what it does not ─────────────────────────
 * handlers.eoValidateFieldShape checks five things: `key` and `label` are
 * non-empty, `kind` is one of the 27, `provenance` and `required_mode` are
 * allow-listed values, and a `derived` field has a formula. IT NEVER LOOKS AT
 * `config`. So each of these stores happily and breaks later:
 *
 *  - a `dropdown` with no options — a select with nothing to select;
 *  - a `conditional` requiredness with no `required_rule` — which is not a
 *    quiet failure but a LOUD one at the wrong moment:
 *    services.ValidateRecordValues returns `field %q is conditional but has
 *    no required_rule` on the next attempt to save ANY record of the type;
 *  - an `at_state` requiredness with no states — the opposite failure, and
 *    worse for being silent: the switch in ValidateRecordValues finds no
 *    matching id and the field is simply never required, anywhere, so the
 *    rule an administrator thought they wrote does not exist.
 *
 * Refusing these in the form is therefore not duplicated server validation.
 * It is the only validation there is.
 */

/** models.EOFieldKinds, in the order of the Go constant block. */
export const EO_FIELD_KINDS: EoFieldKind[] = [
  "auto_number",
  "text",
  "long_text",
  "dropdown",
  "multi_select",
  "number",
  "percent",
  "yes_no",
  "date",
  "date_time",
  "time",
  "file",
  "multi_file",
  "user",
  "multi_user",
  "user_date",
  "org_unit",
  "multi_org_unit",
  "external_body",
  "email",
  "phone",
  "url",
  "link",
  "multi_link",
  "workflow_state",
  "multi_user_status",
  "multi_user_ack",
];

const KIND_SET = new Set<string>(EO_FIELD_KINDS);

export const isEoFieldKind = (kind: string): kind is EoFieldKind =>
  KIND_SET.has(kind);

/**
 * The structured configuration a kind carries, which is what the editor
 * renders a section for.
 *
 * It is deliberately short, and it is short because the RECORD FORM is the
 * thing that decides whether configuration is real: `options` and
 * `target_type_key` are the only two keys anything in this application reads
 * (EoFieldInput.tsx:169 and :477, EoFieldValue.tsx:167). Offering an
 * administrator a "minimum", a "maximum" or a "pattern" box would be
 * configuration that stores and is then ignored by every form that renders
 * the field — a worse lie than no box at all. The free-form JSON section of
 * the editor stays open for anything a future renderer adds.
 */
export type EoKindConfigShape = "options" | "target" | "none";

export const eoKindConfigShape = (kind: string): EoKindConfigShape => {
  switch (kind) {
    case "dropdown":
    case "multi_select":
      return "options";
    case "link":
    case "multi_link":
      return "target";
    default:
      return "none";
  }
};

/**
 * The kinds `EoFieldInput` has a `case` for. Everything else falls through its
 * `default:` arm and is rendered as a PLAIN `<input type="text">`
 * (components/eo/EoFieldInput.tsx:483-493).
 *
 * `text` is in the list because it has a case of its own; the point of the
 * set is which kinds the switch NAMES.
 */
const EO_INPUT_KINDS = new Set<string>([
  "text",
  "long_text",
  "number",
  "percent",
  "yes_no",
  "date",
  "date_time",
  "dropdown",
  "multi_select",
  "user",
  "org_unit",
  "multi_org_unit",
  "external_body",
  "file",
  "multi_file",
  "link",
]);

/**
 * Whether a field will be shown to a person as a bare text box because
 * nothing has been built to render its kind.
 *
 * THE SIGNAL IS THE FIELD, NOT THE KIND, and the first version of this got
 * that wrong. It carried `user_date` in a list of "read-only kinds: never an
 * input" — but `isReadOnlyField` forces read-only for `auto_number`,
 * `workflow_state`, `auto`/`derived` provenance and the engine-owned keys,
 * and NOT for `user_date`. So the pilot's own `eo_task.verified_by` —
 * `user_date`, provenance `user`, spec §7.3's approval/signature primitive —
 * reaches `EoFieldInput`, finds no case, and renders as free text, while the
 * designer said "this kind needs no further configuration". The verifying
 * officer types "Ahmed 12/3" where a {user, date} pair is expected.
 *
 * A read-only field never reaches `EoFieldInput` at all; `EoFieldValue`
 * prints it, and it has a `user_date` case. So the question is asked in two
 * steps, in the order the record form asks them.
 */
export const eoFieldRendersAsPlainText = (field: {
  kind: string;
  provenance?: string;
  key?: string;
}): boolean => {
  if (!field.kind) return false;
  if (
    isReadOnlyField({
      kind: field.kind as EoFieldKind,
      provenance: (field.provenance ?? "user") as EoProvenance,
      key: field.key ?? "",
    })
  )
    return false;
  return !EO_INPUT_KINDS.has(field.kind);
};

/** The four values handlers.eoValidateFieldShape allow-lists for provenance. */
export const EO_PROVENANCES = ["user", "auto", "derived", "system"] as const;

/** The four values it allow-lists for required_mode. */
export const EO_REQUIRED_MODES = [
  "never",
  "always",
  "conditional",
  "at_state",
] as const;

// ──────────────────────────────────────────────────
// The draft the editor edits
// ──────────────────────────────────────────────────

/**
 * The editor's form state. It is the request shape with the three jsonb
 * columns held as TEXT while they are being typed, because a half-typed JSON
 * object is not a JSON object and the form must be able to show it back to
 * the person typing it rather than discard their keystrokes.
 */
export interface EoFieldDraft {
  key: string;
  label: string;
  label_ar: string;
  kind: EoFieldKind | "";
  /** Structured, for dropdown / multi_select. */
  options: { value: string; label: string; label_ar: string }[];
  /**
   * Where a dropdown's choices come from. Spec §7.3 allows a static list OR
   * one of five option SOURCES, and the pilot uses one: Decision Record's
   * `keywords` ships
   * `{"option_source":"lookup_category","lookup_category_code":"eo_subject_taxonomy"}`
   * because the client's subject taxonomy exists in no document here and the
   * options of a seeded dropdown are what every record is filed under
   * (seed_eo_pilot.go:2245-2258).
   *
   * It is a MODE and not two independently editable keys because declaring
   * both is itself a defect — `seed_eo_pilot_test.go:1852`, "which one
   * governs is then whatever the client reads first" — so the structured
   * editor can only ever write one of them.
   */
  option_mode: "list" | "source";
  option_source: string;
  lookup_category_code: string;
  /** Structured, for link / multi_link. "" means "any record type". */
  target_type_key: string;
  /**
   * Everything else in `config`, as typed JSON. The structured keys above are
   * stripped out of it on load and merged back in on save, so a config key
   * this editor does not model survives a round trip instead of being
   * destroyed — which it would be, because applyTo overwrites the column
   * whenever the request's config is non-empty, and `{}` is non-empty.
   */
  config_rest: string;
  provenance: string;
  required_mode: string;
  required_rule: string;
  required_at_state_ids: string[];
  formula: string;
  recompute_on: string;
  is_indexed: boolean;
  is_locked_after_state_id: string;
  sort_order: number;
  help_text: string;
  help_text_ar: string;
}

export const emptyEoFieldDraft = (sortOrder: number): EoFieldDraft => ({
  key: "",
  label: "",
  label_ar: "",
  kind: "",
  options: [],
  option_mode: "list",
  option_source: "",
  lookup_category_code: "",
  target_type_key: "",
  config_rest: "",
  provenance: "user",
  required_mode: "never",
  required_rule: "",
  required_at_state_ids: [],
  formula: "",
  recompute_on: "",
  is_indexed: false,
  is_locked_after_state_id: "",
  sort_order: sortOrder,
  help_text: "",
  help_text_ar: "",
});

const asOptionList = (
  raw: unknown,
): { value: string; label: string; label_ar: string }[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => {
    const rec = (o ?? {}) as Record<string, unknown>;
    return {
      value:
        typeof rec.value === "string" ? rec.value : String(rec.value ?? ""),
      label: typeof rec.label === "string" ? rec.label : "",
      label_ar: typeof rec.label_ar === "string" ? rec.label_ar : "",
    };
  });
};

/** A stored definition, as a draft. */
export const eoFieldDraftFrom = (field: {
  key: string;
  label: string;
  label_ar?: string;
  kind: EoFieldKind;
  config?: EoFieldConfig;
  provenance?: string;
  required_mode?: string;
  required_rule?: string;
  required_at_state_ids?: string[] | null;
  formula?: string;
  recompute_on?: unknown[] | null;
  is_indexed?: boolean;
  is_locked_after_state_id?: string | null;
  sort_order: number;
  help_text?: string;
  help_text_ar?: string;
}): EoFieldDraft => {
  const config = { ...(field.config ?? {}) } as Record<string, unknown>;
  const shape = eoKindConfigShape(field.kind);
  const options = shape === "options" ? asOptionList(config.options) : [];
  const source =
    shape === "options" && typeof config.option_source === "string"
      ? config.option_source
      : "";
  const lookupCode =
    shape === "options" && typeof config.lookup_category_code === "string"
      ? config.lookup_category_code
      : "";
  const target =
    shape === "target" && typeof config.target_type_key === "string"
      ? config.target_type_key
      : "";
  // Strip only the keys this kind's structured editor owns. A
  // `target_type_key` left on a dropdown stays visible in the JSON section
  // rather than being silently dropped on save.
  if (shape === "options") {
    delete config.options;
    delete config.option_source;
    delete config.lookup_category_code;
  }
  if (shape === "target") delete config.target_type_key;

  const recompute = field.recompute_on;
  return {
    key: field.key,
    label: field.label,
    label_ar: field.label_ar ?? "",
    kind: field.kind,
    options,
    // A stored option_source is what the field IS; opening it in list mode
    // would show an empty option table and then refuse to save a field that
    // is correctly configured.
    option_mode: source ? "source" : "list",
    option_source: source,
    lookup_category_code: lookupCode,
    target_type_key: target,
    config_rest:
      Object.keys(config).length > 0 ? JSON.stringify(config, null, 2) : "",
    provenance: field.provenance || "user",
    required_mode: field.required_mode || "never",
    required_rule: field.required_rule ?? "",
    required_at_state_ids: Array.isArray(field.required_at_state_ids)
      ? field.required_at_state_ids
      : [],
    formula: field.formula ?? "",
    recompute_on:
      Array.isArray(recompute) && recompute.length > 0
        ? JSON.stringify(recompute, null, 2)
        : "",
    is_indexed: !!field.is_indexed,
    is_locked_after_state_id: field.is_locked_after_state_id ?? "",
    sort_order: field.sort_order,
    help_text: field.help_text ?? "",
    help_text_ar: field.help_text_ar ?? "",
  };
};

// ──────────────────────────────────────────────────
// Parsing the two free-form sections
// ──────────────────────────────────────────────────

type Parsed<T> = { ok: true; value: T } | { ok: false };

const parseJsonObject = (text: string): Parsed<Record<string, unknown>> => {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    const value = JSON.parse(trimmed);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { ok: false };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
};

const parseJsonArray = (text: string): Parsed<unknown[]> => {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: [] };
  try {
    const value = JSON.parse(trimmed);
    if (!Array.isArray(value)) return { ok: false };
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
};

/**
 * The draft's `config`, as it will be sent: the free-form section with
 * whichever structured key the current mode owns written over it.
 *
 * WHAT VALIDATION CAN AND CANNOT SEE THROUGH IT, stated precisely, because
 * the first version of this file claimed more than it did. A key the
 * structured editor OWNS in the current mode is written here unconditionally,
 * so an `options` array typed into the raw box while the editor is in list
 * mode is discarded and the per-option checks only ever see structured rows.
 * What the merged object DOES carry from the raw box is every key the current
 * mode does not own — `option_source` while in list mode, `options` while in
 * source mode, `target_type_key` on a link — and those are exactly the keys
 * the checks below cannot otherwise reach. A key the editor owns is checked
 * because it is written here; a key it does not own is checked because it
 * survives from the raw box.
 */
export const eoDraftConfig = (draft: EoFieldDraft): EoFieldConfig | null => {
  const rest = parseJsonObject(draft.config_rest);
  if (!rest.ok) return null;
  const out: Record<string, unknown> = { ...rest.value };
  switch (eoKindConfigShape(draft.kind)) {
    case "options":
      // ONE MODE WRITES ONE KEY, and neither deletes the other's. Deleting
      // would make "both a list and a source" unreachable from this form, and
      // it is reachable: the raw box can carry the key the mode does not own.
      // That state is a defect the backend's own seed test names
      // (seed_eo_pilot_test.go:1852), so it has to be refusable rather than
      // quietly cleaned up.
      if (draft.option_mode === "source") {
        if (draft.option_source.trim())
          out.option_source = draft.option_source.trim();
        if (draft.lookup_category_code.trim())
          out.lookup_category_code = draft.lookup_category_code.trim();
      } else {
        out.options = draft.options.map((o) => ({
          value: o.value.trim(),
          label: o.label.trim(),
          ...(o.label_ar.trim() ? { label_ar: o.label_ar.trim() } : {}),
        }));
      }
      break;
    case "target":
      // The picker owns the key when it HAS one. When it is on "any record
      // type" the key is left exactly as the JSON section has it — which,
      // because the key is stripped out of that section on load, means
      // "whatever the operator typed there".
      //
      // THIS USED TO `delete` IT, and deleting made the target check below
      // unreachable: the structured picker only ever offers real type keys,
      // so the one input that could produce a bad target was being discarded
      // one line before the check that was written to catch it. Caught in the
      // browser — the save went through with target_type_key "eo_nope" — and
      // it is this programme's signature defect exactly: a guard correctly
      // reasoned about and then wired to a signal that cannot carry it.
      if (draft.target_type_key.trim()) {
        out.target_type_key = draft.target_type_key.trim();
      }
      break;
    default:
      break;
  }
  return out as EoFieldConfig;
};

// ──────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────

export interface EoFieldValidationContext {
  /** Keys this type already declares itself, excluding the one being edited. */
  siblingKeys: string[];
  /** Record types, for `target_type_key`. */
  types: EoRecordType[];
  /** Whether the workflow's states could be listed at all. */
  statesAvailable: boolean;
  /** Translator for the client-side messages, so Arabic gets Arabic. */
  // eslint-disable-next-line no-unused-vars
  t: (key: string, fallback: string) => string;
}

/**
 * Everything wrong with a draft, keyed so each message lands on its control.
 *
 * It COLLECTS rather than returning at the first problem, and the per-kind
 * checks sit outside the shape checks rather than after an early return: a
 * dropdown with no options and no label must report both, or fixing the label
 * reveals the options problem one submit later.
 *
 * The keys `key`, `label`, `kind`, `provenance`, `required_mode` and `formula`
 * are the ones handlers.eoValidateFieldShape also answers with, so a client
 * message and a server message for the same attribute land in the same place.
 * `config_options`, `config_target`, `config_rest`, `required_rule`,
 * `required_at_state_ids` and `recompute_on` are this form's own: the server
 * has no opinion on any of them, which is why they are here.
 */
export const validateEoFieldDraft = (
  draft: EoFieldDraft,
  ctx: EoFieldValidationContext,
): Record<string, string> => {
  const { t } = ctx;
  const errs: Record<string, string> = {};

  const key = draft.key.trim();
  if (!key) {
    errs.key = t("eo.types.field.errors.keyRequired", "Key is required");
  } else if (ctx.siblingKeys.includes(key)) {
    // handlers.CreateField refuses this too; saying it first names the type
    // rather than the row.
    errs.key = t(
      "eo.types.field.errors.keyExists",
      "This type already declares a field with that key",
    );
  }

  if (!draft.label.trim()) {
    errs.label = t("eo.types.field.errors.labelRequired", "Label is required");
  }

  if (!draft.kind) {
    errs.kind = t("eo.types.field.errors.kindRequired", "Kind is required");
  } else if (!isEoFieldKind(draft.kind)) {
    errs.kind = t("eo.types.field.errors.kindInvalid", "Unknown field kind");
  }

  // ── the configuration each kind needs ──────────────────────────────────
  const config = eoDraftConfig(draft);
  if (config === null) {
    errs.config_rest = t(
      "eo.types.field.errors.configJson",
      "Configuration must be a JSON object, for example {}",
    );
  } else {
    switch (eoKindConfigShape(draft.kind)) {
      case "options": {
        const options = Array.isArray(config.options) ? config.options : [];
        const source =
          typeof config.option_source === "string"
            ? config.option_source.trim()
            : "";
        // ── a static list OR an option source, never neither and never both
        //
        // SPEC §7.3 ALLOWS SIX: a static list, or one of five sources
        // (LookupCategory values, org units, users by role, workflow states,
        // a query over records of a type). The pilot uses one of them —
        // Decision Record's `keywords` is seeded with
        // `option_source: lookup_category` because the client's subject
        // taxonomy exists in no document here (seed_eo_pilot.go:2245-2258).
        //
        // Demanding `options` outright refused that field OUTRIGHT: saving it
        // with nothing changed was refused client-side, so no label, Arabic
        // label or help-text edit could be made to it at all, and the only
        // way through the form was to invent the client's taxonomy as a
        // static list — producing the both-at-once state immediately below,
        // which the backend's own seed test calls a defect. The same
        // reasoning that keeps a `link` with no target saveable applies here
        // and was not applied; this is that correction.
        //
        // The three rules are the seed test's three
        // (seed_eo_pilot_test.go:1849-1856).
        if (options.length === 0 && !source) {
          errs.config_options = t(
            "eo.types.field.errors.optionsRequired",
            "A dropdown needs either at least one option or an option source — with neither, nothing can be chosen",
          );
          break;
        }
        if (options.length > 0 && source) {
          errs.config_options = t(
            "eo.types.field.errors.optionsAndSource",
            "This field declares both a static option list and an option source. Which one governs is then whatever reads it first — keep one.",
          );
          break;
        }
        if (source) {
          // The only source whose resolution this repository spells out. The
          // other four of §7.3's five have no agreed spelling yet, so they
          // are accepted as written rather than refused against a list this
          // file would have invented.
          if (
            source === "lookup_category" &&
            !(typeof config.lookup_category_code === "string"
              ? config.lookup_category_code.trim()
              : "")
          ) {
            errs.config_options = t(
              "eo.types.field.errors.lookupCodeRequired",
              "A lookup-category source needs the category code that names the list, or nothing can resolve the options",
            );
          }
          break;
        }
        const seen = new Set<string>();
        for (let i = 0; i < options.length; i += 1) {
          const opt = (options[i] ?? {}) as unknown as Record<string, unknown>;
          const value = typeof opt.value === "string" ? opt.value.trim() : "";
          const label = typeof opt.label === "string" ? opt.label.trim() : "";
          if (!value) {
            errs.config_options = t(
              "eo.types.field.errors.optionValueRequired",
              "Every option needs a stored value",
            );
            break;
          }
          if (!label) {
            errs.config_options = t(
              "eo.types.field.errors.optionLabelRequired",
              "Every option needs a label to show",
            );
            break;
          }
          if (seen.has(value)) {
            errs.config_options = t(
              "eo.types.field.errors.optionValueDuplicate",
              "Two options store the same value",
            );
            break;
          }
          seen.add(value);
        }
        break;
      }
      case "target": {
        const target = config.target_type_key;
        if (target !== undefined) {
          const key = typeof target === "string" ? target.trim() : "";
          const named = ctx.types.find((x) => x.key === key);
          if (!key) {
            errs.config_target = t(
              "eo.types.field.errors.targetInvalid",
              "The target record type must be a record type key, or left as any type",
            );
          } else if (!named) {
            errs.config_target = t(
              "eo.types.field.errors.targetUnknown",
              "No record type has that key",
            );
          } else if (named.is_abstract) {
            // An abstract type holds no records OF ITS OWN — the save
            // pipeline refuses to create one — so EoRecordPicker filtering on
            // it returns an empty register on every record form. The picker
            // offers concrete types only, so this is reachable solely through
            // the raw configuration box; before this check an abstract key
            // fell in the gap between "offered" and "unknown", passed
            // validation, and went out on the wire while the picker read
            // "Any record type".
            errs.config_target = t(
              "eo.types.field.errors.targetAbstract",
              "An abstract record type holds no records of its own, so a link to it can never find anything to point at",
            );
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // ── requiredness ───────────────────────────────────────────────────────
  if (draft.required_mode === "conditional" && !draft.required_rule.trim()) {
    errs.required_rule = t(
      "eo.types.field.errors.ruleRequired",
      "A conditional field needs a rule. Without one, every attempt to save a record of this type is refused.",
    );
  }
  if (
    draft.required_mode === "at_state" &&
    draft.required_at_state_ids.length === 0
  ) {
    errs.required_at_state_ids = ctx.statesAvailable
      ? t(
          "eo.types.field.errors.statesRequired",
          "Choose the states this field is required at. With none chosen it is never required anywhere.",
        )
      : t(
          "eo.types.field.errors.statesUnavailable",
          "This record type's workflow states could not be read, so a state-based requirement cannot be configured here.",
        );
  }

  // ── provenance ─────────────────────────────────────────────────────────
  if (draft.provenance === "derived" && !draft.formula.trim()) {
    // handlers.eoValidateFieldShape refuses this as well; refusing first
    // keeps the message beside the formula box rather than in a toast.
    errs.formula = t(
      "eo.types.field.errors.formulaRequired",
      "A derived field needs a formula — without one it computes nothing",
    );
  }
  if (parseJsonArray(draft.recompute_on).ok === false) {
    errs.recompute_on = t(
      "eo.types.field.errors.recomputeJson",
      "Recompute-on must be a JSON array, for example []",
    );
  }

  return errs;
};

/**
 * Problems that are NOT refusals: configuration that stores, is accepted by
 * the server and still will not do what it looks like it does. They are shown
 * beside the control and the save goes through, because each of them is a
 * judgement about the rest of the system rather than about this field.
 */
export const eoFieldDraftWarnings = (
  draft: EoFieldDraft,
  // eslint-disable-next-line no-unused-vars
  t: (key: string, fallback: string) => string,
): string[] => {
  const out: string[] = [];
  if (
    draft.kind &&
    isEoFieldKind(draft.kind) &&
    eoFieldRendersAsPlainText({
      kind: draft.kind,
      provenance: draft.provenance,
      key: draft.key.trim(),
    })
  )
    out.push(
      t(
        "eo.types.field.warnings.noRenderer",
        "No form control has been built for this kind yet: record forms will show it as a plain text box.",
      ),
    );
  if (draft.provenance === "derived" && !draft.recompute_on.trim())
    out.push(
      t(
        "eo.types.field.warnings.noRecomputeOn",
        "A derived field with no recompute-on dependencies can only use values on the record itself; a formula naming a child or an ancestor will not resolve.",
      ),
    );
  return out;
};

/** The draft as the request body, or null when its JSON sections do not parse. */
export const eoFieldDraftToRequest = (
  draft: EoFieldDraft,
): EoFieldDefRequest | null => {
  const config = eoDraftConfig(draft);
  const recompute = parseJsonArray(draft.recompute_on);
  if (config === null || !recompute.ok) return null;
  return {
    key: draft.key.trim(),
    label: draft.label.trim(),
    label_ar: draft.label_ar.trim(),
    kind: draft.kind,
    // ALWAYS SENT, even when empty. applyTo only overwrites on a non-empty
    // value, so an omitted config would leave a stale one in place and an
    // administrator who deleted every option would be told it saved while
    // the old options stayed on the record forms.
    config,
    provenance: (draft.provenance || "user") as EoFieldDefRequest["provenance"],
    required_mode: (draft.required_mode ||
      "never") as EoFieldDefRequest["required_mode"],
    // The rule and the states are cleared when the mode does not use them, so
    // switching a field from conditional to always does not leave a rule
    // behind for the next person to read as live.
    required_rule:
      draft.required_mode === "conditional" ? draft.required_rule.trim() : "",
    required_at_state_ids:
      draft.required_mode === "at_state" ? draft.required_at_state_ids : [],
    // THE SAME CLEARING, for the same reason. A field flipped off `derived`
    // keeps no formula and no dependencies: services.RecomputeDerived only
    // looks at derived fields, so a formula left behind runs on nothing while
    // reading, to the next person to open the field, as live configuration.
    formula: draft.provenance === "derived" ? draft.formula.trim() : "",
    recompute_on: draft.provenance === "derived" ? recompute.value : [],
    is_indexed: draft.is_indexed,
    is_locked_after_state_id: draft.is_locked_after_state_id || null,
    sort_order: Number.isFinite(draft.sort_order) ? draft.sort_order : 0,
    help_text: draft.help_text.trim(),
    help_text_ar: draft.help_text_ar.trim(),
  };
};
