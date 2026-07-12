# Rose Heading Size Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить no-op размеров заголовка ContactForm, Gallery и Collections в legacy Rose renderer без изменения revision schema.

**Architecture:** В `themes/rose/src/lib/heading-size.ts` появится маленький pure resolver и генератор локальных CSS variables. Три Astro renderer'а явно выбирают правильный источник props и передают переменные inline; section-local CSS остаётся единственной точкой применения размера к `NtSectionHeading`.

**Tech Stack:** Astro 4, TypeScript, Jest, Playwright, pnpm 10/Corepack.

## Global Constraints

- Изменять только Rose renderer boundary, tests и эти design/plan docs.
- Не менять Puck schemas, migrations, revision payloads, другие темы или theme-base.
- Desktop/mobile mapping: small `17/12px`, medium `20/14px`, large `24/17px`.
- Gallery precedence: top-level `headingSize` перед legacy `heading.size`.
- Contact precedence: nested `heading.size` перед legacy top-level `headingSize`.
- Collections использует top-level `headingSize`.
- Production code пишется только после ожидаемого RED.
- Save/publish в live constructor не использовать.
- Не изменять исходный dirty worktree.

---

### Task 1: Shared resolver and ContactForm regression

**Files:**

- Create: `themes/rose/src/lib/heading-size.ts`
- Create: `src/generator/__tests__/rose-heading-size.spec.ts`
- Modify: `themes/rose/src/components/sections/Contacts.astro`

**Interfaces:**

- Produces: `type RoseHeadingSize = 'small' | 'medium' | 'large'`.
- Produces: `resolveRoseHeadingSize(topLevel, nested, precedence): RoseHeadingSize`.
- Produces: `roseHeadingStyle(prefix, size): string` returning desktop/mobile variables.

- [ ] **Step 1: Write the failing ContactForm test**

Add assertions that nested `large` resolves to `large`, produces `--contacts-heading-size:24px` and `--contacts-heading-size-mobile:17px`, and that `Contacts.astro` wires `headingSizeStyle` to the heading wrapper.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm exec jest src/generator/__tests__/rose-heading-size.spec.ts --runInBand`

Expected: FAIL because `themes/rose/src/lib/heading-size.ts` does not exist or ContactForm is not wired.

- [ ] **Step 3: Implement the minimal helper**

Use this public contract:

```ts
export type RoseHeadingSize = "small" | "medium" | "large";
export type HeadingSizePrecedence = "top-level" | "nested";

export function resolveRoseHeadingSize(
  topLevel: unknown,
  nested: unknown,
  precedence: HeadingSizePrecedence,
): RoseHeadingSize;

export function roseHeadingStyle(prefix: string, size: RoseHeadingSize): string;
```

Normalize invalid/missing values to `medium`; `roseHeadingStyle` returns both `--${prefix}-heading-size` and `--${prefix}-heading-size-mobile` using the global mapping.

- [ ] **Step 4: Wire ContactForm**

Resolve with precedence `nested`, attach the returned style to the local heading wrapper, and update `#contacts-title` desktop/mobile CSS to read the local variables.

- [ ] **Step 5: Run GREEN and compile**

Run:

```bash
corepack pnpm exec jest src/generator/__tests__/rose-heading-size.spec.ts --runInBand
corepack pnpm build:theme-sections rose
```

Expected: new spec PASS; Rose compilation reports 15 sections.

- [ ] **Step 6: Commit**

```bash
git add themes/rose/src/lib/heading-size.ts themes/rose/src/components/sections/Contacts.astro src/generator/__tests__/rose-heading-size.spec.ts
git commit -m "fix(rose): apply contact heading size"
```

### Task 2: Gallery top-level precedence

**Files:**

- Modify: `src/generator/__tests__/rose-heading-size.spec.ts`
- Modify: `themes/rose/src/components/sections/Gallery.astro`

**Interfaces:**

- Consumes: `resolveRoseHeadingSize` and `roseHeadingStyle` from Task 1.

- [ ] **Step 1: Add the failing Gallery test**

Assert that top-level `small` wins over nested `medium`, the style contains `17px/12px`, and Gallery wires the style to `.gallery-section-heading`.

- [ ] **Step 2: Run RED**

Run the focused Jest spec. Expected: FAIL because current Gallery uses nested-first precedence and dynamic class variables.

- [ ] **Step 3: Implement minimal Gallery fix**

Resolve with precedence `top-level`, remove heading-size custom-property Tailwind fragments from `headWrapCls`, attach `roseHeadingStyle('gallery', headingSize)` inline, and update CSS to read `--gallery-heading-size-mobile` on mobile.

- [ ] **Step 4: Run GREEN and compile**

Run focused Jest spec and `corepack pnpm build:theme-sections rose`. Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add themes/rose/src/components/sections/Gallery.astro src/generator/__tests__/rose-heading-size.spec.ts
git commit -m "fix(rose): honor gallery heading size control"
```

### Task 3: Collections compiled CSS bridge

**Files:**

- Modify: `src/generator/__tests__/rose-heading-size.spec.ts`
- Modify: `themes/rose/src/components/sections/Collections.astro`

**Interfaces:**

- Consumes: shared resolver/style helper from Task 1.

- [ ] **Step 1: Add the failing Collections test**

Assert top-level `large` produces `24px/17px`, Collections wires an inline local style, and no heading-size arbitrary custom-property utility remains in `headWrapCls`.

- [ ] **Step 2: Run RED**

Run the focused Jest spec. Expected: FAIL because current Collections only uses dynamically concatenated Tailwind variable utilities.

- [ ] **Step 3: Implement minimal Collections fix**

Resolve top-level size, attach `roseHeadingStyle('collections', size)` to the heading wrapper, remove only heading-size variable fragments from class composition, preserve subtitle/alignment classes, and update CSS to read the local desktop/mobile variables.

- [ ] **Step 4: Run GREEN and compile**

Run focused Jest spec, existing `resolve-block-scheme.spec.ts`, and Rose compilation. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add themes/rose/src/components/sections/Collections.astro src/generator/__tests__/rose-heading-size.spec.ts
git commit -m "fix(rose): apply collections heading size"
```

### Task 4: Browser verification and branch readiness

**Files:**

- Create: `e2e/rose-heading-size.spec.ts`
- Modify: `docs/superpowers/specs/2026-07-12-rose-heading-size-fixes-design.md` only if verification reveals an actual design correction.

**Interfaces:**

- Consumes compiled `dist/theme-sections/rose` modules and shared mapping.

- [ ] **Step 1: Add local Playwright functional coverage**

The self-contained spec compiles Rose sections in `beforeAll`, renders ContactForm/Gallery/Collections with Astro Container, serves the HTML on an ephemeral local port, and checks computed heading sizes at `1280` and `375` widths for small/medium/large.

- [ ] **Step 2: Run Playwright**

Run: `corepack pnpm exec playwright test e2e/rose-heading-size.spec.ts --workers=1`

Expected: all size permutations pass with exact computed pixels.

- [ ] **Step 3: Run final local verification**

Run:

```bash
corepack pnpm exec jest src/generator/__tests__/rose-heading-size.spec.ts src/services/__tests__/resolve-block-scheme.spec.ts --runInBand
corepack pnpm build:theme-sections rose
corepack pnpm exec playwright test e2e/rose-heading-size.spec.ts --workers=1
git diff --check
```

- [ ] **Step 4: Prepare post-deploy live restore-safe smoke**

Record the exact post-deploy scenario: use the existing authenticated Playwright state outside git; for each of ContactForm, Gallery and Collections capture full block props, select an adjacent size, wait for preview/revision `201`, assert computed desktop/mobile size, restore, reload, and require full props equality. Save screenshots under `/tmp/merfy-rose-qa/fixed-heading-sizes/`. Do not click Save/publish. Do not run this against production before the branch is deployed, because it would exercise the old renderer.

Post-deploy runbook (execute only after this branch is deployed):

1. Load the existing authenticated Playwright storage state from its untracked path; create `/tmp/merfy-rose-qa/fixed-heading-sizes/` and open the Rose constructor without clicking Save/publish.
2. For each block in order (`ContactForm`, `Gallery`, `Collections`), read and deep-clone the complete original block props from the current revision before editing anything.
3. Select an adjacent heading size (`small → medium`, `medium → large`, `large → medium`), wait for both the preview update and the revision request to return HTTP `201`, then assert the heading's computed `font-size` at viewport widths `1280` and `375` against `17/12`, `20/14`, or `24/17px`.
4. Save desktop and mobile evidence as `/tmp/merfy-rose-qa/fixed-heading-sizes/<block>-<size>-desktop.png` and `/tmp/merfy-rose-qa/fixed-heading-sizes/<block>-<size>-mobile.png`.
5. Restore the complete cloned props (not only the size field), again wait for preview and revision HTTP `201`, reload the constructor, and require deep equality between the reloaded full props and the original clone before continuing to the next block.
6. If any assertion or restore fails, stop immediately and retain the screenshots/logs; do not leave the block modified and do not proceed to another block until full original props equality is restored.

- [ ] **Step 5: Commit verification assets**

```bash
git add e2e/rose-heading-size.spec.ts docs/superpowers/specs/2026-07-12-rose-heading-size-fixes-design.md docs/superpowers/plans/2026-07-12-rose-heading-size-fixes.md
git commit -m "test(rose): cover heading size settings"
```

- [ ] **Step 6: Final review and push**

After task-level and whole-branch review are clean, push `codex/fix-rose-heading-sizes`. Do not open a PR without a separate request.
