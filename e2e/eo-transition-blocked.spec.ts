import { test, expect, USERS } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";
import { eoBlockedRefusal } from "../src/lib/eoBlocking";

/**
 * Task F1 — a move the officer cannot make is shown as such, and why.
 *
 * WHY THIS SPEC DISCOVERS ITS OWN FIXTURES INSTEAD OF NAMING A RECORD.
 * A test that asserts against a payload the test itself built proves nothing
 * about the contract it is meant to pin: the failure this whole task exists
 * to remove is a branch that no real response can reach. So the spec asks the
 * running server which record actually has a blocked transition and which
 * record offers none at all, and FAILS — naming what it wanted — rather than
 * skipping, because a skip reports green and would hide exactly that. The
 * blocked case is genuinely reachable against the pilot seed: `IN-2026-0003`
 * cannot close while `IN-2026-0003-R2` and `TSK-2026-00005` are open, and 23
 * of the 48 records offer no step from their current state.
 *
 * TWO ACCOUNTS, BECAUSE THE CONFIDENTIALITY SPLIT ONLY EXISTS FOR ONE OF THEM.
 * The super admin sees every blocker, so `blocking_hidden_count` is absent for
 * them and the "both" shape is unreachable. A caller restricted by §7.11 sees
 * `IN-2026-0003-R2` counted and not named, which is the shape the rule is
 * actually for — so the reason-with-a-hidden-count and the 409 are driven as
 * that caller.
 *
 * The pure branching (a hidden count alone, blocked with nothing said about by
 * what, and every non-409 refusal) has no natural data and is pinned in
 * `eo-blocking-contract.spec.ts` instead of being manufactured here.
 */

const API = "http://localhost:8080/api/v1";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE RESTRICTED FIXTURE ACCOUNT — PROVISION YOUR OWN, AND SUPPLY IT BY ENV
 * ────────────────────────────────────────────────────────────────────────────
 * Three of the tests below need an officer the register conceals a record
 * from, because that is the only way `blocking_hidden_count` is ever non-zero
 * and the only way the §7.11 split exists to be tested at all. No such
 * account is hardcoded here: a working login for a live account does not
 * belong in a tracked file, however local the database.
 *
 * Supply it instead, to the project these three live in — they are tagged
 * out of the default run (see EO_RESTRICTED below):
 *
 *     EO_RESTRICTED_EMAIL=... EO_RESTRICTED_PASSWORD=... \
 *       npm run test:e2e:restricted
 *
 * The same recipe, kept where someone looking for it will find it, is in
 * `e2e/README.md`; this copy is for whoever is already reading the spec.
 *
 * WHAT THE ACCOUNT HAS TO BE. The suite will tell you if it is wrong — the
 * discovery assertions name what they wanted — but provisioning it correctly
 * first is quicker:
 *
 *  - the `Executive Office` role, or any role holding `eo:view`,
 *    `eo:transition` and the per-type `view`/`update` codes for the register
 *    that contains the blocked record (e.g. `eo:eo_incoming_correspondence:*`).
 *    Without `eo:transition` it cannot attempt the move that is refused.
 *  - **NOT** `eo:records:view_all_bodies`. That oversight grant short-circuits
 *    `applyEORecordVisibility`, so every blocker is visible, the hidden count
 *    is permanently zero, and the `both` shape becomes unreachable — the tests
 *    would then fail for a reason that has nothing to do with the code.
 *  - belonging to **no body that owns a blocking child**. Membership of the
 *    owning body makes that child visible and, again, nothing is concealed.
 *    A user with no department at all satisfies this.
 *  - able to see the parent record. It must see the record whose move is
 *    blocked while not seeing at least one of that record's open children;
 *    that asymmetry IS the case under test.
 *
 * The particular account used while this was written has since been
 * deactivated, which is why this recipe is here rather than a name: provision
 * your own against whichever register currently carries a blocked step.
 */
/**
 * The Playwright tag that carries these three out of the default run.
 *
 * They fail rather than skip when the fixture account is absent — a skip
 * reports green and would hide the one case §7.11 exists for — so the failure
 * is kept and moved: `playwright.config.ts` excludes this tag from the
 * `chromium` project and gives it the `eo-restricted` project, which is asked
 * for by name (`npm run test:e2e:restricted`). The default run is therefore
 * green out of the box and the §7.11 run is loud when its fixture is missing.
 * See `e2e/README.md` for how to provision the account.
 */
const EO_RESTRICTED = "@eo-restricted";

const RESTRICTED_PROVISIONING = [
  "EO_RESTRICTED_EMAIL and EO_RESTRICTED_PASSWORD are not both set.",
  "These tests need a §7.11-restricted officer, because a blocker is only ever",
  "concealed — and blocking_hidden_count only ever non-zero — for a caller the",
  "register hides a record from. Provision an account that:",
  "  * holds eo:view, eo:transition and the per-type view/update codes;",
  "  * does NOT hold eo:records:view_all_bodies (it would make the hidden count",
  "    permanently zero);",
  "  * belongs to no body that owns a blocking child (no department will do);",
  "  * can see the record whose move is blocked.",
  "Then: EO_RESTRICTED_EMAIL=... EO_RESTRICTED_PASSWORD=... npm run test:e2e:restricted",
  "Full recipe: e2e/README.md.",
].join("\n");

/**
 * The restricted account, from the environment.
 *
 * ABSENCE FAILS, IT DOES NOT SKIP — the same rule the rest of this spec
 * follows. A skip reports green, and "the confidentiality split was never
 * exercised" is precisely the thing that must not pass quietly. This suite
 * already requires a live backend on :8080 and a register containing a
 * blocked step; a provisioned fixture account is the same kind of
 * precondition, and it says so when it is missing.
 */
function restrictedAccount(): { email: string; password: string } {
  const email = process.env.EO_RESTRICTED_EMAIL;
  const password = process.env.EO_RESTRICTED_PASSWORD;
  expect(Boolean(email && password), RESTRICTED_PROVISIONING).toBe(true);
  return { email: email as string, password: password as string };
}

interface BlockedFixture {
  id: string;
  typeKey: string;
  transitionId: string;
  references: string[];
  hiddenCount: number;
}

interface Discovered {
  /** A record whose offered steps include one an open child blocks. */
  blocked?: BlockedFixture;
  /**
   * A record whose blocked step has BOTH a blocker this caller may name and
   * at least one it may not — the §7.11 split actually exercised. It exists
   * only for a restricted caller; the super admin sees every blocker.
   */
  partlyConcealed?: BlockedFixture;
  /** A record with no step at all out of its current state. */
  noMoves?: { id: string; typeKey: string };
  /** A record whose every offered step can be run, and how many there are. */
  allRunnable?: { id: string; typeKey: string; count: number };
}

async function token(
  request: APIRequestContext,
  who: { email: string; password: string },
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email: who.email, password: who.password },
  });
  expect(
    res.ok(),
    `login as ${who.email} answered ${res.status()}`,
  ).toBeTruthy();
  return (await res.json()).data.token;
}

/**
 * Memoised per account for the life of the file. Discovery walks every record
 * in the register, so running it once per test meant ~290 sequential reads
 * and, once, a transient failure in one of them. It failed loudly, which is
 * the point of the `res.ok()` assertion, but the register does not change
 * during a run — the only write this spec attempts is refused — so re-reading
 * it six times buys nothing.
 */
const discovered = new Map<string, Promise<Discovered>>();

function discover(
  request: APIRequestContext,
  who: { email: string; password: string } = USERS.admin,
): Promise<Discovered> {
  const cached = discovered.get(who.email);
  if (cached) return cached;
  const run = discoverFresh(request, who);
  discovered.set(who.email, run);
  return run;
}

async function discoverFresh(
  request: APIRequestContext,
  who: { email: string; password: string },
): Promise<Discovered> {
  const jwt = await token(request, who);
  const headers = { Authorization: `Bearer ${jwt}` };

  const typesRes = await request.get(`${API}/admin/eo-record-types`, {
    headers,
  });
  const types: { id: string; key: string }[] =
    (await typesRes.json()).data ?? [];
  const keyById = new Map(types.map((t) => [t.id, t.key]));

  const recordsRes = await request.get(`${API}/eo-records?limit=100`, {
    headers,
  });
  const records: { id: string; record_type_id: string }[] =
    (await recordsRes.json()).data ?? [];

  const found: Discovered = {};
  for (const record of records) {
    const typeKey = keyById.get(record.record_type_id);
    if (!typeKey) continue;
    const res = await request.get(
      `${API}/eo-records/${record.id}/transitions`,
      { headers },
    );
    // A FAILED READ IS NOT AN EMPTY ONE. Taking `.data ?? []` off a refusal
    // would file this record as "offers no step", which both mis-selects the
    // fixture for the no-step case and can hide the blocked record from the
    // other two tests — leaving them to skip while reporting green. That is
    // the exact failure this spec exists to catch, in the spec itself.
    expect(
      res.ok(),
      `GET /eo-records/${record.id}/transitions answered ${res.status()}`,
    ).toBeTruthy();
    const offered: {
      id: string;
      blocked?: boolean;
      blocking_references?: string[];
      blocking_hidden_count?: number;
    }[] = (await res.json()).data ?? [];

    if (offered.length === 0) {
      found.noMoves ??= { id: record.id, typeKey };
      continue;
    }
    const blocker = offered.find((tr) => tr.blocked === true);
    if (blocker) {
      const fixture: BlockedFixture = {
        id: record.id,
        typeKey,
        transitionId: blocker.id,
        references: blocker.blocking_references ?? [],
        hiddenCount: blocker.blocking_hidden_count ?? 0,
      };
      found.blocked ??= fixture;
      if (fixture.hiddenCount > 0 && fixture.references.length > 0) {
        found.partlyConcealed ??= fixture;
      }
    } else {
      found.allRunnable ??= { id: record.id, typeKey, count: offered.length };
    }
  }
  return found;
}

/** The app in Arabic, set the way the language switcher sets it. */
async function useArabic(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("app_language", "ar");
  });
}

/** Sign in through the form as an account the shared fixture does not carry. */
async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', who.email);
  await page.fill(
    'input[name="password"], input[type="password"]',
    who.password,
  );
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
}

test.describe("EO record detail — a move that cannot be made", () => {
  test("a blocked step is listed with its reason and is not a control", async ({
    page,
    request,
    loginAs,
  }) => {
    const { blocked } = await discover(request);
    // NOT `test.skip`. A skip reports green, and a blocked-state branch that
    // no real response can reach is precisely the defect this task is about:
    // if the register stops producing a blocked transition, that is a thing
    // to look at, not a thing to pass over quietly.
    expect(
      blocked,
      "no record in this register has a transition blocked by a visible open child — the case this feature exists for is unreachable",
    ).toBeDefined();
    expect(blocked!.references.length).toBeGreaterThan(0);

    await loginAs("admin");
    await page.goto(`/eo/${blocked!.typeKey}/${blocked!.id}`);
    await page.getByRole("button", { name: /move/i }).first().click();

    // The section is named in words, not signalled by colour.
    await expect(page.getByText(/not available yet/i)).toBeVisible();

    // The reason names the blocking child the officer may see — that is the
    // whole point: it tells them where to go.
    for (const reference of blocked!.references) {
      await expect(page.getByText(reference, { exact: false })).toBeVisible();
    }

    // And the blocked step is not offered as something to press.
    const blockedItem = page.locator("li", {
      hasText: /waiting on/i,
    });
    await expect(blockedItem.first()).toBeVisible();
    await expect(blockedItem.first().locator("button")).toHaveCount(0);
  });

  test("the reason is readable in Arabic too", async ({
    page,
    request,
    loginAs,
  }) => {
    const { blocked } = await discover(request);
    expect(blocked, "no blocked transition in this register").toBeDefined();

    await useArabic(page);
    await loginAs("admin");
    await page.goto(`/eo/${blocked!.typeKey}/${blocked!.id}`);
    await page
      .getByRole("button")
      .filter({ hasText: /نقل|move/i })
      .first()
      .click();

    await expect(page.getByText("غير متاح بعد")).toBeVisible();
    // The Arabic sentence, not the English fallback.
    await expect(page.getByText(/بانتظار/).first()).toBeVisible();
    for (const reference of blocked!.references) {
      await expect(page.getByText(reference, { exact: false })).toBeVisible();
    }
  });

  test("a record with no step says so beside a Move control that cannot open", async ({
    page,
    request,
    loginAs,
  }) => {
    const { noMoves } = await discover(request);
    expect(
      noMoves,
      "every record in this register offers a step — the no-step case is unreachable",
    ).toBeDefined();

    await loginAs("admin");
    await page.goto(`/eo/${noMoves!.typeKey}/${noMoves!.id}`);

    const move = page.getByRole("button", { name: /move/i }).first();
    await expect(move).toBeVisible();
    await expect(move).toHaveAttribute("aria-disabled", "true");

    // The reason is on the page, not in a tooltip — and the control that is
    // marked unavailable points at it.
    const reason = page.locator("#eo-no-moves-reason");
    await expect(reason).toBeVisible();
    await expect(move).toHaveAttribute(
      "aria-describedby",
      "eo-no-moves-reason",
    );

    // `aria-disabled`, NOT `disabled`: the control stays focusable, so a
    // keyboard user reaches it and is told why. A `disabled` button would be
    // out of the tab order and the explanation unreachable.
    await move.focus();
    await expect(move).toBeFocused();

    // Pressing it opens nothing.
    await move.press("Enter");
    await expect(page.getByText(/move record|نقل السجل/i)).toHaveCount(0);
  });

  test(
    "a blocker the officer may not see is counted, never named",
    { tag: EO_RESTRICTED },
    async ({ page, request }) => {
      // Driven as the restricted caller, for whom the server really does
      // conceal one of the two blockers. Nothing here is injected: the hidden
      // count is the server's own.
      const restricted = restrictedAccount();
      const { partlyConcealed: blocked } = await discover(request, restricted);
      expect(
        blocked,
        "no blocked step shows this account both a named blocker and a concealed one — the §7.11 split is unreachable",
      ).toBeDefined();
      expect(blocked!.hiddenCount).toBeGreaterThan(0);
      expect(blocked!.references.length).toBeGreaterThan(0);

      await signIn(page, restricted);
      await page.goto(`/eo/${blocked!.typeKey}/${blocked!.id}`);
      await page.getByRole("button", { name: /move/i }).first().click();

      const reason = page.locator("li", { hasText: /waiting on/i }).first();
      await expect(reason).toBeVisible();
      const text = await reason.innerText();

      // The visible blocker is named...
      for (const reference of blocked!.references) {
        expect(text).toContain(reference);
      }
      // ...the concealed one is counted and the officer is told what to do...
      expect(text).toMatch(/do not have access to/i);
      expect(text).toMatch(/colleague/i);
      // ...and nothing identifies it. The register's own reference format is
      // XXX-dddd-dddd; exactly as many of those appear as the officer may see.
      const printed = text.match(/[A-Z]{2,4}-\d{4}-[\dA-Z-]+/g) ?? [];
      expect(new Set(printed)).toEqual(new Set(blocked!.references));
    },
  );

  test("the Move badge counts the steps that can be run", async ({
    page,
    request,
    loginAs,
  }) => {
    const { blocked, allRunnable } = await discover(request);
    expect(blocked).toBeDefined();
    expect(
      allRunnable,
      "no record offers only runnable steps — the badge cannot be shown at all",
    ).toBeDefined();

    await loginAs("admin");

    // A record whose steps are all runnable carries the count.
    await page.goto(`/eo/${allRunnable!.typeKey}/${allRunnable!.id}`);
    const withBadge = page.getByRole("button", { name: /move/i }).first();
    await expect(withBadge.locator("span")).toHaveText(
      String(allRunnable!.count),
    );

    // A record whose only step is blocked carries none — the badge used to
    // count every offered step, so this one advertised a move the server
    // would refuse. Reverting it to `transitions.length` fails here.
    await page.goto(`/eo/${blocked!.typeKey}/${blocked!.id}`);
    const noBadge = page.getByRole("button", { name: /move/i }).first();
    await expect(noBadge).toBeVisible();
    await expect(noBadge).toHaveText(/^\s*Move\s*$/);
  });

  test(
    "a move blocked after the page loaded shows the server's own refusal",
    { tag: EO_RESTRICTED },
    async ({ page, request }) => {
      // Driven on the partly-concealed step, so the refusal the officer reads
      // carries the concealed count as well as the named blocker.
      const restricted = restrictedAccount();
      const { partlyConcealed: blocked } = await discover(request, restricted);
      expect(blocked).toBeDefined();

      // ONLY THE STALENESS IS SIMULATED, and it has to be: the UI no longer
      // offers a blocked step, so the single way to reach the 409 is a page
      // that loaded before the block existed. The FIRST transitions read is
      // stripped of the three keys so the step is offered; every later read —
      // including the refetch the refusal triggers — is the server's real,
      // blocked answer, and the POST is never touched.
      let first = true;
      await page.route("**/api/v1/eo-records/*/transitions", async (route) => {
        const res = await route.fetch();
        const body = await res.json();
        if (first) {
          first = false;
          for (const tr of body.data ?? []) {
            delete tr.blocked;
            delete tr.blocking_references;
            delete tr.blocking_hidden_count;
          }
        }
        await route.fulfill({ response: res, body: JSON.stringify(body) });
      });

      await signIn(page, restricted);
      await page.goto(`/eo/${blocked!.typeKey}/${blocked!.id}`);
      await page.getByRole("button", { name: /move/i }).first().click();
      await page.locator("div.grid > button").first().click();
      await page
        .locator("#eo-transition-comment")
        .fill("e2e: provoking the 409");

      const [refusal] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes("/transition") && r.request().method() === "POST",
        ),
        page.getByRole("button", { name: /confirm/i }).click(),
      ]);

      // The server's real refusal: 409, never 401 (which would log the officer
      // out) and never 403.
      expect(refusal.status()).toBe(409);
      const body = await refusal.json();
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);

      // The real bytes, through the real parser.
      expect(
        eoBlockedRefusal({
          response: { status: refusal.status(), data: body },
        }),
      ).toEqual({
        references: blocked!.references,
        hiddenCount: blocked!.hiddenCount,
      });

      // And on screen, announced, in the same words the blocked list uses.
      const alert = page.locator('[role="alert"]');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(/the record did not move/i);
      await expect(alert).toContainText(blocked!.references[0]);

      // The refetch moved the step out of the chooser and into the blocked list.
      await expect(page.getByText(/not available yet/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /confirm/i })).toHaveCount(
        0,
      );

      // The officer is still signed in: a 409 is not a session failure.
      expect(page.url()).not.toContain("/login");

      // The page keeps polling transitions; drop the handler before teardown so
      // a request still in flight cannot fail the test after it has passed.
      await page.unrouteAll({ behavior: "ignoreErrors" });
    },
  );

  test(
    "the refusal survives a refetch that comes back empty",
    { tag: EO_RESTRICTED },
    async ({ page, request }) => {
      // The refusal invalidates the transitions query, and the modal body used
      // to branch on `transitions.length`. If that re-read came back empty —
      // a concurrent state change, a read that failed — the amber "nothing is
      // available" panel replaced the officer's own refusal and they never
      // learned why the move they just made was rejected. Narrow, but the
      // refusal is the one thing that has to survive.
      //
      // The first read is stripped so the step is offered; every read after it
      // answers with an EMPTY list, which is the case being pinned.
      const restricted = restrictedAccount();
      const { partlyConcealed: blocked } = await discover(request, restricted);
      expect(blocked).toBeDefined();

      let first = true;
      await page.route("**/api/v1/eo-records/*/transitions", async (route) => {
        const res = await route.fetch();
        const body = await res.json();
        if (first) {
          first = false;
          for (const tr of body.data ?? []) {
            delete tr.blocked;
            delete tr.blocking_references;
            delete tr.blocking_hidden_count;
          }
        } else {
          body.data = [];
        }
        await route.fulfill({ response: res, body: JSON.stringify(body) });
      });

      await signIn(page, restricted);
      await page.goto(`/eo/${blocked!.typeKey}/${blocked!.id}`);
      await page.getByRole("button", { name: /move/i }).first().click();
      await page.locator("div.grid > button").first().click();
      await page.locator("#eo-transition-comment").fill("e2e: empty refetch");
      // THE EMPTY REFETCH HAS TO HAVE LANDED BEFORE ANYTHING IS ASSERTED.
      // Without this wait the assertions run while the modal still holds the
      // old, non-empty list, and both of them pass whatever the component does
      // — which is how the first draft of this test survived the mutation that
      // put the refusal back inside the branch.
      const emptied = page.waitForResponse(
        (r) =>
          r.url().includes("/transitions") && r.request().method() === "GET",
      );
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes("/transition") && r.request().method() === "POST",
        ),
        page.getByRole("button", { name: /confirm/i }).click(),
      ]);
      expect(await (await emptied).json()).toEqual(
        expect.objectContaining({ data: [] }),
      );
      // The modal has no step left to offer...
      await expect(page.getByRole("button", { name: /confirm/i })).toHaveCount(
        0,
      );

      // ...and the refusal is still the thing on screen.
      const alert = page.locator('[role="alert"]');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(/the record did not move/i);
      // The panel that would have replaced it is not drawn.
      await expect(page.getByText(/no transitions are available/i)).toHaveCount(
        0,
      );

      await page.unrouteAll({ behavior: "ignoreErrors" });
    },
  );

  test("a failed read of the steps is announced as a failure, not as an empty workflow", async ({
    page,
    request,
    loginAs,
  }) => {
    // THE DEFECT THIS TEST EXISTS FOR. The page gates its own "No step is
    // available from this state." on the read having SUCCEEDED, with a
    // comment saying why; the modal still branched on bare
    // `transitions.length === 0`, so a failed read put "No transitions are
    // available from this state." in front of the officer — a statement about
    // the workflow where the only true statement was about the network.
    //
    // INTERCEPTED, because a live route cannot be made to fail to order. The
    // record is a discovered one that really does offer steps, so the empty
    // array under test comes from the failure and from nothing else.
    const { allRunnable } = await discover(request);
    expect(allRunnable, "no record offers a runnable step").toBeDefined();

    let failing = true;
    await page.route("**/api/v1/eo-records/*/transitions", (route) =>
      failing
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ success: false, error: "boom" }),
          })
        : route.continue(),
    );

    await loginAs("admin");
    await page.goto(`/eo/${allRunnable!.typeKey}/${allRunnable!.id}`);

    const move = page.getByRole("button", { name: /^Move/ }).first();
    // The control is NOT marked unavailable: "no step exists" is not known.
    await expect(move).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("#eo-no-moves-reason")).toHaveCount(0);
    await move.click();

    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(
      "The available steps could not be loaded",
    );
    await expect(alert).toContainText("problem reaching the server");
    // AND NOT THE WORKFLOW SENTENCE. A failure test that renders it would
    // pass while the defect ships.
    await expect(page.getByText(/no transitions are available/i)).toHaveCount(
      0,
    );

    // The retry is real: the next read succeeds and the steps appear.
    failing = false;
    const retry = page.getByRole("button", { name: /^Retry$/ });
    await expect(retry).toBeVisible();
    await retry.click();

    await expect(page.locator("div.grid > button")).toHaveCount(
      allRunnable!.count,
    );
    await expect(alert).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("steps still on the wire are not reported as no steps at all", async ({
    page,
    request,
    loginAs,
  }) => {
    // The same lie in the other direction, and reachable: the Move control
    // can be pressed before the first transitions read has landed. Only the
    // LATENCY is simulated — the window is real and happens at full speed
    // too; the delay makes it observable rather than a race.
    const { allRunnable } = await discover(request);
    expect(allRunnable).toBeDefined();

    await page.route("**/api/v1/eo-records/*/transitions", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return route.continue();
    });

    await loginAs("admin");
    await page.goto(`/eo/${allRunnable!.typeKey}/${allRunnable!.id}`);
    await page.getByRole("button", { name: /^Move/ }).first().click();

    // While the answer is in flight the modal says the read is running...
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByText(/no transitions are available/i)).toHaveCount(
      0,
    );

    // ...and then the server's own steps arrive.
    await expect(page.locator("div.grid > button")).toHaveCount(
      allRunnable!.count,
      { timeout: 10000 },
    );

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
