# Publications Preview/Live Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать число карточек и колонок Publications детерминированным и одинаковым в constructor preview, server preview и live storefront.

**Architecture:** Текущие UI-поля `cardsCount/columnsCount` являются источником истины, legacy `cards/columns` — fallback. Sites канонизирует сохранённые props на общей для preview/live границе `extractPageBlocks`; constructor материализует те же effective values в обе пары при любом редактировании секции.

**Tech Stack:** TypeScript, React, Astro, Zod, Jest, Vitest, Testing Library, pnpm 10 через Corepack.

## Global Constraints

- `cardsCount` и `columnsCount` имеют приоритет над `cards` и `columns`, если присутствуют.
- Effective counts — целые числа `1..4`, fallback `3`.
- После нормализации `cards === cardsCount` и `columns === columnsCount`.
- Нормализация должна быть идемпотентной.
- Legacy-only revisions сохраняют прежний effective value.
- Массовая миграция БД, upload limits и остальные секции не входят в scope.
- Constructor и sites изменяются только в изолированных worktree.
- Не создавать commit, не выполнять push/PR и не публиковать сайт без отдельного явного разрешения пользователя.
- Полные suites имеют зафиксированный baseline: constructor 118/120 tests с двумя assertion failures и двумя suite errors; sites 854/865 tests, 75/81 suites.

---

### Task 1: Sites Publications canonical render boundary

**Worktree:** `/Users/alexey/projects/merfy-worktrees/sites-preview-live-parity-wave1`

**Files:**
- Modify: `packages/theme-base/blocks/Publications/Publications.puckConfig.ts`
- Modify: `packages/theme-base/__tests__/publications-block-contract.test.ts`
- Modify: `src/themes/page-blocks.ts`
- Create: `src/themes/__tests__/page-blocks-publications.spec.ts`

**Interfaces:**
- Produces: `normalizePublicationsStoredProps(input)` с единым precedence и synchronized aliases.
- Produces: `adaptLegacyProps(props, publicUrl, 'Publications')`, возвращающий synchronized aliases до передачи в preview/live renderers.
- Consumes: существующие `clampPublicationCount`, `coerceGenericLegacyProps` и общую границу `extractPageBlocks`.

- [ ] **Step 1: Write failing pure normalization tests**

Добавить отдельные assertions в `publications-block-contract.test.ts`:

```ts
it('uses current count fields and synchronizes their legacy aliases', () => {
  const parsed = PublicationsStoredSchema.parse({
    heading: 'Publications',
    cards: 3,
    cardsCount: 5,
    columns: 2,
    columnsCount: 4,
    padding: { top: 80, bottom: 80 },
  });

  expect(parsed).toMatchObject({
    cards: 4,
    cardsCount: 4,
    columns: 4,
    columnsCount: 4,
  });
  expect(PublicationsStoredSchema.parse(parsed)).toEqual(parsed);
});

it('keeps legacy-only count fields as the effective values', () => {
  const parsed = PublicationsStoredSchema.parse({
    heading: 'Publications',
    cards: 2,
    columns: 1,
    padding: { top: 80, bottom: 80 },
  });

  expect(parsed).toMatchObject({
    cards: 2,
    cardsCount: 2,
    columns: 1,
    columnsCount: 1,
  });
});
```

- [ ] **Step 2: Run the pure tests and verify RED**

Run:

```bash
corepack pnpm exec jest packages/theme-base/__tests__/publications-block-contract.test.ts --runInBand
```

Expected: the conflicting-alias test fails because current code returns
`cards=3` and `columns=2` while preserving different count aliases.

- [ ] **Step 3: Write failing shared-boundary integration test**

Create `src/themes/__tests__/page-blocks-publications.spec.ts` with a revision
containing one Publications block and conflicting aliases:

```ts
import { extractPageBlocks } from '../page-blocks';

describe('Publications page block normalization', () => {
  it('returns the same synchronized effective counts for shared preview/live consumers', async () => {
    const data = {
      pagesData: {
        home: {
          content: [{
            type: 'Publications',
            props: {
              heading: 'Publications',
              cards: 3,
              cardsCount: 5,
              columns: 3,
              columnsCount: 4,
            },
          }],
        },
      },
    };

    const blocks = await extractPageBlocks(data, 'home', null, null, 'site-1');

    expect(blocks?.[0].props).toMatchObject({
      cards: 4,
      cardsCount: 4,
      columns: 4,
      columnsCount: 4,
      siteId: 'site-1',
    });
  });
});
```

- [ ] **Step 4: Run the boundary test and verify RED**

Run:

```bash
corepack pnpm exec jest src/themes/__tests__/page-blocks-publications.spec.ts --runInBand
```

Expected: FAIL because `adaptLegacyProps` currently uses the generic fallback
and returns divergent aliases.

- [ ] **Step 5: Implement minimal sites normalization**

In `normalizePublicationsStoredProps`, calculate one effective value per pair
using current-first precedence, then return that value in both aliases:

```ts
const cards = clampPublicationCount(raw.cardsCount ?? raw.cards);
const columns = clampPublicationCount(raw.columnsCount ?? raw.columns);

return {
  // existing normalized fields
  cards,
  cardsCount: cards,
  columns,
  columnsCount: columns,
  // existing normalized fields
};
```

In `adaptLegacyProps`, give Publications an explicit branch. First preserve the
existing generic envelope/scheme coercion, then synchronize counts:

```ts
case 'Publications':
  coerceGenericLegacyProps(out);
  coercePublicationsProps(out);
  break;
```

Add a focused helper beside the other block coercers:

```ts
function coercePublicationsProps(out: Record<string, unknown>): void {
  const cards = coercePublicationCount(out.cardsCount ?? out.cards);
  const columns = coercePublicationCount(out.columnsCount ?? out.columns);
  out.cards = cards;
  out.cardsCount = cards;
  out.columns = columns;
  out.columnsCount = columns;
}

function coercePublicationCount(value: unknown, fallback = 3): number {
  const numeric = typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
  return Math.min(4, Math.max(1, numeric));
}
```

Do not import runtime code from `packages/theme-base` into Nest `src/`, because
`tsconfig.build.json` excludes packages from the service build.

- [ ] **Step 6: Run targeted sites tests and verify GREEN**

Run:

```bash
corepack pnpm exec jest \
  packages/theme-base/__tests__/publications-block-contract.test.ts \
  packages/theme-base/__tests__/constructor-defaults-schema-compat.test.ts \
  src/themes/__tests__/page-blocks-publications.spec.ts \
  --runInBand
```

Expected: all selected suites and tests PASS with no new warnings.

- [ ] **Step 7: Verify sites build boundary**

Run:

```bash
corepack pnpm build
```

Expected: exit code `0`. Then inspect `git diff --check` and `git status --short`.
Do not commit.

---

### Task 2: Constructor alias materialization

**Worktree:** `/Users/alexey/projects/merfy-worktrees/constructor-preview-live-parity-wave1`

**Files:**
- Modify: `src/components/fields/CustomFieldsPanel.tsx`
- Modify: `src/__tests__/figmaSectionContract.test.tsx`

**Interfaces:**
- Consumes: Task 1 contract — current count fields win, values clamp to `1..4`, aliases are synchronized.
- Produces: every Publications edit saves `cards === cardsCount` and `columns === columnsCount`.

- [ ] **Step 1: Write failing unrelated-edit regression test**

Add a focused test to `figmaSectionContract.test.tsx` using the existing panel
fixtures and `chooseCurrentColorScheme()` helper:

```tsx
it('synchronizes Publications count aliases on an unrelated edit', () => {
  mocks.store.appState.data.content = [{
    type: 'Publications',
    props: {
      heading: 'Publications',
      cards: 3,
      cardsCount: 5,
      columns: 2,
      columnsCount: 4,
    },
  }];
  render(<CustomFieldsPanel />);

  chooseCurrentColorScheme();

  expect(lastSavedProps()).toMatchObject({
    cards: 4,
    cardsCount: 4,
    columns: 4,
    columnsCount: 4,
  });
});
```

- [ ] **Step 2: Run constructor regression and verify RED**

Run:

```bash
corepack pnpm exec vitest run src/__tests__/figmaSectionContract.test.tsx
```

Expected: the new test fails because `cards` remains `3` and `columns` remains
`2`, even though the visible count fields are clamped to `4`.

- [ ] **Step 3: Implement minimal alias synchronization**

In the existing Publications branch of `updateProp`, replace independent alias
clamps with one effective value per pair:

```ts
const cardsCount = clampPublicationCount(
  nextProps.cardsCount ?? nextProps.cards,
);
const columnsCount = clampPublicationCount(
  nextProps.columnsCount ?? nextProps.columns,
);
nextProps.cards = cardsCount;
nextProps.cardsCount = cardsCount;
nextProps.columns = columnsCount;
nextProps.columnsCount = columnsCount;
```

Keep the existing heading, date and publication-type preservation logic intact.

- [ ] **Step 4: Run constructor targeted tests and verify GREEN**

Run:

```bash
corepack pnpm exec vitest run \
  src/__tests__/figmaSectionContract.test.tsx \
  src/__tests__/pupaMigrate.test.ts
```

Expected: all selected tests PASS and output has no new errors.

- [ ] **Step 5: Verify constructor build**

Run:

```bash
corepack pnpm build
git diff --check
git status --short
```

Expected: build/typecheck exits `0`; only the two intended source/test files
are modified. Do not commit.

---

### Task 3: Cross-repository review and local acceptance

**Worktrees:**
- `/Users/alexey/projects/merfy-worktrees/sites-preview-live-parity-wave1`
- `/Users/alexey/projects/merfy-worktrees/constructor-preview-live-parity-wave1`

**Files:**
- Review only: all diffs from Tasks 1–2
- Update only if review finds a confirmed issue: the files already listed in Tasks 1–2

**Interfaces:**
- Consumes: synchronized aliases from both repositories.
- Produces: evidence that the two implementations encode the same precedence and range.

- [ ] **Step 1: Review both diffs against the design**

Check explicitly:

```text
cardsCount ?? cards -> integer clamp 1..4 -> cards and cardsCount
columnsCount ?? columns -> integer clamp 1..4 -> columns and columnsCount
```

Reject any implementation that prefers legacy aliases when current fields are
present, changes unrelated section behavior, or introduces a DB migration.

- [ ] **Step 2: Run fresh targeted verification**

Sites:

```bash
corepack pnpm exec jest \
  packages/theme-base/__tests__/publications-block-contract.test.ts \
  packages/theme-base/__tests__/constructor-defaults-schema-compat.test.ts \
  src/themes/__tests__/page-blocks-publications.spec.ts \
  --runInBand
corepack pnpm build
```

Constructor:

```bash
corepack pnpm exec vitest run \
  src/__tests__/figmaSectionContract.test.tsx \
  src/__tests__/pupaMigrate.test.ts
```

- [ ] **Step 3: Compare against baseline without claiming full-suite green**

Run the full suites only if targeted tests/build pass. Record their exact
counts and compare with the known baseline. Existing unrelated failures may
remain, but no new failure may be introduced.

- [ ] **Step 4: Prepare handoff**

Report changed files, RED/GREEN evidence, build results, baseline comparison
and remaining production step. Do not commit, push, deploy or publish until the
user explicitly authorizes those actions.
