import type { EoLinkType, EoLinkTypeRequest } from "../types/eoRecord";

/** The literal a link type's endpoint list uses for "a record of any type". */
export const EO_ANY_TYPE = "any";

export interface EoLinkEndpoints {
  /** True when the list permits every type. */
  any: boolean;
  /** The named type ids (never contains "any"). */
  ids: string[];
}

/**
 * One reader for a link type's source/target list, mirroring
 * services.eoTypeAllowed: the bare string "any", an array that may contain
 * "any", or nothing — and nothing permits nothing.
 */
export function eoLinkEndpoints(raw: unknown): EoLinkEndpoints {
  if (typeof raw === "string") {
    return raw === EO_ANY_TYPE
      ? { any: true, ids: [] }
      : { any: false, ids: raw ? [raw] : [] };
  }
  if (!Array.isArray(raw)) return { any: false, ids: [] };
  const strings = raw.filter((x): x is string => typeof x === "string");
  return {
    any: strings.includes(EO_ANY_TYPE),
    ids: strings.filter((x) => x !== EO_ANY_TYPE),
  };
}

/** Whether a type is on one end of the link type (an "any" end counts). */
export function eoLinkTouchesType(lt: EoLinkType, typeId: string): boolean {
  return [lt.source_type_ids, lt.target_type_ids].some((raw) => {
    const e = eoLinkEndpoints(raw);
    return e.any || e.ids.includes(typeId);
  });
}

export function emptyEoLinkTypeRequest(typeId: string): EoLinkTypeRequest {
  return {
    key: "",
    label: "",
    label_ar: "",
    source_type_ids: [typeId],
    target_type_ids: [],
    cardinality: "one",
    derive_deadline_from_parent: false,
    deadline_offset_days: 0,
    blocks_parent_closure: false,
    blocks_parent_transition_key: "",
    cascade_sensitivity: false,
  };
}

export function eoLinkTypeRequestFrom(lt: EoLinkType): EoLinkTypeRequest {
  const list = (raw: unknown): string[] => {
    const e = eoLinkEndpoints(raw);
    return e.any ? [EO_ANY_TYPE, ...e.ids] : e.ids;
  };
  return {
    key: lt.key,
    label: lt.label,
    label_ar: lt.label_ar ?? "",
    source_type_ids: list(lt.source_type_ids),
    target_type_ids: list(lt.target_type_ids),
    cardinality: lt.cardinality || "one",
    derive_deadline_from_parent: !!lt.derive_deadline_from_parent,
    deadline_offset_days: lt.deadline_offset_days ?? 0,
    blocks_parent_closure: !!lt.blocks_parent_closure,
    blocks_parent_transition_key: lt.blocks_parent_transition_key ?? "",
    cascade_sensitivity: !!lt.cascade_sensitivity,
  };
}
