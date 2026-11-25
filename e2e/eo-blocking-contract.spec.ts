import { test, expect } from "@playwright/test";
import {
  eoTransitionBlock,
  eoIsBlocked,
  eoBlockedRefusal,
  eoBlockReason,
  eoBlockReferenceText,
} from "../src/lib/eoBlocking";
import type { EoAvailableTransition } from "../src/types/eoRecord";

/**
 * Task B1's contract, pinned where it is decided.
 *
 * `src/lib/eoBlocking.ts` is a pure module — no React, no network, no browser
 * — so this spec imports it directly and launches nothing. It runs under the
 * repo's existing Playwright runner (no second test framework was introduced)
 * and needs neither an account nor the register's current contents.
 *
 * WHY THESE LIVE HERE RATHER THAN IN THE DRIVEN SPEC. The seeded register
 * produces exactly one of the four reason shapes with visible references, and
 * one with a reference plus a hidden count. The other two — a hidden count
 * alone, and blocked with nothing said about by what — have no natural data,
 * and manufacturing records to reach them would pin a shape the server does
 * not currently take. The branching they exercise is pure, so this is the
 * honest place to pin it: see `eo-transition-blocked.spec.ts` for what is
 * driven against the live register instead.
 */

const T = (o: Partial<EoAvailableTransition>): EoAvailableTransition =>
  ({ id: "t", code: "close", ...o }) as EoAvailableTransition;

test.describe("eoTransitionBlock — omitempty means absent", () => {
  test("a runnable transition carries none of the three keys", () => {
    expect(eoTransitionBlock(T({}))).toBeNull();
    expect(eoTransitionBlock(T({ blocked: false }))).toBeNull();
    expect(eoIsBlocked(T({}))).toBe(false);
  });

  test("the flag alone, with everything else stripped, still blocks", () => {
    expect(eoTransitionBlock(T({ blocked: true }))).toEqual({
      references: [],
      hiddenCount: 0,
    });
    expect(eoIsBlocked(T({ blocked: true }))).toBe(true);
  });

  test("visible references, a hidden count, and both", () => {
    expect(
      eoTransitionBlock(
        T({ blocked: true, blocking_references: ["TSK-2026-00005"] }),
      ),
    ).toEqual({ references: ["TSK-2026-00005"], hiddenCount: 0 });

    expect(
      eoTransitionBlock(T({ blocked: true, blocking_hidden_count: 2 })),
    ).toEqual({ references: [], hiddenCount: 2 });

    expect(
      eoTransitionBlock(
        T({
          blocked: true,
          blocking_references: ["IN-2026-0003-R2"],
          blocking_hidden_count: 3,
        }),
      ),
    ).toEqual({ references: ["IN-2026-0003-R2"], hiddenCount: 3 });
  });

  test("blockers without the flag still block", () => {
    // The server sets `blocked` together with the blockers, so keying on the
    // flag alone would be correct today. A payload carrying blockers and no
    // flag would then render as an ordinary, selectable step whose execution
    // the server refuses — the defect this whole task removes.
    expect(
      eoTransitionBlock(T({ blocking_references: ["TSK-2026-00005"] })),
    ).toEqual({ references: ["TSK-2026-00005"], hiddenCount: 0 });
    expect(eoTransitionBlock(T({ blocking_hidden_count: 1 }))).toEqual({
      references: [],
      hiddenCount: 1,
    });
  });

  test("junk is dropped rather than printed at the officer", () => {
    expect(
      eoTransitionBlock(
        T({
          blocked: true,
          blocking_references: [
            "TSK-1",
            null,
            7,
            "  ",
            " IN-2 ",
          ] as unknown as string[],
        }),
      ),
    ).toEqual({ references: ["TSK-1", "IN-2"], hiddenCount: 0 });

    expect(
      eoTransitionBlock(T({ blocked: true, blocking_hidden_count: -4 })),
    ).toEqual({ references: [], hiddenCount: 0 });
    expect(
      eoTransitionBlock(
        T({ blocked: true, blocking_hidden_count: NaN as number }),
      ),
    ).toEqual({ references: [], hiddenCount: 0 });
  });
});

test.describe("eoBlockReason — all four shapes", () => {
  test("visible references only", () => {
    expect(
      eoBlockReason({ references: ["TSK-2026-00005"], hiddenCount: 0 }),
    ).toEqual({
      kind: "references",
      count: 1,
      references: ["TSK-2026-00005"],
    });
  });

  test("a hidden count only — counted, never named", () => {
    const reason = eoBlockReason({ references: [], hiddenCount: 2 });
    expect(reason).toEqual({ kind: "hidden", count: 2 });
    // The confidentiality rule is enforced by the TYPE, not by wording
    // discipline: there is no field on this variant in which a reference, a
    // type or a state could travel.
    expect(Object.keys(reason).sort()).toEqual(["count", "kind"]);
  });

  test("both — the visible ones named, the rest counted", () => {
    expect(
      eoBlockReason({ references: ["TSK-2026-00005"], hiddenCount: 1 }),
    ).toEqual({
      kind: "both",
      count: 1,
      references: ["TSK-2026-00005"],
    });
  });

  test("blocked with neither — no reason is invented", () => {
    expect(eoBlockReason({ references: [], hiddenCount: 0 })).toEqual({
      kind: "unknown",
    });
  });
});

test.describe("eoBlockedRefusal — the 409, and only the 409", () => {
  const refusal = (status: number, data: unknown) => ({
    response: { status, data },
  });

  test("the blocked 409, as the server writes it", () => {
    expect(
      eoBlockedRefusal(
        refusal(409, {
          success: false,
          error: "An open child record blocks this transition",
          blocking_references: ["IN-2026-0003-R2", "TSK-2026-00005"],
          blocking_hidden_count: 0,
        }),
      ),
    ).toEqual({
      references: ["IN-2026-0003-R2", "TSK-2026-00005"],
      hiddenCount: 0,
    });
  });

  test("a 409 whose blockers are partly concealed", () => {
    expect(
      eoBlockedRefusal(
        refusal(409, {
          success: false,
          error: "An open child record blocks this transition",
          blocking_references: ["TSK-2026-00005"],
          blocking_hidden_count: 1,
        }),
      ),
    ).toEqual({ references: ["TSK-2026-00005"], hiddenCount: 1 });
  });

  test("the OTHER 409 — not available from this state — is not a block", () => {
    // Keyed on the body's shape, never on the sentence: matching the words
    // would go stale at the first rewording and would never have matched the
    // Arabic catalogue at all.
    expect(
      eoBlockedRefusal(
        refusal(409, {
          success: false,
          error: "This transition is not available from this state",
        }),
      ),
    ).toBeNull();
  });

  test("a 400 is never a block, so eoServerRefusal keeps every one", () => {
    expect(
      eoBlockedRefusal(
        refusal(400, {
          success: false,
          error: "removing field x is destructive while records exist",
          blocking_references: ["X"],
        }),
      ),
    ).toBeNull();
  });

  test("a denial, a proxy body and a network failure are not blocks", () => {
    expect(
      eoBlockedRefusal(
        refusal(403, { success: false, error: "not permitted" }),
      ),
    ).toBeNull();
    expect(eoBlockedRefusal(refusal(409, "<html>nope</html>"))).toBeNull();
    expect(eoBlockedRefusal(refusal(409, null))).toBeNull();
    expect(eoBlockedRefusal(new Error("Network Error"))).toBeNull();
    expect(eoBlockedRefusal(undefined)).toBeNull();
  });
});

test("references are bidi-isolated for the Arabic sentence", () => {
  // Each reference is an LTR run and the separator between two of them is
  // neutral; dropped raw into an Arabic paragraph the bidi algorithm reads
  // the list back in an order nobody wrote.
  expect(eoBlockReferenceText(["TSK-1", "IN-2"])).toBe("⁨TSK-1⁩, ⁨IN-2⁩");
  expect(eoBlockReferenceText([])).toBe("");
});
