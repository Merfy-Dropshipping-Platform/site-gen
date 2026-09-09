# Rose Section Settings Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make four Rose constructor settings render predictably while preserving legacy revisions.

**Architecture:** Normalize legacy values at the Rose render boundary and keep all size mappings in static, testable TypeScript helpers. Source-contract tests exercise the pure mappings and verify each Astro renderer is wired to them; compiled-section and Playwright checks cover integration and responsive behavior.

**Tech Stack:** Astro, TypeScript, Jest, Tailwind CSS, Playwright, pnpm.

## Global Constraints

- Do not migrate or rewrite stored revisions.
- Do not change other themes.
- Do not Save or Publish during production smoke tests.
- Restore constructor props exactly after every production mutation.
- Work only in `/private/tmp/merfy-sites-rose-heading-fix` on `codex/fix-rose-section-settings-batch`.
- Preserve unrelated user changes and never expose credentials or tokens.

---

## File Map

- Create `themes/rose/src/lib/section-settings.ts`: pure normalization and static class/style mappings for the four fixes.
- Create `src/generator/__tests__/rose-section-settings.spec.ts`: focused regression and renderer-wiring tests.
- Modify `themes/rose/src/components/sections/Slideshow.astro`: consume normalized slide position.
- Modify `themes/rose/src/components/Footer.astro`: consume heading/text size mappings.
- Modify `themes/rose/src/components/sections/MultiRows.astro`: normalize canonical and legacy button variants.
- Modify `themes/rose/src/components/sections/PromoBanner.astro`: consume complete banner size mapping.
- Modify `packages/theme-base/blocks/MultiRows/MultiRows.puckConfig.ts`: accept legacy `secondary` in parsing while keeping it out of selectable canonical options.
- Create `scripts/qa/rose-section-settings-smoke.mjs`: local/production Playwright measurements and screenshots with restore-safe production mode.

### Task 1: Pure setting normalizers and RED regression tests

**Files:**

- Create: `themes/rose/src/lib/section-settings.ts`
- Create: `src/generator/__tests__/rose-section-settings.spec.ts`

**Interfaces:**

- Produces: `normalizeRoseSlidePosition(value): RoseSlidePosition`
- Produces: `roseFooterHeadingClass(value): string`
- Produces: `roseFooterTextClass(value): string`
- Produces: `normalizeRoseMultiRowsButtonStyle(value): RoseMultiRowsButtonStyle`
- Produces: `rosePromoBannerSize(value): { minHeightClass: string; textClass: string }`

- [ ] **Step 1: Create tests that import the not-yet-created helpers**

Test exact mappings: missing/invalid Slideshow position → `center`; Footer heading `17/20/24` with missing → `20`; Footer text `14/15/16` with missing → `16`; MultiRows `secondary` → `white`; PromoBanner `thin` → `min-h-8` and `12px`.

```ts
expect(normalizeRoseSlidePosition(undefined)).toBe("center");
expect(roseFooterHeadingClass("large")).toBe("!text-[24px]");
expect(roseFooterTextClass("small")).toBe("!text-[14px]");
expect(normalizeRoseMultiRowsButtonStyle("secondary")).toBe("white");
expect(rosePromoBannerSize("thin")).toEqual({
  minHeightClass: "min-h-8",
  textClass: "text-[12px]",
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- --runInBand src/generator/__tests__/rose-section-settings.spec.ts`

Expected: FAIL because `themes/rose/src/lib/section-settings.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Use literal unions and `Record` maps. Canonical values are:

```ts
const FOOTER_HEADING = {
  small: "!text-[17px]",
  medium: "!text-[20px]",
  large: "!text-[24px]",
} as const;
const FOOTER_TEXT = {
  small: "!text-[14px]",
  medium: "!text-[15px]",
  large: "!text-[16px]",
} as const;
const PROMO = {
  thin: { minHeightClass: "min-h-8", textClass: "text-[12px]" },
  small: { minHeightClass: "min-h-8", textClass: "text-[12px]" },
  medium: { minHeightClass: "min-h-10", textClass: "text-[14px]" },
  large: { minHeightClass: "min-h-12", textClass: "text-[16px]" },
} as const;
```

Missing Footer heading/text default to `medium`/`large`; missing PromoBanner defaults to `large`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test -- --runInBand src/generator/__tests__/rose-section-settings.spec.ts`

Expected: PASS for pure mapping cases.

### Task 2: Slideshow legacy position

**Files:**

- Modify: `src/generator/__tests__/rose-section-settings.spec.ts`
- Modify: `themes/rose/src/components/sections/Slideshow.astro`

**Interfaces:**

- Consumes: `normalizeRoseSlidePosition` from Task 1.

- [ ] **Step 1: Add a renderer-wiring test**

Read `Slideshow.astro` and assert it imports/calls `normalizeRoseSlidePosition(s.position)` and no longer initializes missing position to `""`.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL on the missing helper call.

- [ ] **Step 3: Replace `posRaw` fallback with normalized position**

Import the helper and derive `vPos` from its result. Preserve the existing 3×3 class selection for valid values.

- [ ] **Step 4: Run the focused test and verify GREEN**

Expected: PASS for mapping and Slideshow wiring.

### Task 3: Footer heading and text sizes

**Files:**

- Modify: `src/generator/__tests__/rose-section-settings.spec.ts`
- Modify: `themes/rose/src/components/Footer.astro`

**Interfaces:**

- Consumes: `roseFooterHeadingClass` and `roseFooterTextClass` from Task 1.

- [ ] **Step 1: Add source-contract tests for both size controls**

Assert the Footer computes both classes from `p.heading?.size` and `p.text?.size`, attaches them to the newsletter `<h2>`/`<p>`, and removes fixed `clamp(14px,2.2vw,20px)`/`16px` classes from those elements.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL because Footer still hardcodes both sizes.

- [ ] **Step 3: Wire the static classes into Footer**

Compute:

```ts
const newsletterHeadingSizeCls = roseFooterHeadingClass(p.heading?.size);
const newsletterTextSizeCls = roseFooterTextClass(p.text?.size);
```

Use Astro `class:list` so Tailwind sees every literal through the imported static maps.

- [ ] **Step 4: Run the focused test and verify GREEN**

Expected: PASS for Footer mappings and wiring.

### Task 4: MultiRows canonical and legacy button values

**Files:**

- Modify: `src/generator/__tests__/rose-section-settings.spec.ts`
- Modify: `themes/rose/src/components/sections/MultiRows.astro`
- Modify: `packages/theme-base/blocks/MultiRows/MultiRows.puckConfig.ts`

**Interfaces:**

- Consumes: `normalizeRoseMultiRowsButtonStyle` from Task 1.
- Produces: schema accepts `primary | black | white | secondary`; panel options remain only `primary | black | white`.

- [ ] **Step 1: Add schema, panel, and renderer tests**

Assert `MultiRowsSchema.safeParse({ ...validProps, buttonStyle: "secondary" }).success` is true, selectable values equal `primary/black/white`, and renderer calls the normalizer before class selection.

- [ ] **Step 2: Run focused tests and verify RED**

Run both the new spec and `packages/theme-base/__tests__/multi-rows-block-contract.test.ts`; expect failure because schema rejects `secondary` and renderer lacks normalization.

- [ ] **Step 3: Add compatibility parsing and renderer normalization**

Extend only the Zod enum with `secondary`; do not add it to Puck options. In Rose, select white token classes when normalized style is `white`, otherwise retain current dark primary classes.

- [ ] **Step 4: Run focused tests and verify GREEN**

Expected: both specs PASS and the canonical options remain exactly three.

### Task 5: PromoBanner thin size

**Files:**

- Modify: `src/generator/__tests__/rose-section-settings.spec.ts`
- Modify: `themes/rose/src/components/sections/PromoBanner.astro`

**Interfaces:**

- Consumes: `rosePromoBannerSize` from Task 1.

- [ ] **Step 1: Add renderer-wiring test**

Assert PromoBanner calls `rosePromoBannerSize(p.size)` and its source no longer has a local incomplete `SIZE_MAP`.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL on missing helper usage.

- [ ] **Step 3: Replace the local mapping**

Use `minHeightClass` and `textClass` from the helper. Preserve placeholder/color/padding behavior unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the new spec and existing `PromoBanner.uppercase.test.ts`; expect PASS.

### Task 6: Build and local browser verification

**Files:**

- Create: `scripts/qa/rose-section-settings-smoke.mjs`

**Interfaces:**

- Consumes compiled Rose sections and a base URL supplied via environment variable.
- Produces JSON measurements and PNG screenshots under `/tmp/merfy-rose-qa/section-settings-batch/`.

- [ ] **Step 1: Run the complete focused test set**

```bash
pnpm test -- --runInBand \
  src/generator/__tests__/rose-section-settings.spec.ts \
  packages/theme-base/__tests__/multi-rows-block-contract.test.ts \
  packages/theme-base/blocks/PromoBanner/__tests__/PromoBanner.uppercase.test.ts
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: Compile Rose sections**

Run: `pnpm build:theme-sections rose`

Expected: exit code 0 and generated Rose section bundle.

- [ ] **Step 3: Add Playwright measurements**

The script must measure desktop `1440×1000` and mobile `390×844`: Slideshow content alignment; Footer computed heading/text sizes; MultiRows button foreground/background; PromoBanner bounding height/font size. It must fail on horizontal overflow and save one screenshot per case.

- [ ] **Step 4: Run the local smoke against the compiled preview**

Run: `BASE_URL=<local-preview-url> npx playwright test` or execute the standalone script with the same installed Playwright package.

Expected: JSON reports all assertions true and screenshots exist.

### Task 7: Review, commit, deploy, and restore-safe production smoke

**Files:**

- Modify: plan checkboxes only after evidence is collected.

**Interfaces:**

- Consumes: clean verified branch from Tasks 1–6.
- Produces: review-ready commit/PR and production evidence after deploy.

- [ ] **Step 1: Run verification-before-completion checks**

Run `git diff --check`, focused tests, Rose section build, and inspect `git diff --stat` plus `git status --short`.

- [ ] **Step 2: Request two-stage review**

First review spec compliance, then code quality. Resolve only findings in scope and rerun affected checks.

- [ ] **Step 3: Commit and push only with user authorization**

Use Conventional Commit: `fix(theme): apply rose section settings consistently`.

- [ ] **Step 4: Wait for deploy and run production smoke**

Against the supplied constructor URL, snapshot complete original props, mutate one setting at a time, capture desktop/mobile screenshots and computed styles, then restore the exact original props in `finally`. Never click Save/Publish.

- [ ] **Step 5: Report evidence and remaining findings**

List test/build commands, production results, screenshot directory, commit/PR/deploy identifiers, and any untested scenario without claiming it passed.
