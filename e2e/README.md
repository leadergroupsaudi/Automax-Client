# End-to-end tests

Playwright only. There is no unit-test runner in this repository: a pure module
that needs pinning gets a **browser-less contract spec** run by Playwright (see
`eo-blocking-contract.spec.ts` and `eo-history-contract.spec.ts`), which keeps
one runner and one report instead of two.

## Running them

| Command                        | What it runs                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `npm run test:e2e`             | The `chromium` project — everything except the §7.11 tests |
| `npm run test:e2e:restricted`  | The `eo-restricted` project — the §7.11 tests only         |
| `npm run test:e2e:ui`          | The `chromium` project in the Playwright UI                |
| `npm run test:e2e:headed`      | The `chromium` project, headed                             |

The default run is expected to be **green on a clean checkout**. If it is not,
that is a defect, not a missing fixture.

### What the suite needs

- A dev server. Playwright starts `npm run dev` itself and reuses one already
  on `http://localhost:5173`.
- **A live backend on `http://localhost:8080`**, seeded with the EO pilot
  register. Most specs discover their own fixtures by asking that server what
  it actually holds — which record has a blocked transition, which has the
  longest audit trail, which parent has a child with a shorter one — rather
  than naming an id that rots when the seed is rebuilt. Discovery **fails**
  rather than skips when nothing qualifies: a skip reports green, and "the
  case this feature exists for was never exercised" is precisely what must
  not pass quietly.

The ordinary accounts come from `fixtures.ts`.

## The §7.11 restricted-officer fixture

Three tests in `eo-transition-blocked.spec.ts` cannot run as any account this
repository can ship. They are tagged `@eo-restricted`, excluded from the
default project, and own the `eo-restricted` project:

```bash
EO_RESTRICTED_EMAIL=... EO_RESTRICTED_PASSWORD=... npm run test:e2e:restricted
```

With the variables unset, that project **fails and says what it wanted**. It
does not skip, deliberately — a skip reports green, and these three are the
only exercise the confidentiality split gets. Keeping the failure but moving it
out of the default run is the whole point of the split: the default suite stays
readable, and asking for §7.11 verification gets a loud answer either way.

### Why an account rather than a mock

`blocking_hidden_count` is only ever non-zero for a caller the register
genuinely conceals a record from. Manufacturing the payload would assert
against bytes the test itself wrote and would prove nothing about the server
that produces them.

### Why no credentials are in the repository

A working login for a live account does not belong in a tracked file, however
local the database. One was purged from this repository's history. Supply the
account by environment variable; do not add it to `fixtures.ts`, to a spec, or
to a comment.

### Provisioning the account

Create a user that:

- holds `eo:view`, `eo:transition`, and the per-type `view` / `update` codes
  for the register containing the blocked record (e.g.
  `eo:eo_incoming_correspondence:*`). The `Executive Office` role is the usual
  starting point. Without `eo:transition` it cannot attempt the move that is
  refused, and one of the three tests exists to read that refusal.
- does **not** hold `eo:records:view_all_bodies`. That oversight grant
  short-circuits `applyEORecordVisibility`, so every blocker becomes visible,
  the hidden count is permanently zero, and the "named blocker plus concealed
  blocker" shape is unreachable — the tests would then fail for a reason that
  has nothing to do with the code.
- belongs to **no body that owns a blocking child**. Membership of the owning
  body makes that child visible and, again, nothing is concealed. A user with
  no department at all satisfies this.
- **can see the parent record**. It must see the record whose move is blocked
  while not seeing at least one of that record's open children; that asymmetry
  *is* the case under test.

The assertions name what they wanted when the account is wrong, so a mistake
here is reported rather than silently skipped.

## Conventions these specs follow

- **Driven, not manufactured, wherever the seed allows it.** Each spec states
  in its header what is driven against the live register and what is
  intercepted, and why the intercepted cases cannot be driven (an empty audit
  trail, a failed read, a page size no seeded record reaches). A test that
  asserts against a payload it built itself proves nothing about the contract
  it is meant to pin.
- **Writes are intercepted**, so running the suite does not drift the measured
  demo baseline. The one real write any spec attempts is a transition the
  server refuses.
- **Failures are loud.** `expect(res.ok(), ...)` on every discovery read: a
  failed read filed as an empty one mis-selects fixtures and can leave a test
  passing over the defect it was written for.
- **Type-checked.** `e2e/` is covered by `tsconfig.e2e.json`, so
  `npm run type-check` and `npm run build` see these files.
