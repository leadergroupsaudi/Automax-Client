import { test, expect, USERS } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * The children tab of the EO record detail page.
 *
 * WHY THIS FILE EXISTS. The history tab beside it learned to tell three
 * sentences apart — "this record has no history", "this page is past the end"
 * and "the read failed" — while this tab keyed its empty state on
 * `children.length === 0` and so said "This record has no children." for all
 * three. That is a false statement about a statutory register, and it is one
 * click from a tab where the same sentence means what it says: an officer
 * learns the empty state's meaning on History and carries that belief here.
 *
 * WHAT IS DRIVEN AND WHAT IS NOT:
 *
 *  DRIVEN, against the seeded register: the childless record's empty state,
 *  the page carried from a parent onto a child, and the cross-record
 *  placeholder. Only the page SIZE is rewritten where a seeded record is too
 *  small to page at the register's own limit of 20 — every row rendered, and
 *  every total, is the server's own answer.
 *
 *  SERVER BYTES, OUTGOING PARAMETERS REWRITTEN: the page past the end.
 *  eoClampPaging clamps `page` to >= 1 and never to `total_pages`, so asking
 *  for a page beyond the last is a SUCCESSFUL read returning an empty array
 *  with the record's real total. Nothing is fabricated; the request is.
 *
 *  INTERCEPTED, because the seed cannot produce it: a FAILED read.
 *
 * Nothing here names a credential: the shared fixtures own the accounts.
 */

const API = "http://localhost:8080/api/v1";

/** The size the children tab is driven at, so a seeded record pages at all. */
const PAGED = 3;

interface ChildrenFixture {
  id: string;
  typeKey: string;
  reference: string;
  total: number;
}

interface Discovered {
  /** A record with no children at all: the only genuinely empty state. */
  childless: ChildrenFixture;
  /**
   * A parent whose children need more than one page at PAGED a page, together
   * with one of its children that (a) sits on page two and (b) has children of
   * its own that all fit on ONE such page. That pair is what carries a page
   * number from a record that has it onto a record that does not — and the
   * child having children is what makes "This record has no children." a lie
   * rather than merely a wrong-looking screen.
   */
  nested: { parent: ChildrenFixture; child: ChildrenFixture };
}

async function token(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email: USERS.admin.email, password: USERS.admin.password },
  });
  expect(res.ok(), `login answered ${res.status()}`).toBeTruthy();
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
  const types: { id: string; key: string }[] =
    (await typesRes.json()).data ?? [];
  const keyById = new Map(types.map((ty) => [ty.id, ty.key]));

  const recordsRes = await request.get(`${API}/eo-records?limit=100`, {
    headers,
  });
  expect(recordsRes.ok()).toBeTruthy();
  const records: { id: string; reference: string; record_type_id: string }[] =
    (await recordsRes.json()).data ?? [];

  // A FAILED READ IS NOT AN EMPTY ONE. Taking `.data ?? []` off a refusal
  // would file a record as childless and quietly mis-select every fixture
  // below — the exact class of defect this file is about, in the file itself.
  const childrenOf = async (id: string) => {
    const res = await request.get(
      `${API}/eo-records/${id}/children?limit=100`,
      {
        headers,
      },
    );
    expect(
      res.ok(),
      `GET /eo-records/${id}/children answered ${res.status()}`,
    ).toBeTruthy();
    const body = await res.json();
    return {
      rows: (body.data ?? []) as {
        id: string;
        reference: string;
        record_type_id: string;
      }[],
      total: (body.total_items ?? 0) as number,
    };
  };

  let childless: ChildrenFixture | undefined;
  let nested: Discovered["nested"] | undefined;

  for (const record of records) {
    const typeKey = keyById.get(record.record_type_id);
    if (!typeKey) continue;
    const mine = await childrenOf(record.id);
    const fixture: ChildrenFixture = {
      id: record.id,
      typeKey,
      reference: record.reference,
      total: mine.total,
    };
    if (!childless && mine.total === 0) childless = fixture;

    if (!nested && mine.total > PAGED) {
      // Only the children the server would put on page two or later: the
      // officer has to be able to REACH the link they then follow.
      for (const kid of mine.rows.slice(PAGED)) {
        const kidKey = keyById.get(kid.record_type_id);
        if (!kidKey) continue;
        const theirs = await childrenOf(kid.id);
        if (theirs.total > 0 && theirs.total <= PAGED) {
          nested = {
            parent: fixture,
            child: {
              id: kid.id,
              typeKey: kidKey,
              reference: kid.reference,
              total: theirs.total,
            },
          };
          break;
        }
      }
    }
  }

  // Discovery FAILS rather than skips: a skip reports green, and "the children
  // tab was never exercised" is what must not pass quietly.
  expect(
    childless,
    "every record in this register has children — the empty state is unreachable",
  ).toBeDefined();
  expect(
    nested,
    `no parent has more than ${PAGED} children with one of the later ones having children of its own — the carried-page case is unreachable`,
  ).toBeDefined();
  return { childless: childless as ChildrenFixture, nested: nested! };
}

const childrenTab = (page: Page) =>
  page.getByRole("button", { name: /^(Children|السجلات الفرعية)/ });

const panel = (page: Page) => page.locator("#eo-children-panel");

const rows = (page: Page) => panel(page).locator("tbody > tr");

/** Rewrite only the outgoing page SIZE, so a seeded record pages at all. */
async function pageAtThree(page: Page) {
  await page.route("**/api/v1/eo-records/*/children*", (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("limit", String(PAGED));
    return route.continue({ url: url.toString() });
  });
}

/**
 * The empty sentence, matched EXACTLY.
 *
 * Playwright's string matcher is a case-insensitive substring match, and the
 * failure hint deliberately says "it does not mean this record has no
 * children" — so a loose locator finds the empty sentence inside the very
 * alert that exists to replace it, and the absence assertions below would
 * fail against correct code. Exact matching compares the element's whole text.
 */
const EMPTY_SENTENCE = "This record has no children.";
const emptySentence = (page: Page) =>
  page.getByText(EMPTY_SENTENCE, { exact: true });

test.describe("EO record detail — the children tab", () => {
  test("a record with no children says so, and it is not an error", async ({
    page,
    request,
    loginAs,
  }) => {
    // DRIVEN: the register really does contain childless records, so the one
    // genuinely empty case needs no interception at all.
    const { childless } = await discover(request);

    await loginAs("admin");
    await page.goto(`/eo/${childless.typeKey}/${childless.id}`);

    // No badge: a count of nothing is not worth printing.
    await expect(childrenTab(page).locator("span")).toHaveCount(0);
    await childrenTab(page).click();

    await expect(emptySentence(page)).toBeVisible();
    // An empty record is a FACT ABOUT THE RECORD. Nothing is announced as a
    // problem, and there is nothing to retry.
    await expect(panel(page).locator('[role="alert"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Retry$/ })).toHaveCount(0);
  });

  test("a failed read is announced as a failure, and can be retried", async ({
    page,
    request,
    loginAs,
  }) => {
    // THE DEFECT THIS TEST EXISTS FOR. Keyed on `children.length === 0`, a
    // failed read rendered "This record has no children." permanently, with
    // nothing to press — a statement about the record where the truth was
    // about the network, on the tab beside the one that gets this right.
    const { nested } = await discover(request);
    const fixture = nested.child;

    let failing = true;
    await page.route("**/api/v1/eo-records/*/children*", (route) =>
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
    // No badge off a failed read either: "0" would say "this record has no
    // children" in the one case where the page does not know.
    await expect(childrenTab(page).locator("span")).toHaveCount(0);
    await childrenTab(page).click();

    const alert = panel(page).locator('[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("The children could not be loaded");
    await expect(alert).toContainText("problem reaching the server");

    // AND NOT THE EMPTY STATE. An error-state test that renders the empty
    // state would pass while the defect ships, so it is asserted absent.
    await expect(emptySentence(page)).toHaveCount(0);

    // The retry is real: the next read succeeds and the children appear.
    failing = false;
    const retry = page.getByRole("button", { name: /^Retry$/ });
    await expect(retry).toBeVisible();
    await retry.click();

    await expect(rows(page)).toHaveCount(fixture.total);
    await expect(alert).toHaveCount(0);
    await expect(childrenTab(page).locator("span")).toHaveText(
      String(fixture.total),
    );

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("a page past the end is a position, not a childless record", async ({
    page,
    request,
    loginAs,
  }) => {
    // THE SERVER'S OWN BYTES. Only outgoing request parameters are rewritten:
    // `limit` so a seeded record pages at all, and page 2 -> 9 so the second
    // page really is past the end. The handler clamps `page` to >= 1 and never
    // to `total_pages`, so it answers 200 with an empty array and the record's
    // REAL total — which is what tells the two guards apart. The empty-record
    // test cannot catch this: it has total 0, which both guards treat alike.
    const { nested } = await discover(request);
    const fixture = nested.parent;

    await page.route("**/api/v1/eo-records/*/children*", (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("limit", String(PAGED));
      if (url.searchParams.get("page") === "2")
        url.searchParams.set("page", "9");
      return route.continue({ url: url.toString() });
    });

    await loginAs("admin");
    await page.goto(`/eo/${fixture.typeKey}/${fixture.id}`);
    await childrenTab(page).click();
    await expect(rows(page)).toHaveCount(PAGED);

    await page.getByRole("button", { name: /^Next$/ }).click();

    // THE DEAD END HAS TO BE ON SCREEN BEFORE ANYTHING IS ASSERTED ABSENT.
    // The pager reads local state while the previous page's rows are held, so
    // an "is the empty sentence absent?" check fired immediately after Next
    // passes while the panel still shows page one — whatever the component
    // does. The wrong guard renders the empty sentence BESIDE this notice.
    await expect(panel(page)).toContainText("past the end of the list");
    await expect(emptySentence(page)).toHaveCount(0);
    // And the badge still knows the record is not childless.
    await expect(childrenTab(page).locator("span")).toHaveText(
      String(fixture.total),
    );

    // The pager lives inside the non-empty branch, so this button is the only
    // way out of the dead end — and it works.
    const out = page.getByRole("button", { name: /^Go to the first page$/ });
    await expect(out).toBeVisible();
    await out.click();
    await expect(rows(page)).toHaveCount(PAGED);
    await expect(panel(page)).not.toContainText("past the end of the list");

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("a page number chosen on one record does not follow the officer to another", async ({
    page,
    request,
    loginAs,
  }) => {
    // DRIVEN NAVIGATION, SERVER BYTES. The route element is reused between
    // records — App.tsx renders it with no `key` — so `childrenPage` survived
    // a child link while only `historyPage` was being reset. An officer on a
    // parent's page two who followed a child with children of its own read
    // "This record has no children." over a record that has them.
    const { nested } = await discover(request);
    const { parent, child } = nested;

    await pageAtThree(page);

    await loginAs("admin");
    await page.goto(`/eo/${parent.typeKey}/${parent.id}`);
    await childrenTab(page).click();
    await expect(panel(page)).toContainText("Page 1 of");
    await page.getByRole("button", { name: /^Next$/ }).click();
    await expect(panel(page)).toContainText("Page 2 of");

    // Follow a child, the way an officer does.
    await page.getByRole("link", { name: child.reference }).click();
    await page.waitForURL(`**/${child.id}`);

    // The child's own children, from ITS first page.
    await expect(rows(page)).toHaveCount(child.total);
    await expect(emptySentence(page)).toHaveCount(0);
    await expect(panel(page)).not.toContainText("past the end of the list");
    await expect(childrenTab(page).locator("span")).toHaveText(
      String(child.total),
    );

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("one record's children never render under another record's header", async ({
    page,
    request,
    loginAs,
  }) => {
    // `keepPreviousData` is per-observer, not per-key: when the id changes
    // under a mounted page it hands back the PREVIOUS RECORD's rows, and its
    // total on the tab's badge, unmarked. The history tab was given a
    // record-id-checked placeholder for this; its sibling kept the raw one.
    //
    // Only the child's LATENCY is simulated — the staleness is real and
    // happens at full speed too; the delay makes the window observable rather
    // than a race.
    const { nested } = await discover(request);
    const { parent, child } = nested;
    expect(
      child.total,
      "the parent and the child must differ in how many children they have, or a leaked total would be indistinguishable",
    ).not.toBe(parent.total);

    await page.route("**/api/v1/eo-records/*/children*", async (route) => {
      if (route.request().url().includes(child.id)) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      return route.continue();
    });

    await loginAs("admin");
    await page.goto(`/eo/${parent.typeKey}/${parent.id}`);
    await childrenTab(page).click();
    await expect(rows(page)).toHaveCount(parent.total);
    await expect(childrenTab(page).locator("span")).toHaveText(
      String(parent.total),
    );

    await page.getByRole("link", { name: child.reference }).click();
    await page.waitForURL(`**/${child.id}`);

    // While the child's read is in flight the parent's total is NOT on the
    // child's tab...
    await expect(childrenTab(page).locator("span")).toHaveCount(0);
    // ...and the parent's rows are not under the child's header.
    await expect(panel(page).locator("table")).toHaveCount(0);
    await expect(emptySentence(page)).toHaveCount(0);

    // Then the child's own children arrive.
    await expect(rows(page)).toHaveCount(child.total, { timeout: 10000 });
    await expect(childrenTab(page).locator("span")).toHaveText(
      String(child.total),
    );

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
