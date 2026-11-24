import type { TFunction, i18n as I18n } from "i18next";
import type { EoServerRefusal } from "./eoFields";

/**
 * The §7.14 refusal in the reader's language.
 *
 * The server composes its sentence in English and also sends the same refusal
 * as DATA: `message_key` + `message_args` for the first clause, and
 * `message_detail_key` + `message_detail_args` for an optional second one (a
 * confirmation that does not match, or several changes at once). This renders
 * that data through i18next.
 *
 * THE ENGLISH SENTENCE IS THE FALLBACK AND THE FUNCTION NEVER THROWS OR
 * RETURNS "". Any key this client has no wording for, any argument that did
 * not arrive, any detail it cannot localise: the whole result is `null` and
 * the caller shows the server's sentence. A half-translated banner (an Arabic
 * first clause and an English second) would be worse than either.
 */

const PREFIX = "eo_destructive_";

/** The ten change identifiers of models.EODestructiveChanges. */
const CHANGES = [
  "workflow",
  "parent_type",
  "key",
  "abstract",
  "reference_prefix",
  "reference_pattern",
  "reference_mode",
  "field_removed",
  "field_kind",
  "field_required",
];

/** The base keys and the arguments each interpolates. */
const BASE_ARGS: Record<string, string[]> = {
  workflow: ["from", "to"],
  parent_type: ["from", "to"],
  key: ["from", "to"],
  key_abstract: ["from", "to"],
  abstract: ["type"],
  reference_prefix: ["from", "to"],
  reference_pattern: ["from", "to"],
  reference_mode: ["from", "to"],
  field_removed: ["field"],
  field_kind: ["field", "from", "to"],
  field_required: ["field"],
};

/** Keys whose empty `from`/`to` means "unset", worded here as "none". */
const OPTIONAL_ID_KEYS = new Set(["workflow", "parent_type"]);

/** Whether a `message_key` is one of the §7.14 refusals'. */
export function isEoDestructiveKey(key: string | undefined): boolean {
  return (
    !!key && key.startsWith(PREFIX) && key.slice(PREFIX.length) in BASE_ARGS
  );
}

// First-strong isolates, so a Latin key or UUID inside an Arabic sentence does
// not reorder the punctuation around it.
const iso = (value: string) => `⁨${value}⁩`;

const REFERENCE_MODES = new Set(["own", "parent"]);

export function eoRefusalText(
  refusal: EoServerRefusal,
  t: TFunction,
  i18n: I18n,
): string | null {
  try {
    return render(refusal, t, i18n);
  } catch {
    return null;
  }
}

function render(
  refusal: EoServerRefusal,
  t: TFunction,
  i18n: I18n,
): string | null {
  const { key, args } = refusal;
  if (!key || !isEoDestructiveKey(key) || !args) return null;
  const has = (k: string) => i18n.exists(k) || i18n.exists(`${k}_other`);
  const id = key.slice(PREFIX.length);
  const baseKey = `eo.types.refusal.base.${id}`;
  if (!has(baseKey)) return null;

  const values: Record<string, string> = {};
  for (const name of BASE_ARGS[id]) {
    const v = args[name];
    if (typeof v !== "string") return null;
    if (v === "" && OPTIONAL_ID_KEYS.has(id)) {
      values[name] = t("eo.types.refusal.none", "none");
    } else if (
      id === "reference_mode" &&
      REFERENCE_MODES.has(v) &&
      has(`eo.types.referenceMode.${v}`)
    ) {
      values[name] = iso(t(`eo.types.referenceMode.${v}`));
    } else if (id === "field_kind" && name !== "field" && has(`eo.kind.${v}`)) {
      // The designer's own kind labels (all 27 are translated). A kind with
      // no label falls through to the raw identifier.
      values[name] = t(`eo.kind.${v}`) as string;
    } else {
      values[name] = iso(v);
    }
  }
  const base = t(baseKey, values) as string;
  if (!base.trim()) return null;

  if (!refusal.detailKey) return base;
  const detail = renderDetail(refusal, t, has);
  if (!detail) return null;
  return `${base}. ${detail}`;
}

function renderDetail(
  refusal: EoServerRefusal,
  t: TFunction,
  has: (k: string) => boolean,
): string | null {
  const dk = refusal.detailKey ?? "";
  const da = refusal.detailArgs;
  if (!dk.startsWith(PREFIX) || !da) return null;
  const detailKey = (name: string) => `eo.types.refusal.detail.${name}`;
  const str = (name: string): string | null =>
    typeof da[name] === "string" ? da[name] : null;
  const changeName = (raw: string | null): string | null => {
    if (raw === null || !CHANGES.includes(raw)) return null;
    const k = `eo.types.refusal.change.${raw}`;
    return has(k) ? (t(k) as string) : null;
  };
  // "" is the record type itself, not a field that has no name.
  const target = (raw: string | null): string | null => {
    if (raw === null) return null;
    return raw === ""
      ? (t("eo.types.refusal.target.type") as string)
      : (t("eo.types.refusal.target.field", { field: iso(raw) }) as string);
  };

  let name: string;
  let values: Record<string, unknown>;
  switch (dk.slice(PREFIX.length)) {
    case "confirmation_wrong_type": {
      const confirmed = str("confirmed_type");
      const edit = str("edit_type");
      if (confirmed === null || edit === null) return null;
      name = "wrong_type";
      values = { confirmed: iso(confirmed), edit: iso(edit) };
      break;
    }
    case "confirmation_wrong_field": {
      const confirmed = target(str("confirmed_field"));
      const edit = target(str("edit_field"));
      if (confirmed === null || edit === null) return null;
      name = "wrong_field";
      values = { confirmed, edit };
      break;
    }
    case "confirmation_wrong_change": {
      const confirmed = changeName(str("confirmed_change"));
      const edit = changeName(str("edit_change"));
      if (confirmed === null || edit === null) return null;
      name = "wrong_change";
      values = { confirmed, edit };
      break;
    }
    case "multiple": {
      const rawCount = str("count");
      const rawChanges = str("changes");
      const count = Number(rawCount);
      if (
        rawCount === null ||
        rawChanges === null ||
        !Number.isInteger(count)
      ) {
        return null;
      }
      const names = rawChanges.split(",").map((s) => changeName(s.trim()));
      if (names.length === 0 || names.some((n) => n === null)) return null;
      name = "multiple";
      values = {
        count,
        changes: names.join(
          t("eo.types.refusal.listSeparator", ", ") as string,
        ),
      };
      break;
    }
    default:
      return null;
  }
  if (!has(detailKey(name))) return null;
  const out = t(detailKey(name), values) as string;
  return out.trim() ? out : null;
}
