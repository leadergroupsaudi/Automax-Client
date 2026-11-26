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

/** One way a record may take a new child: the link type, and the type it creates. */
export interface EoChildLinkOption {
  linkType: EoLinkType;
  /** The child record type this link type creates. Never "any". */
  childTypeId: string;
}

/**
 * The link types under which a record of `parentTypeId` may take a NEW child.
 *
 * DIRECTION IS THE WHOLE POINT, and it is not symmetric the way
 * `eoLinkTouchesType` is. A parent link type reads one way only:
 * `target_type_ids` names the PARENT types it accepts, `source_type_ids` names
 * the single CHILD type it creates. `eo_execution_plan_parent` has
 * source=[execution_plan], target=[directive] — offered on a Directive, never
 * on an Execution Plan. Asking `eoLinkTouchesType` here would offer every link
 * type on both of its ends and invite creates the server then refuses.
 *
 * An "any" TARGET is the universal parent — `eo_task_parent` hangs a Task off
 * anything — so it is offered on every record. An "any" SOURCE is skipped: the
 * create form must know which type it is building and "any" names none. A
 * source list with several ids is skipped for the same reason; nothing in the
 * pilot has one, and guessing which of them the user meant is not this
 * function's call to make.
 */
export function eoChildLinkOptions(
  linkTypes: EoLinkType[] | undefined,
  parentTypeId: string | undefined,
): EoChildLinkOption[] {
  if (!linkTypes || !parentTypeId) return [];
  const out: EoChildLinkOption[] = [];
  for (const lt of linkTypes) {
    const target = eoLinkEndpoints(lt.target_type_ids);
    if (!target.any && !target.ids.includes(parentTypeId)) continue;
    const source = eoLinkEndpoints(lt.source_type_ids);
    if (source.ids.length !== 1) continue;
    out.push({ linkType: lt, childTypeId: source.ids[0] });
  }
  return out;
}
