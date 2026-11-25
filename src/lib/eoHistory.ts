import type { EoRecordHistoryEntry } from "../types/eoRecord";

/**
 * How one audit row reads. Pure: no React, no network, no browser — so the
 * decisions a history row turns on are pinned in
 * `e2e/eo-history-contract.spec.ts` directly, the way lib/eoBlocking.ts is.
 *
 * It exists because three of those decisions cannot be driven against the
 * seeded register: every seeded row names a real person, none is a system
 * action, and no record has an empty trail. The branches are still reachable
 * in production — a purged user, an escalation sweep, a record created a
 * moment ago — and each of them, got wrong, shows the officer a blank gap
 * where an audit trail should be.
 */

/** Trimmed text, or "" for anything that is not a non-empty string. */
const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * Who acted, and whether the system acted rather than a person.
 *
 * `name` is non-empty ONLY for `person`. The other three kinds carry no name
 * because there is none to carry — the client supplies the wording, in the
 * reader's own language, which an English literal from the server could not.
 *
 * `automatic` is `is_system_action` and is SEPARATE from the kind, because a
 * row can be both: an action that failed during someone's transition is
 * journalled with `is_system_action: true` AND that person's id (see
 * eoActionExecutor.recordActionFailure). Naming them is right — they made the
 * move — and so is saying the entry was written automatically.
 */
export interface EoHistoryActor {
  kind: "person" | "system" | "removed" | "unknown";
  /** The resolved display name; "" unless kind is "person". */
  name: string;
  /** The row was written by the system, whoever's move provoked it. */
  automatic: boolean;
}

export function eoHistoryActor(
  row: Partial<EoRecordHistoryEntry> | null | undefined,
): EoHistoryActor {
  const automatic = row?.is_system_action === true;
  const name = text(row?.performed_by_name);
  // A RESOLVED NAME IS NEVER DISCARDED, even on a system row: the server only
  // resolves one when there is a person behind the id.
  if (name) return { kind: "person", name, automatic };
  if (automatic) return { kind: "system", name: "", automatic };
  // An id that resolved to nobody: the user row was purged. (A soft-deleted
  // one still resolves, so this really is "gone".)
  if (text(row?.performed_by_id))
    return { kind: "removed", name: "", automatic };
  // Neither a person, nor an id, nor the system flag. Nothing is invented.
  return { kind: "unknown", name: "", automatic };
}

/** One end of a move: the id the row carries and the name the server resolved. */
export interface EoHistoryState {
  id: string;
  /** "" when the state could not be named; the caller prints its own dash. */
  name: string;
}

/**
 * What the row did to the record's state.
 *
 *  - `created` — `from_state_id` is null and there is a to-state. An ORIGIN,
 *    not a broken arrow, and never rendered as "— → Received".
 *  - `moved` — both ends present: the ordinary transition.
 *  - `left` — a from-state and no to-state. The server does not write this
 *    today; it is here so that one would render as a move away from a state
 *    rather than silently as a note.
 *  - `noted` — neither end: a values-only edit, or an action note.
 */
export type EoHistoryStep =
  | { kind: "created"; to: EoHistoryState }
  | { kind: "moved"; from: EoHistoryState; to: EoHistoryState }
  | { kind: "left"; from: EoHistoryState }
  | { kind: "noted" };

/**
 * The state name in the reader's language.
 *
 * `name_ar` where the locale is Arabic, falling back to the primary name when
 * it is empty — in the pilot seed every `name_ar` equals the English name
 * (the states are flagged `eo_client_unconfirmed`, awaiting sign-off), so an
 * Arabic trail correctly shows English state names today.
 */
export function eoHistoryStateName(
  row: Partial<EoRecordHistoryEntry> | null | undefined,
  end: "from" | "to",
  lang: string | undefined,
): string {
  const primary = text(row?.[`${end}_state_name`]);
  if (!isArabic(lang)) return primary;
  return text(row?.[`${end}_state_name_ar`]) || primary;
}

/** "ar", "ar-SA", "AR" — all Arabic; anything else is not. */
export const isArabic = (lang: string | undefined): boolean =>
  text(lang).toLowerCase().split("-")[0] === "ar";

export function eoHistoryStep(
  row: Partial<EoRecordHistoryEntry> | null | undefined,
  lang?: string,
): EoHistoryStep {
  const from = text(row?.from_state_id);
  const to = text(row?.to_state_id);
  const end = (e: "from" | "to", id: string): EoHistoryState => ({
    id,
    name: eoHistoryStateName(row, e, lang),
  });
  if (from && to)
    return { kind: "moved", from: end("from", from), to: end("to", to) };
  if (to) return { kind: "created", to: end("to", to) };
  if (from) return { kind: "left", from: end("from", from) };
  return { kind: "noted" };
}

/**
 * The row's timestamp, for `<time dateTime=…>` and for reading.
 *
 * An unparseable timestamp comes back AS ITSELF rather than as "Invalid Date",
 * which is what `toLocaleString` prints and what an officer would otherwise
 * read in a statutory register.
 */
export interface EoHistoryTime {
  /** The value for the `dateTime` attribute; "" when it is not a timestamp. */
  machine: string;
  /** What the reader sees. */
  readable: string;
}

export function eoHistoryTime(
  iso: string | undefined,
  lang: string | undefined,
): EoHistoryTime {
  const raw = text(iso);
  const at = new Date(raw);
  if (!raw || Number.isNaN(at.getTime())) return { machine: "", readable: raw };
  return {
    machine: at.toISOString(),
    readable: at.toLocaleString(isArabic(lang) ? "ar" : "en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}
