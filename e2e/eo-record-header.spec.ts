import { test, expect, USERS } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * The "Assigned to" fact in the EO record header (Task F3).
 *
 * WHY THIS FILE EXISTS. The header resolves an assignee's name through
 * `userApi.list` — GET /admin/users — which the server guards with
 * `users:view`. NO EO ROLE HOLDS IT: not Executive Office, EO Administrator,
 * Head of Office, Protocol, L1 Reviewer or Public Relations. So for the very
 * officer this page was written for the request is refused, and the header
 * rendered the bare label "Assigned" on every assigned record, forever —
 * indistinguishable from a value that failed to render, and never once seen,
 * because every drive and screenshot of this plan ran as a super admin.
 *
 * The proper fix is on the server (carrying `assigned_user_name` on the record
 * payload, as `performed_by_name` is carried on a history row) and is not in
 * this wave. What is in this wave is the header not lying: "assigned to
 * nobody" and "assigned to somebody whose name you may not read" are different
 * facts and must not render identically.
 *
 * WHAT IS DRIVEN AND WHAT IS NOT:
 *
 *  DRIVEN, as the shared admin fixture: the unassigned fact, and the resolved
 *  name — the happy path that proves the three branches are told apart by the
 *  data and not by the wording.
 *
 *  INTERCEPTED, in the default project: the refusal, served as the server's
 *  own 403 envelope. A role that cannot read /admin/users cannot be shipped in
 *  this repository (no credential belongs in a tracked file), so the default
 *  suite exercises the RENDERING of the refusal.
 *
 *  DRIVEN, in the `eo-restricted` project: the refusal itself. With a real
 *  §7.11 officer supplied by environment, the 403 is the server's and is
 *  asserted on the wire before the header is read. See `e2e/README.md`.
 */

const API = "http://localhost:8080/api/v1";

/** @see playwright.config.ts — tagged out of the default run. */
const EO_RESTRICTED = "@eo-restricted";

const RESTRICTED_PROVISIONING = [
  "EO_RESTRICTED_EMAIL and EO_RESTRICTED_PASSWORD are not both set.",
  "This test drives the /admin/users refusal as a real Executive Office",
  "officer, which is the only way to prove the header's headline fact is a",
  "placeholder for the role the page exists for. Provision an account per",
  "e2e/README.md and run: npm run test:e2e:restricted",
].join("\n");

function restrictedAccount(): { email: string; password: string } {
  const email = process.env.EO_RESTRICTED_EMAIL;
  const password = process.env.EO_RESTRICTED_PASSWORD;
  expect(Boolean(email && password), RESTRICTED_PROVISIONING).toBe(true);
  return { email: email as string, password: password as string };
}

interface RecordFixture {
  id: string;
  typeKey: string;
  reference: string;
  assignedUserId: string | null;
}

interface Discovered {
  assigned: RecordFixture;
  unassigned: RecordFixture;
  /** The name the server's own directory gives for `assigned`'s assignee. */
  assigneeName: string;
}

async function token(
  request: APIRequestContext,
  who: { email: string; password: string } = USERS.admin,
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

let discovered: Promise<Discovered> | null = null;

function discover(request: APIRequestContext): Promise<Discovered> {
  discovered ??= discoverFresh(request);
  return discovered;
}

async function discoverFresh(request: APIRequestContext): Promise<Discovered> {
  const jwt = await token(request);
  const headers = { Authorization: `Bearer ${jwt}` };

  const typesRes = await request.get(`${API}/admin/eo-record-types`, {
    headers,
  });
  expect(typesRes.ok()).toBeTruthy();
  const keyById = new Map(
    ((await typesRes.json()).data ?? []).map(
      (ty: { id: string; key: string }) => [ty.id, ty.key],
    ),
  ) as Map<string, string>;

  const recordsRes = await request.get(`${API}/eo-records?limit=100`, {
    headers,
  });
  expect(recordsRes.ok()).toBeTruthy();
  const records: {
    id: string;
    reference: string;
    record_type_id: string;
    assigned_user_id: string | null;
  }[] = (await recordsRes.json()).data ?? [];

  const asFixture = (r: (typeof records)[number]): RecordFixture => ({
    id: r.id,
    typeKey: keyById.get(r.record_type_id) as string,
    reference: r.reference,
    assignedUserId: r.assigned_user_id,
  });

  const assigned = records
    .filter((r) => r.assigned_user_id && keyById.has(r.record_type_id))
    .map(asFixture)[0];
  const unassigned = records
    .filter((r) => !r.assigned_user_id && keyById.has(r.record_type_id))
    .map(asFixture)[0];

  expect(
    assigned,
    "no record in this register is assigned to anybody — the fact under test is unreachable",
  ).toBeDefined();
  expect(
    unassigned,
    "every record is assigned — no control case",
  ).toBeDefined();

  // The name the page is supposed to print, read from the same route the page
  // reads, so the happy-path assertion is the server's answer and not a guess.
  const usersRes = await request.get(`${API}/admin/users?page=1&limit=200`, {
    headers,
  });
  expect(usersRes.ok()).toBeTruthy();
  const users: {
    id: string;
    first_name?: string;
    last_name?: string;
    username: string;
  }[] = (await usersRes.json()).data ?? [];
  const u = users.find((x) => x.id === assigned.assignedUserId);
  expect(
    u,
    "the assignee is not in the first page of the directory — pick another fixture",
  ).toBeDefined();
  const assigneeName =
    `${u!.first_name ?? ""} ${u!.last_name ?? ""}`.trim() || u!.username;
  expect(assigneeName.length).toBeGreaterThan(0);

  return { assigned, unassigned, assigneeName };
}

const fact = (page: Page) => page.locator('[data-testid="eo-assignee"]');

/** The app in Arabic, set the way the language switcher sets it. */
async function useArabic(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("app_language", "ar");
  });
}

/** The server's own refusal envelope for a caller without `users:view`. */
const FORBIDDEN = {
  status: 403,
  contentType: "application/json",
  body: JSON.stringify({ success: false, error: "Insufficient permissions" }),
};

test.describe("EO record detail — the assignee fact", () => {
  test("an unassigned record says so", async ({ page, request, loginAs }) => {
    const { unassigned } = await discover(request);
    await loginAs("admin");
    await page.goto(`/eo/${unassigned.typeKey}/${unassigned.id}`);

    await expect(fact(page)).toHaveText("Unassigned");
    // The control case for everything below: "nobody" must not be reachable
    // from a record that IS assigned, and vice versa.
    await expect(fact(page)).not.toContainText("not available to you");
  });

  test("a reader who may read the directory sees the name", async ({
    page,
    request,
    loginAs,
  }) => {
    // DRIVEN. The name is the server's own, read from the same route the page
    // reads; this is what proves the branches below are chosen by the data.
    const { assigned, assigneeName } = await discover(request);
    await loginAs("admin");
    await page.goto(`/eo/${assigned.typeKey}/${assigned.id}`);

    await expect(fact(page)).toContainText(assigneeName);
    await expect(fact(page)).not.toContainText("Unassigned");
    await expect(fact(page)).not.toContainText("not available to you");
  });

  test("a reader refused the directory is told the name is unavailable, not that nothing is assigned", async ({
    page,
    request,
    loginAs,
  }) => {
    // THE DEFECT THIS TEST EXISTS FOR: the bare label "Assigned".
    const { assigned } = await discover(request);
    await page.route("**/api/v1/admin/users*", (route) =>
      route.fulfill(FORBIDDEN),
    );

    await loginAs("admin");
    await page.goto(`/eo/${assigned.typeKey}/${assigned.id}`);

    await expect(fact(page)).toContainText(
      "Assigned — the name is not available to you",
    );
    // NOT the unassigned wording: the record is assigned and the officer must
    // not conclude otherwise.
    await expect(fact(page)).not.toContainText("Unassigned");
    // AND NOT THE OLD CONTENT-FREE LABEL. Reverting the branch renders the
    // bare word and nothing else, so the exact text is pinned.
    await expect(fact(page)).not.toHaveText("Assigned");

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("the refusal reads in Arabic too", async ({
    page,
    request,
    loginAs,
  }) => {
    const { assigned } = await discover(request);
    await page.route("**/api/v1/admin/users*", (route) =>
      route.fulfill(FORBIDDEN),
    );

    await useArabic(page);
    await loginAs("admin");
    await page.goto(`/eo/${assigned.typeKey}/${assigned.id}`);

    // The Arabic sentence, not the English default.
    await expect(fact(page)).toContainText("الاسم غير متاح لك");
    await expect(fact(page)).not.toContainText("not available to you");
    // And it is not the Arabic for "Unassigned" either.
    await expect(fact(page)).not.toContainText("غير مُسنَد");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("a refused directory is not re-read as the officer works the page", async ({
    page,
    request,
    loginAs,
  }) => {
    // A REFUSAL IS AN ANSWER, NOT A FLAKE: `retry: false` and a stale window
    // on this read, so the officer's console does not fill with 403s for a
    // name they will never be shown.
    //
    // WHAT THIS ASSERTS, AND WHAT IT CANNOT. Only GROWTH is asserted, and
    // only while the page stays on one tab. The header shares its query key
    // with EoFieldValue and EoFieldInput, which carry different options, so
    // the number of reads on first load belongs to those siblings as much as
    // to this header — reconciling them is the shared-query-key options
    // mismatch, which is not in this wave. What is this header's own and is
    // checked here: once the refusal has landed, working the page does not
    // ask again.
    const { assigned } = await discover(request);

    const asked: string[] = [];
    await page.route("**/api/v1/admin/users*", (route) => {
      asked.push(route.request().url());
      return route.fulfill(FORBIDDEN);
    });
    // Three a page, so the children tab has something to work.
    await page.route("**/api/v1/eo-records/*/children*", (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("limit", "3");
      return route.continue({ url: url.toString() });
    });

    await loginAs("admin");
    await page.goto(`/eo/${assigned.typeKey}/${assigned.id}`);
    await expect(fact(page)).toContainText("not available to you");
    await page.getByRole("button", { name: /^Children/ }).click();

    // Let every read this page makes finish, including any retry a sibling
    // observer might be running, before measuring.
    await expect
      .poll(async () => {
        const before = asked.length;
        await page.waitForTimeout(1500);
        return asked.length === before;
      })
      .toBe(true);
    const settled = asked.length;
    expect(settled).toBeGreaterThan(0);

    // Work the page. The header re-renders on every one of these. The
    // Details tab is deliberately left alone: it mounts EoFieldValue, which
    // is one of the siblings on the shared key, and its reads would be
    // counted here as though they were the header's.
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /^History/ }).click();
      await page.getByRole("button", { name: /^Children/ }).click();
    }
    await page.waitForTimeout(2000);

    await expect(fact(page)).toContainText("not available to you");
    expect(
      asked.length,
      "the refused read was re-issued while the officer worked the page",
    ).toBe(settled);

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test(
    "the refusal is the server's own, for a real Executive Office officer",
    { tag: EO_RESTRICTED },
    async ({ page, request }) => {
      // DRIVEN END TO END. Nothing is intercepted: a real §7.11 officer signs
      // in, the server really refuses /admin/users, and the header is read
      // off that. This is the case the whole fix is about, and the only one
      // that proves the refusal is not an assumption.
      const who = restrictedAccount();
      const jwt = await token(request, who);
      const headers = { Authorization: `Bearer ${jwt}` };

      // The refusal, from the server, before any browser is involved.
      const refusal = await request.get(`${API}/admin/users?page=1&limit=200`, {
        headers,
      });
      expect(
        refusal.status(),
        `GET /admin/users as ${who.email} answered ${refusal.status()} — this account can read the directory, so it is the wrong fixture for this case`,
      ).toBe(403);

      // A record this officer can see AND that is assigned to somebody.
      const typesRes = await request.get(`${API}/admin/eo-record-types`, {
        headers,
      });
      const keyById = new Map(
        ((await typesRes.json()).data ?? []).map(
          (ty: { id: string; key: string }) => [ty.id, ty.key],
        ),
      ) as Map<string, string>;
      const mine = await request.get(`${API}/eo-records?limit=100`, {
        headers,
      });
      expect(
        mine.ok(),
        `GET /eo-records answered ${mine.status()}`,
      ).toBeTruthy();
      const target = ((await mine.json()).data ?? []).find(
        (r: { assigned_user_id: string | null; record_type_id: string }) =>
          r.assigned_user_id && keyById.has(r.record_type_id),
      ) as { id: string; record_type_id: string } | undefined;
      expect(
        target,
        "this officer can see no assigned record — the header fact cannot be exercised as them",
      ).toBeDefined();

      await page.goto("/login");
      await page.fill('input[name="email"], input[type="email"]', who.email);
      await page.fill(
        'input[name="password"], input[type="password"]',
        who.password,
      );
      await page.click('button[type="submit"]');
      await page.waitForURL("**/dashboard", { timeout: 15000 });

      const [served] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes("/admin/users") && r.status() === 403,
        ),
        page.goto(`/eo/${keyById.get(target!.record_type_id)}/${target!.id}`),
      ]);
      expect(served.status()).toBe(403);

      await expect(fact(page)).toContainText(
        "Assigned — the name is not available to you",
      );
      await expect(fact(page)).not.toHaveText("Assigned");
      await expect(fact(page)).not.toContainText("Unassigned");
      // A 403 on a name is not a session failure.
      expect(page.url()).not.toContain("/login");
    },
  );
});
