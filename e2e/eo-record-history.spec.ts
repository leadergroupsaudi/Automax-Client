import { test, expect, USERS } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";
import type { EoRecordHistoryEntry } from "../src/types/eoRecord";

/**
 * Task F2 — the history tab, driven against the live register.
 *
 * WHAT IS DRIVEN AND WHAT IS NOT, stated up front because the difference is
 * the whole evidential value of this file.
 *
 *  DRIVEN, against the seeded database: the trail itself — who, when, from →
 *  to, the comment — its order, the tab's count badge, the create row, and
 *  the Arabic reading of all of it.
 *
 *  INTERCEPTED, because the seed cannot produce them: an EMPTY trail (all 48
 *  seeded records have history; measured, not assumed), a FAILED read, and
 *  PAGING (the tab pages at the register's size, which no seeded record
 *  reaches — the interception rewrites the limit and serves the server's own
 *  bytes back). Creating records to manufacture these would drift a measured
 *  demo baseline.
 *
 *  UNIT-PINNED in `eo-history-contract.spec.ts`: the actor shapes the seed
 *  never produces — a system action, a purged user — and the step shapes it
 *  never produces.
 *
 * Nothing here names a credential: the shared fixtures own the accounts.
 */

const API = "http://localhost:8080/api/v1";

interface HistoryFixture {
  id: string;
  typeKey: string;
  reference: string;
  rows: EoRecordHistoryEntry[];
  total: number;
}

interface Discovered {
  /** The longest trail in the register: what the tab is exercised against. */
  richest: HistoryFixture;
  /** A record that has a trail AND a step its reader can actually take. */
  movable?: HistoryFixture;
}

async function token(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email: USERS.admin.email, password: USERS.admin.password },
  });
  expect(res.ok(), `login answered ${res.status()}`).toBeTruthy();
  return (await res.json()).data.token;
}

/**
 * The register's longest trail, discovered rather than named.
 *
 * A test that asserts against a payload it built itself proves nothing about
 * the route it is meant to consume, and a hardcoded id rots the moment the
 * seed is rebuilt. Discovery FAILS rather than skips when nothing qualifies:
 * a skip reports green, and "the history tab was never exercised" is exactly
 * what must not pass quietly.
 */
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
  const types: { id: string; key: string }[] =
    (await typesRes.json()).data ?? [];
  const keyById = new Map(types.map((ty) => [ty.id, ty.key]));

  const recordsRes = await request.get(`${API}/eo-records?limit=100`, {
    headers,
  });
  expect(recordsRes.ok()).toBeTruthy();
  const records: { id: string; reference: string; record_type_id: string }[] =
    (await recordsRes.json()).data ?? [];

  let best: HistoryFixture | null = null;
  let movable: HistoryFixture | undefined;
  for (const record of records) {
    const typeKey = keyById.get(record.record_type_id);
    if (!typeKey) continue;
    const res = await request.get(
      `${API}/eo-records/${record.id}/history?limit=20`,
      { headers },
    );
    // A FAILED READ IS NOT AN EMPTY ONE — taking `.data ?? []` off a refusal
    // would quietly select a worse fixture, or none.
    expect(
      res.ok(),
      `GET /eo-records/${record.id}/history answered ${res.status()}`,
    ).toBeTruthy();
    const body = await res.json();
    const total: number = body.total_items ?? 0;
    const fixture: HistoryFixture = {
      id: record.id,
      typeKey,
      reference: record.reference,
      rows: body.data ?? [],
      total,
    };
    if (!best || total > best.total) best = fixture;

    // The move test needs a record that has BOTH a trail and a step that can
    // be taken: the longest trail in this register belongs to a closed record
    // that offers none.
    if (!movable && total > 0) {
      const trRes = await request.get(
        `${API}/eo-records/${record.id}/transitions`,
        { headers },
      );
      expect(
        trRes.ok(),
        `GET /eo-records/${record.id}/transitions answered ${trRes.status()}`,
      ).toBeTruthy();
      const offered: { blocked?: boolean }[] = (await trRes.json()).data ?? [];
      if (offered.some((tr) => tr.blocked !== true)) movable = fixture;
    }
  }

  expect(
    best && best.total > 1,
    "no record in this register has a history trail — the tab has nothing to show",
  ).toBeTruthy();
  return { richest: best as HistoryFixture, movable };
}

/** The app in Arabic, set the way the language switcher sets it. */
async function useArabic(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("app_language", "ar");
  });
}

const historyTab = (page: Page) =>
  page.getByRole("button", { name: /^(History|السجل الزمني)/ });

const panel = (page: Page) => page.locator("#eo-history-panel");

test.describe("EO record detail — the history tab", () => {
  test("the trail is the server's: who, when, from → to, the comment", async ({
    page,
    request,
    loginAs,
  }) => {
    const { richest: fixture } = await discover(request);

    await loginAs("admin");
    await page.goto(`/eo/${fixture.typeKey}/${fixture.id}`);

    // The tab carries the server's own total, not the length of a page.
    const tab = historyTab(page);
    await expect(tab).toBeVisible();
    await expect(tab.locator("span")).toHaveText(String(fixture.total));

    await tab.click();
    const rows = panel(page).locator("ol > li");
    await expect(rows).toHaveCount(fixture.rows.length);

    // ORDER IS THE SERVER'S. The rows come back newest first with a stable
    // tiebreak, because a create writes several rows sharing one timestamp to
    // the microsecond; re-sorting them client-side would undo the tiebreak and
    // make paging drop rows. Comparing the rendered <time datetime> sequence
    // to the payload's own order is what catches a sort being added.
    const rendered = await panel(page)
      .locator("ol > li time")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("datetime") ?? ""),
      );
    expect(rendered).toEqual(
      fixture.rows.map((r) => new Date(r.created_at).toISOString()),
    );

    // Each row says who, what moved, and what they wrote.
    for (let i = 0; i < fixture.rows.length; i++) {
      const row = fixture.rows[i];
      const li = rows.nth(i);
      const text = await li.innerText();
      expect(row.performed_by_name, "the seed names every actor").not.toBe("");
      expect(text).toContain(row.performed_by_name);
      if (row.to_state_name) expect(text).toContain(row.to_state_name);
      if (row.from_state_id && row.from_state_name)
        expect(text).toContain(row.from_state_name);
      if (row.comment.trim()) expect(text).toContain(row.comment.trim());
    }
  });

  test("a create row reads as an origin, not as a broken arrow", async ({
    page,
    request,
    loginAs,
  }) => {
    const { richest: fixture } = await discover(request);
    const createIndex = fixture.rows.findIndex((r) => r.from_state_id === null);
    expect(
      createIndex,
      "no row in this trail has a null from_state_id — the create case is unreachable",
    ).toBeGreaterThanOrEqual(0);
    const created = fixture.rows[createIndex];

    await loginAs("admin");
    await page.goto(`/eo/${fixture.typeKey}/${fixture.id}`);
    await historyTab(page).click();

    const li = panel(page).locator("ol > li").nth(createIndex);
    await expect(li).toContainText(
      `Record created in ${created.to_state_name}`,
    );
    // No dash standing in for a from-state, and no arrow: the row carries no
    // icon at all. Rendering it as a move would print "— → Received", which
    // reads as a trail with a hole in it.
    await expect(li).not.toContainText("—");
    await expect(li.locator("svg")).toHaveCount(0);

    // A row that really is a move DOES carry the arrow, so the assertion
    // above is about this row and not about the tab drawing no icons at all.
    const moveIndex = fixture.rows.findIndex((r) => r.from_state_id !== null);
    expect(moveIndex).toBeGreaterThanOrEqual(0);
    await expect(
      panel(page).locator("ol > li").nth(moveIndex).locator("svg"),
    ).toHaveCount(1);
  });

  test("an empty trail says nothing has happened — and is not an error", async ({
    page,
    request,
    loginAs,
  }) => {
    // INTERCEPTED, deliberately. Every one of the 48 seeded records has
    // history, so this case cannot be driven, and creating a record to reach
    // it would drift a measured demo baseline. The payload is the envelope
    // the handler really serves for an empty trail: an empty ARRAY with
    // total_items 0 — never a 404.
    const { richest: fixture } = await discover(request);
    await page.route("**/api/v1/eo-records/*/history*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: [],
          page: 1,
          limit: 20,
          total_items: 0,
          total_pages: 0,
        }),
      }),
    );

    await loginAs("admin");
    await page.goto(`/eo/${fixture.typeKey}/${fixture.id}`);
    const tab = historyTab(page);
    // No badge: a count of nothing is not worth printing.
    await expect(tab.locator("span")).toHaveCount(0);
    await tab.click();

    await expect(
      page.getByText("Nothing has been recorded against this record yet."),
    ).toBeVisible();
    // An empty trail is a FACT ABOUT THE RECORD. Nothing is announced as a
    // problem, and there is nothing to retry.
    await expect(panel(page).locator('[role="alert"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Retry$/ })).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("a failed read is announced as a failure, and can be retried", async ({
    page,
    request,
    loginAs,
  }) => {
    // THE DEFECT THIS TEST EXISTS FOR: a statutory register must never tell an
    // officer "nothing has happened to this record" when the truth is "we
    // could not reach the server". One is a fact about the record, the other
    // about the network. The children tab beside this one still renders its
    // permanent empty state on an error; this tab must not.
    const { richest: fixture } = await discover(request);

    let failing = true;
    await page.route("**/api/v1/eo-records/*/history*", (route) =>
      failing
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ success: false, error: "boom" }),
          })
        : route.continue(),
    );

    await loginAs("admin");
    await page.goto(`/eo/${fixture.typeKey}/${fixture.id}`);
    // No badge off a failed read either: "0" would say "nothing has happened"
    // in the one case where the page does not know.
    await expect(historyTab(page).locator("span")).toHaveCount(0);
    await historyTab(page).click();

    const alert = panel(page).locator('[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("The history could not be loaded");
    await expect(alert).toContainText("problem reaching the server");

    // AND NOT THE EMPTY STATE. An error-state test that renders the empty
    // state would pass while the defect ships, so the empty sentence is
    // asserted absent explicitly.
    await expect(
      page.getByText("Nothing has been recorded against this record yet."),
    ).toHaveCount(0);

    // The retry is real: the next read succeeds and the trail appears.
    failing = false;
    const retry = page.getByRole("button", { name: /^Retry$/ });
    await expect(retry).toBeVisible();
    await retry.click();

    const rows = panel(page).locator("ol > li");
    await expect(rows).toHaveCount(fixture.rows.length);
    await expect(alert).toHaveCount(0);
    await expect(historyTab(page).locator("span")).toHaveText(
      String(fixture.total),
    );

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("the trail pages, and the pages do not overlap", async ({
    page,
    request,
    loginAs,
  }) => {
    // INTERCEPTED SIZE, REAL BYTES. The tab pages at the register's own size,
    // which no seeded record reaches (the longest trail is well short of it),
    // so the only thing rewritten here is the `limit` on the way out: every
    // row rendered is the server's own answer for that page, and the pager is
    // driven by the server's total_pages.
    const { richest: fixture } = await discover(request);
    expect(
      fixture.total,
      "the longest trail is too short to page at 3 a page",
    ).toBeGreaterThan(3);

    await page.route("**/api/v1/eo-records/*/history*", (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("limit", "3");
      return route.continue({ url: url.toString() });
    });

    await loginAs("admin");
    await page.goto(`/eo/${fixture.typeKey}/${fixture.id}`);
    await historyTab(page).click();

    const rows = panel(page).locator("ol > li");
    await expect(rows).toHaveCount(3);
    const expectedPages = Math.ceil(fixture.total / 3);
    await expect(panel(page)).toContainText(`Page 1 of ${expectedPages}`);

    // THE BADGE IS THE SERVER'S TOTAL, NOT THE SIZE OF THE PAGE ON SCREEN.
    // This is the children tab's old defect — a parent with thirty children
    // showed twenty and asserted "20" — and it is only visible while a page
    // is smaller than the whole.
    await expect(historyTab(page).locator("span")).toHaveText(
      String(fixture.total),
    );
    expect(fixture.total).toBeGreaterThan(3);

    const firstPage = await panel(page)
      .locator("ol > li time")
      .evaluateAll((n) => n.map((e) => e.getAttribute("datetime") ?? ""));
    expect(firstPage).toEqual(
      fixture.rows.slice(0, 3).map((r) => new Date(r.created_at).toISOString()),
    );

    await page.getByRole("button", { name: /^Next$/ }).click();
    await expect(panel(page)).toContainText(`Page 2 of ${expectedPages}`);
    // THE PAGE NUMBER MOVES BEFORE THE ROWS DO. The pager reads local state
    // while keepPreviousData holds the previous page on screen (exactly as the
    // children tab behaves), so comparing the rows the instant the label
    // changes compares them against the page they have just left — which is
    // how the first draft of this test failed. Wait for the newest row of
    // page two to actually be the newest row of page two.
    const expectedSecond = fixture.rows
      .slice(3, 6)
      .map((r) => new Date(r.created_at).toISOString());
    await expect(panel(page).locator("ol > li time").first()).toHaveAttribute(
      "datetime",
      expectedSecond[0],
    );
    const secondPage = await panel(page)
      .locator("ol > li time")
      .evaluateAll((n) => n.map((e) => e.getAttribute("datetime") ?? ""));
    expect(secondPage).toEqual(expectedSecond);
    // No row appears on both pages: the server's order held across the page
    // boundary, which is what the stable tiebreak is for.
    expect(firstPage.filter((t) => secondPage.includes(t))).toEqual([]);

    await page.getByRole("button", { name: /^Previous$/ }).click();
    await expect(panel(page)).toContainText(`Page 1 of ${expectedPages}`);
    await expect(panel(page).locator("ol > li time").first()).toHaveAttribute(
      "datetime",
      firstPage[0],
    );

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("the trail reads in Arabic, with the actor named in English", async ({
    page,
    request,
    loginAs,
  }) => {
    const { richest: fixture } = await discover(request);
    const created = fixture.rows.find((r) => r.from_state_id === null);
    expect(created).toBeDefined();

    await useArabic(page);
    await loginAs("admin");
    await page.goto(`/eo/${fixture.typeKey}/${fixture.id}`);

    const tab = page.getByRole("button", { name: /السجل الزمني/ });
    await expect(tab).toBeVisible();
    await tab.click();

    // The wording around the row is Arabic...
    await expect(panel(page)).toContainText("أُنشئ السجل في حالة");
    // ...and the ENGLISH default is not what is on screen.
    await expect(panel(page)).not.toContainText("Record created in");

    // THE ACTOR IS NAMED IN ENGLISH IN BOTH LOCALES, because there is no
    // performed_by_name_ar: models.User has no Arabic name column. What must
    // never happen is an empty name where the person should be.
    const first = panel(page).locator("ol > li").first();
    await expect(first).toContainText(fixture.rows[0].performed_by_name);

    // The state names are English too — in the pilot seed every name_ar
    // EQUALS the English name (the states are flagged eo_client_unconfirmed,
    // awaiting the client's sign-off). That is seed data, not a wiring fault:
    // the Arabic wording above proves the locale is live.
    expect(created!.to_state_name_ar).toBe(created!.to_state_name);
    await expect(panel(page)).toContainText(created!.to_state_name);

    // The page is right-to-left, and the trail is inside it.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("a move refetches the trail it has just added a row to", async ({
    page,
    request,
    loginAs,
  }) => {
    // THE WRITE IS INTERCEPTED, so the demo database is not touched: the POST
    // is answered with a success the server never sees. What is being pinned
    // is the CLIENT wiring — that executing a transition invalidates every
    // page of this record's history — because a trail that silently omits the
    // step the officer has just taken is the defect this tab exists to avoid.
    const { movable } = await discover(request);
    expect(
      movable,
      "no record in this register has both a trail and a step that can be taken",
    ).toBeDefined();
    const fixture = movable as HistoryFixture;

    let historyReads = 0;
    page.on("response", (res) => {
      // Matched on the URL and the method only: axios issues these as XHR,
      // and keying on a resourceType of "fetch" made this counter sit at zero
      // for the whole test — which, before the first draft was mutated, would
      // have been indistinguishable from a tab that never refetched.
      if (
        res.url().includes("/eo-records/") &&
        res.url().includes("/history") &&
        res.request().method() === "GET"
      )
        historyReads++;
    });

    await loginAs("admin");
    await page.goto(`/eo/${fixture.typeKey}/${fixture.id}`);
    await historyTab(page).click();
    await expect(panel(page).locator("ol > li").first()).toBeVisible();

    const move = page.getByRole("button", { name: /^Move/ }).first();
    expect(
      await move.getAttribute("aria-disabled"),
      `${fixture.reference} offers no step to take — pick a record that does`,
    ).not.toBe("true");

    await page.route("**/api/v1/eo-records/*/transition", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: {} }),
      }),
    );

    await move.click();
    await page.locator("div.grid > button").first().click();
    await page
      .locator("#eo-transition-comment")
      .fill("e2e: the write is intercepted; nothing is stored");

    const before = historyReads;
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/transition") && r.request().method() === "POST",
      ),
      page.getByRole("button", { name: /confirm/i }).click(),
    ]);

    await expect
      .poll(() => historyReads, {
        message: "the move did not invalidate this record's history",
      })
      .toBeGreaterThan(before);

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
