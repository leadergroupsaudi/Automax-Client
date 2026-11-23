# Task D3 — Shared selects stop leaking left-to-right in Arabic

Branch: `rnd/temporal-workflows` · Plan: `2026-11-23-eo-pilot-usability`

`src/ui/SelectInput.tsx` / `src/ui/TreeSelect.tsx` named in the brief actually live at
`src/components/ui/`. Those are the two files changed; `src/ui/` holds an unrelated
shadcn-style `select.tsx` that was not touched.

## What changed

### `src/components/ui/SelectInput.tsx` (4 edits)

| Before | After | Why |
| --- | --- | --- |
| trigger right-controls `ml-2` | `ms-2` | margin was always on the physical left, so in RTL it sat between the chevron and the panel edge instead of between the chevron and the label |
| search icon `absolute left-2.5` | `absolute start-2.5` | magnifier was pinned to the left of a right-aligned Arabic search field |
| search input `pl-8 pr-3` | `ps-8 pe-3` | the 2rem gutter reserved for the icon was on the wrong side in RTL; Arabic text ran into the right border while 2rem of dead space sat on the left |
| option row `text-left` | `text-start` | Arabic option labels were left-aligned inside a `flex-1` span, leaving a wide gap between the label and the check indicator |

The `ChevronDown` in this component is a *vertical* chevron (it flips `rotate-180`
on open). Vertical chevrons are direction-neutral, so it was deliberately left alone.

### `src/components/ui/TreeSelect.tsx` (3 edits)

| Before | After | Why |
| --- | --- | --- |
| `style={{ paddingLeft: \`${level * 20 + 12}px\` }}` | `style={{ paddingInlineStart: … }}` | depth indentation was applied on the physical left, so in RTL nested nodes indented *away* from the text |
| `<ChevronRight … />` | `<ChevronRight … rtl:rotate-180 />` | horizontal chevron; "collapsed, opens toward the content" points left in RTL |
| trigger right-controls `ml-2` | `ms-2` | same as SelectInput |

`ChevronsUpDown` (the trigger affordance) is vertical and was left alone. `text-start`
and `ms-1` were already present elsewhere in this file, so logical utilities are the
established idiom here.

Tailwind is **v4.1.18** (`package.json`), which ships `ps-*`/`pe-*`/`ms-*`/`me-*`/
`start-*`/`end-*`/`text-start` and the `rtl:` variant as core utilities — no config
change was needed. Verified at runtime, not assumed (see below).

Nothing else in either file was changed: no refactor, no restyle, no behavioural change.

## Verification

Playwright chromium (`node_modules/playwright/index.mjs`), headless, 1440×1000,
against the already-running Vite dev server on `:5173` and API on `:8080`, logged in as
`admin@automax.com`. Language forced via `localStorage['app_language']` before load,
which is what `src/i18n/index.ts` reads to set `document.documentElement.dir`.

Screens used:

- **EO create form:** `/eo/eo_incoming_correspondence/new` — chosen after probing all
  nine EO registers; it renders the most of both components (6 × `SelectInput`,
  3 × `TreeSelect`).
- **Non-EO screen:** `/goals/new` (`src/pages/admin/GoalCreatePage.tsx`) — confirmed by
  DOM probe to render 4 live `SelectInput` comboboxes, not assumed. Captured **before**
  the edit as well as after. `/eo/.../new` in English was also captured both sides, which
  additionally gives a before/after for `TreeSelect` in LTR.

Screenshots in
`/tmp/claude-1000/-home-ks-lig-cintrix/115a9cf0-c151-4a35-b57a-ea44e666a33c/scratchpad/d3shots/`
(`before-*` / `after-*`, every combobox opened individually plus the tree panel).

### 1. Arabic EO form — the bug, and the fix

`before-1-eo-arabic-select0-open.png`: options عادي / عالي / عاجل hug the **left** edge
of the panel while their check indicators sit at the far right — a ~450px gap.
`before-1-eo-arabic-select3-open.png`: the magnifier sits at the far left of the search
box with the Arabic placeholder بحث jammed against the right border.

`after-1-eo-arabic-select0-open.png` / `after-1-eo-arabic-select3-open.png`: options are
right-aligned next to their indicators; the magnifier has moved to the right of the
search box beside بحث, with the 2rem gutter now on the right.

### 2. English EO form — unchanged

`after-2-eo-english-*.png` are **pixel-identical** to `before-2-eo-english-*.png` for the
form, the tree panel and 4 of 6 dropdowns. The remaining 3 open dropdowns differ by
3, 61 and 4 pixels out of 1,440,000, all with `maxDelta: 4/255`, all on the rounded
corners of the search input's border — antialiasing, not layout. Visual crop
(`crop-2-eo-english-select3-open.png`, before over after at 2×) is indistinguishable.

### 3./4. Non-EO screen (`/goals/new`, English) — unchanged

`before-3-goals-english-form.png` → `after-3-goals-english-form.png` and all three open
dropdowns: **0 differing pixels** out of 1,440,000.

### Computed-style diff (the stronger evidence)

A second pass recorded `getBoundingClientRect` plus padding/margin/text-align/inset for
every trigger, option row, search input, search icon and tree row, before and after, on
all three screens. In the two **LTR** screens the only differences in the entire dump are:

```
textAlign:  "left"              -> "start"            (resolves to left in LTR)
inline:     "padding-left:12px" -> "padding-inline-start:12px"
```

Every rect, every `paddingLeft`/`paddingRight`/`marginLeft`/`marginRight`/`left`/`right`
is byte-identical. In the **RTL** screen the dump shows exactly the intended flips:
search icon `left:10px → right:10px`, search input `padding-left:32px → padding-right:32px`.

### Chevron rotation and nested indentation

The seeded department tree is one root with no children, so `ChevronRight` and
`level > 0` rows never render against this data. Both were verified directly in the
running page instead, by measuring computed style on elements carrying the exact classes:

| | LTR | RTL |
| --- | --- | --- |
| `rtl:rotate-180` chevron | `transform: none` | `matrix(-1, 0, 0, -1, 0, 0)` |
| row `padding-inline-start: 52px` (level 2) | `padding-left: 52px`, `padding-right: 12px` | `padding-left: 12px`, `padding-right: 52px` |

LTR values are identical to what `paddingLeft: 52px` produced before.

### Gates

- `npm run type-check` — clean.
- `npm run lint` — `0 errors` on both changed files (5 pre-existing `no-unused-vars`
  warnings on type-signature parameter names). Repo-wide the run ends
  `1095 problems (2 errors, 1093 warnings)`; **both errors are in `e2e/fixtures.ts`**
  (`react-hooks/rules-of-hooks` on `loginAs`, and "Cannot access refs during render"),
  a file this task did not touch and which is unmodified in the working tree — they are
  pre-existing on the branch.

## Noted, not fixed (out of scope for D3)

1. `e2e/fixtures.ts` has 2 pre-existing ESLint errors, so a repo-wide `npm run lint`
   does not exit 0 on this branch regardless of this change.
2. `TreeSelect` renders a selected path as `selectedPath.join(" > ")`. The `>`
   separator does not mirror in RTL, so an Arabic breadcrumb still reads
   `parent > child` left-to-right. A `›`/`‹` chosen by direction, or a bidi isolate,
   would fix it — a content decision, not a styling one.
3. `MultiSelect.tsx`, `MultiTreeSelect.tsx` and `HierarchicalTreeSelect.tsx` are used by
   the same EO form and were not in scope; they have not been audited for the same
   physical-property pattern.
4. `package-lock.json` is dirty in the working tree from earlier work. It was
   deliberately **not** staged.
