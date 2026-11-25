import type { EoRecord, EoWorkflowState } from "../types/eoRecord";

/**
 * Whether the record is finished. A terminal STATE is the authority, but the
 * states lookup belongs to the workflows module and may be refused, so a
 * stamped `closed_at` also closes the record — a record that cannot say what
 * state it is in must not be reported as late on the strength of that gap.
 */
export function isEoRecordClosed(
  record: Pick<EoRecord, "closed_at">,
  state?: Pick<EoWorkflowState, "state_type">,
): boolean {
  return state?.state_type === "terminal" || !!record.closed_at;
}

/**
 * Whole calendar days a record is late, or 0 when it is not.
 *
 * `due_date` is a DATE the server serialises as UTC midnight, so it is read
 * by its UTC calendar day and compared with the reader's local calendar day:
 * a record due "20 Nov" is still on time all of 20 Nov wherever the officer
 * sits, and is one day late on the 21st.
 */
export function eoDaysOverdue(
  record: Pick<EoRecord, "due_date" | "closed_at">,
  state?: Pick<EoWorkflowState, "state_type">,
  now: Date = new Date(),
): number {
  if (!record.due_date || isEoRecordClosed(record, state)) return 0;
  const due = new Date(record.due_date);
  if (Number.isNaN(due.getTime())) return 0;
  const dueDay = Date.UTC(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate(),
  );
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - dueDay) / 86_400_000));
}

export interface EoReferralBranch {
  /** Record id, or "" when the tree names the branch only by reference. */
  id: string;
  reference: string;
  answered: boolean;
  depth: number;
}

export interface EoReferralSummary {
  total: number;
  /** Every branch, as the snapshot recorded it (answered = snapshot value). */
  branches: EoReferralBranch[];
  outstanding: EoReferralBranch[];
}

/**
 * Reads `values.referral_tree` — written by the backend's referral
 * capability — into what an officer asks of it: how many branches are still
 * open, and which.
 *
 * Returns null when there is no tree at all (most record types) or the value
 * is not the shape the capability writes, so the caller shows nothing rather
 * than an invented "0 referrals". A present-but-empty tree returns
 * `{ total: 0 }`, which is a different thing: the letter was checked and has
 * no branches.
 *
 * The server's `outstanding` list carries references only. It is trusted for
 * WHICH branches are open and the `branches` array supplies their ids; a
 * branch missing from `branches` is still reported, id-less.
 */
export function summariseReferralTree(raw: unknown): EoReferralSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const tree = raw as { branches?: unknown; outstanding?: unknown };
  if (!Array.isArray(tree.branches) && !Array.isArray(tree.outstanding))
    return null;

  const branches: EoReferralBranch[] = (
    Array.isArray(tree.branches) ? tree.branches : []
  )
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b) => ({
      id: typeof b.id === "string" ? b.id : "",
      reference: typeof b.reference === "string" ? b.reference : "",
      answered: b.answered === true,
      depth: typeof b.depth === "number" ? b.depth : 0,
    }));

  const byRef = new Map(branches.map((b) => [b.reference, b]));
  const open = new Map<string, EoReferralBranch>();
  for (const b of branches) if (!b.answered) open.set(b.reference || b.id, b);
  if (Array.isArray(tree.outstanding)) {
    for (const ref of tree.outstanding) {
      if (typeof ref !== "string" || open.has(ref)) continue;
      open.set(
        ref,
        byRef.get(ref) ?? { id: "", reference: ref, answered: false, depth: 0 },
      );
    }
  }
  const all = [...branches];
  for (const b of open.values()) if (!all.includes(b)) all.push(b);
  return {
    total: all.length,
    branches: all,
    outstanding: Array.from(open.values()),
  };
}
