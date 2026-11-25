import { test, expect, USERS } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

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
 * blocked case is genuinely reachable against the pilot seed: `IN-2026-0003` cannot close
 * while `IN-2026-0003-R2` and `TSK-2026-00005` are open, and 23 of the 48
 * records offer no step from their current state.
 */

const API = "http://localhost:8080/api/v1";

interface Discovered {
  /** A record whose offered steps include one an open child blocks. */
  blocked?: { id: string; typeKey: string; references: string[] };
  /** A record with no step at all out of its current state. */
  noMoves?: { id: string; typeKey: string };
}

async function token(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email: USERS.admin.email, password: USERS.admin.password },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.token;
}

async function discover(request: APIRequestContext): Promise<Discovered> {
  const jwt = await token(request);
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
      blocked?: boolean;
      blocking_references?: string[];
    }[] = (await res.json()).data ?? [];

    if (offered.length === 0) {
      found.noMoves ??= { id: record.id, typeKey };
      continue;
    }
    const blocker = offered.find((tr) => tr.blocked === true);
    if (blocker && (blocker.blocking_references ?? []).length > 0) {
      found.blocked ??= {
        id: record.id,
        typeKey,
        references: blocker.blocking_references ?? [],
      };
    }
    if (found.blocked && found.noMoves) break;
  }
  return found;
}

/** The app in Arabic, set the way the language switcher sets it. */
async function useArabic(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("app_language", "ar");
  });
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
});
