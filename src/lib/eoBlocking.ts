import { eoErrorStatus } from "./eoFields";
import type { EoAvailableTransition } from "../types/eoRecord";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE BLOCKED TRANSITION, AND THE CONFIDENTIALITY RULE IT CARRIES
 * ────────────────────────────────────────────────────────────────────────────
 * A transition this officer MAY run can still be forbidden right now by an
 * open child record. Task B1 says so in two places, and in two shapes:
 *
 *  - GET /eo-records/:id/transitions — each offered transition may carry
 *    `blocked`, `blocking_references` and `blocking_hidden_count`. All three
 *    are Go `omitempty`, so AN ABSENT KEY MEANS false / empty / zero and an
 *    unblocked transition carries none of them. Nothing here may assume a key
 *    is present.
 *
 *  - POST /eo-records/:id/transition — a blocked move is refused with **409**,
 *    whose body carries the same two extra fields BESIDE the existing
 *    sentence. The sentence is in `error`, not `message`, and the two extra
 *    fields are written without `omitempty` there, so the refusal body and the
 *    transitions payload disagree on absence. Read through one normaliser and
 *    they cannot disagree here.
 *
 * `blocking_references` holds ONLY the blockers this caller may open.
 * `blocking_hidden_count` is how many further ones exist that they may not:
 * §7.11 conceals a restricted record's existence, so such a blocker is
 * COUNTED AND NEVER NAMED. The backend guarantees no concealed reference
 * reaches us; this module's job is to not undo that in the copy — which is
 * why the reason is produced as a *kind* plus a count, and why no caller is
 * handed a shape that lets it print a hidden blocker's type, state or
 * anything else about it. A count and nothing more.
 *
 * WHY THIS IS NOT IN eoFields.ts. `eoServerRefusal` there acts only on 400 and
 * must keep doing so: Plan 5's destructive-edit handling discriminates on that
 * status and three reviews verified it. Widening it to 409 would have put a
 * blocked transition through the §7.14 guard-rail branch. A 409 is a different
 * refusal and gets a different reader.
 */

/** What is blocking a move, split as §7.11 requires. */
export interface EoBlock {
  /** Blockers this caller may open, by reference. Possibly empty. */
  references: string[];
  /** Blockers this caller may NOT open. Counted, never named. */
  hiddenCount: number;
}

/**
 * The reason to render, as data: a kind and the numbers it needs. Pure, so it
 * can be exercised without i18next, and deliberately carries NOTHING about a
 * hidden blocker beyond how many there are.
 */
export type EoBlockReason =
  | { kind: "references"; count: number; references: string[] }
  | { kind: "hidden"; count: number }
  | { kind: "both"; count: number; references: string[] }
  | { kind: "unknown" };

const refList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
};

const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value > 0 ? Math.floor(value) : 0;
};

/**
 * The block on one offered transition, or null when it is runnable.
 *
 * THE FLAG IS NOT THE ONLY SIGNAL IT READS, on purpose. The server sets
 * `blocked` together with the blockers, so keying on the flag alone would be
 * correct today; but a payload carrying blockers and no flag would then render
 * as an ordinary, selectable step whose execution the server refuses — the
 * failure this whole task exists to remove. Any of the three keys means
 * blocked, and the flag alone (no visible references, nothing hidden —
 * everything `omitempty` stripped) still yields a block, with
 * `kind: "unknown"` to render.
 */
export function eoTransitionBlock(tr: EoAvailableTransition): EoBlock | null {
  const references = refList(tr.blocking_references);
  const hiddenCount = count(tr.blocking_hidden_count);
  if (tr.blocked !== true && references.length === 0 && hiddenCount === 0) {
    return null;
  }
  return { references, hiddenCount };
}

/** Convenience for filtering a list of offered transitions. */
export function eoIsBlocked(tr: EoAvailableTransition): boolean {
  return eoTransitionBlock(tr) !== null;
}

/**
 * The 409 a move gets when it was runnable when the page loaded and is not
 * any more, or when the client never saw the block at all.
 *
 * KEYED ON THE STATUS **AND** THE SHAPE, never on the sentence. The other 409
 * these routes answer — "this transition is not available from this state" —
 * is `utils.ErrorResponse`'s bare envelope and carries neither extra field,
 * so it falls through to the existing generic handling rather than being
 * announced as a blocked move with no blockers. Matching on the sentence
 * would have gone stale the first time the catalogue was reworded, and would
 * never have matched the Arabic at all.
 *
 * Returns null for every other status, so a 400 keeps reaching
 * `eoServerRefusal` exactly as before.
 */
export function eoBlockedRefusal(error: unknown): EoBlock | null {
  if (eoErrorStatus(error) !== 409) return null;
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const body = data as {
    blocking_references?: unknown;
    blocking_hidden_count?: unknown;
  };
  const hasRefs = Array.isArray(body.blocking_references);
  const hasHidden = typeof body.blocking_hidden_count === "number";
  if (!hasRefs && !hasHidden) return null;
  return {
    references: refList(body.blocking_references),
    hiddenCount: count(body.blocking_hidden_count),
  };
}

/**
 * Which sentence to render, for all four shapes a block can take: visible
 * references only, a hidden count only, both, and — defensively — blocked
 * with neither, where the only honest thing to say is that the step is
 * blocked, without inventing a reason for it.
 */
export function eoBlockReason(block: EoBlock): EoBlockReason {
  const hasRefs = block.references.length > 0;
  const hasHidden = block.hiddenCount > 0;
  if (hasRefs && hasHidden) {
    return {
      kind: "both",
      count: block.hiddenCount,
      references: block.references,
    };
  }
  if (hasRefs) {
    return {
      kind: "references",
      count: block.references.length,
      references: block.references,
    };
  }
  if (hasHidden) return { kind: "hidden", count: block.hiddenCount };
  return { kind: "unknown" };
}

/**
 * The visible references as one run of text, each one BIDI-ISOLATED.
 *
 * A reference is Latin-and-digits and therefore a left-to-right run; the
 * separator between two of them is neutral. Dropped raw into an Arabic
 * sentence, the bidi algorithm resolves that neutral comma to the paragraph
 * direction and `TSK-2026-00005, IN-2026-0003-R2` is read out in an order the
 * officer did not write. U+2068 FIRST STRONG ISOLATE … U+2069 POP DIRECTIONAL
 * ISOLATE around each reference keeps each one intact and lets the list as a
 * whole order itself with the paragraph, which is what an Arabic reader
 * expects.
 */
export function eoBlockReferenceText(references: string[]): string {
  return references.map((r) => `⁨${r}⁩`).join(", ");
}
