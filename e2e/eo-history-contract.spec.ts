import { test, expect } from "@playwright/test";
import {
  eoHistoryActor,
  eoHistoryStep,
  eoHistoryStateName,
  eoHistoryTime,
  isArabic,
} from "../src/lib/eoHistory";
import type { EoRecordHistoryEntry } from "../src/types/eoRecord";

/**
 * Task F2's row-reading contract, pinned where it is decided.
 *
 * `src/lib/eoHistory.ts` is a pure module — no React, no network, no browser —
 * so this spec imports it directly and launches nothing, exactly as
 * `eo-blocking-contract.spec.ts` does for lib/eoBlocking.ts. No second test
 * framework is introduced.
 *
 * WHY THESE LIVE HERE RATHER THAN IN THE DRIVEN SPEC. The seeded register was
 * measured: 48 records, 113 history rows, EVERY row naming a real person,
 * NONE flagged `is_system_action`, and not one record with an empty trail. So
 * three of the four actor shapes and one of the four step shapes have no data
 * to be driven against, and manufacturing them would mean writing rows into a
 * measured demo database. The branching they exercise is pure, so this is the
 * honest place to pin it; `eo-record-history.spec.ts` drives what the seed
 * really produces and intercepts the rest.
 */

const H = (o: Partial<EoRecordHistoryEntry>): EoRecordHistoryEntry =>
  ({
    id: "h1",
    comment: "",
    is_system_action: false,
    performed_by_name: "",
    from_state_name: "",
    from_state_name_ar: "",
    to_state_name: "",
    to_state_name_ar: "",
    created_at: "2026-11-23T18:13:22.733354Z",
    ...o,
  }) as EoRecordHistoryEntry;

test.describe("eoHistoryActor — an empty name is three different facts", () => {
  test("a named actor is a person", () => {
    expect(eoHistoryActor(H({ performed_by_name: "Super Admin" }))).toEqual({
      kind: "person",
      name: "Super Admin",
      automatic: false,
    });
  });

  test("no name and the system flag: nobody to name", () => {
    // The server writes exactly this for a timer or an escalation sweep.
    expect(
      eoHistoryActor(H({ performed_by_id: null, is_system_action: true })),
    ).toEqual({ kind: "system", name: "", automatic: true });
  });

  test("an id that resolved to nobody: the user row was purged", () => {
    // NOT the same as a system action, and the payload says which: the id
    // survives, the flag is false. A soft-deleted user still resolves, so
    // reaching this really does mean the row is gone.
    expect(
      eoHistoryActor(
        H({
          performed_by_id: "4b2a3401-4377-40ee-ada3-311093d1cd2f",
          is_system_action: false,
        }),
      ),
    ).toEqual({ kind: "removed", name: "", automatic: false });
  });

  test("neither an id nor the flag: nothing is invented", () => {
    expect(eoHistoryActor(H({ performed_by_id: null }))).toEqual({
      kind: "unknown",
      name: "",
      automatic: false,
    });
  });

  test("a system row that also names the person who provoked it", () => {
    // eoActionExecutor.recordActionFailure writes BOTH: the actor's id and
    // is_system_action. Naming them is right — they made the move — and so is
    // saying the entry was written automatically, so `automatic` is a flag
    // beside the kind rather than a fifth kind that would hide the name.
    expect(
      eoHistoryActor(
        H({
          performed_by_id: "4b2a3401-4377-40ee-ada3-311093d1cd2f",
          performed_by_name: "Super Admin",
          is_system_action: true,
        }),
      ),
    ).toEqual({ kind: "person", name: "Super Admin", automatic: true });
  });

  test("whitespace is not a name, and junk is not a name", () => {
    expect(eoHistoryActor(H({ performed_by_name: "   " })).kind).toBe(
      "unknown",
    );
    expect(
      eoHistoryActor(
        H({
          performed_by_name: 7 as unknown as string,
          is_system_action: true,
        }),
      ).kind,
    ).toBe("system");
    expect(eoHistoryActor(undefined)).toEqual({
      kind: "unknown",
      name: "",
      automatic: false,
    });
  });

  test("there is no performed_by_name_ar to fall back to", () => {
    // The backend omits the key deliberately (models.User has no Arabic name
    // column) and a backend test pins it as ABSENT. Nothing here may read it,
    // and the actor must read the same in both locales — a fallback that
    // preferred an Arabic key would render an empty name the day someone
    // added one by mistake.
    const row = H({ performed_by_name: "Super Admin" });
    expect(Object.hasOwn(row, "performed_by_name_ar")).toBe(false);
    expect(eoHistoryActor(row).name).toBe("Super Admin");
    expect(
      eoHistoryActor({
        ...row,
        performed_by_name_ar: "",
      } as unknown as EoRecordHistoryEntry).name,
    ).toBe("Super Admin");
  });
});

test.describe("eoHistoryStep — a create row is an origin, not a hole", () => {
  test("both ends: an ordinary move", () => {
    expect(
      eoHistoryStep(
        H({
          from_state_id: "60330ae7",
          to_state_id: "d9a0cb46",
          from_state_name: "Directed",
          to_state_name: "Consolidating",
        }),
      ),
    ).toEqual({
      kind: "moved",
      from: { id: "60330ae7", name: "Directed" },
      to: { id: "d9a0cb46", name: "Consolidating" },
    });
  });

  test("no from-state: the record was created", () => {
    // Rendering this as a move would print "— → Received", which reads as a
    // trail with a hole in it rather than as the beginning of one.
    expect(
      eoHistoryStep(
        H({
          from_state_id: null,
          to_state_id: "4c581fd8",
          to_state_name: "Received",
        }),
      ),
    ).toEqual({ kind: "created", to: { id: "4c581fd8", name: "Received" } });
  });

  test("no state at all: an edit, journalled as a values diff", () => {
    // EORecordService.Update writes one of these with both state ids null and
    // the change reason as its comment — which may itself be empty. Without
    // its own shape the row is a blank line in a statutory register.
    expect(
      eoHistoryStep(H({ from_state_id: null, to_state_id: null })),
    ).toEqual({ kind: "noted" });
  });

  test("a from-state and no to-state", () => {
    expect(
      eoHistoryStep(
        H({
          from_state_id: "60330ae7",
          from_state_name: "Directed",
          to_state_id: null,
        }),
      ),
    ).toEqual({ kind: "left", from: { id: "60330ae7", name: "Directed" } });
  });

  test("an unnamed state keeps its id, so the caller can still print a dash", () => {
    const step = eoHistoryStep(
      H({ from_state_id: null, to_state_id: "4c581fd8", to_state_name: "" }),
    );
    expect(step).toEqual({ kind: "created", to: { id: "4c581fd8", name: "" } });
  });
});

test.describe("eoHistoryStateName — Arabic, with a fallback that is honest", () => {
  const row = H({
    from_state_name: "Directed",
    from_state_name_ar: "موجَّه",
    to_state_name: "Consolidating",
    to_state_name_ar: "",
  });

  test("English reads the primary name even when an Arabic one exists", () => {
    expect(eoHistoryStateName(row, "from", "en")).toBe("Directed");
  });

  test("Arabic reads name_ar", () => {
    expect(eoHistoryStateName(row, "from", "ar")).toBe("موجَّه");
    expect(eoHistoryStateName(row, "from", "ar-SA")).toBe("موجَّه");
  });

  test("Arabic falls back to the primary name rather than to nothing", () => {
    // In the pilot seed every name_ar EQUALS the English name (the states are
    // flagged eo_client_unconfirmed, awaiting the client's sign-off), so an
    // Arabic trail legitimately shows English state names. An empty name_ar
    // must behave the same way rather than leaving the state blank.
    expect(eoHistoryStateName(row, "to", "ar")).toBe("Consolidating");
  });

  test("isArabic reads the base tag only", () => {
    expect(isArabic("ar")).toBe(true);
    expect(isArabic("AR-EG")).toBe(true);
    expect(isArabic("en")).toBe(false);
    expect(isArabic(undefined)).toBe(false);
  });
});

test.describe("eoHistoryTime — never 'Invalid Date' in a register", () => {
  test("a real timestamp carries both a machine and a readable form", () => {
    const when = eoHistoryTime("2026-11-23T18:13:22.733354Z", "en");
    expect(when.machine).toBe("2026-11-23T18:13:22.733Z");
    expect(when.readable).toContain("2026");
    expect(when.readable).not.toContain("Invalid");
  });

  test("the Arabic reading is Arabic, and the machine form is not", () => {
    const when = eoHistoryTime("2026-11-23T18:13:22.733354Z", "ar");
    expect(when.machine).toBe("2026-11-23T18:13:22.733Z");
    expect(when.readable).not.toBe(
      eoHistoryTime("2026-11-23T18:13:22.733354Z", "en").readable,
    );
  });

  test("an unparseable timestamp comes back as itself", () => {
    // `new Date("tomorrow").toLocaleString()` is "Invalid Date", which is what
    // an officer would otherwise read in the time column.
    expect(eoHistoryTime("tomorrow", "en")).toEqual({
      machine: "",
      readable: "tomorrow",
    });
    expect(eoHistoryTime("", "en")).toEqual({ machine: "", readable: "" });
    expect(eoHistoryTime(undefined, "ar")).toEqual({
      machine: "",
      readable: "",
    });
  });
});
