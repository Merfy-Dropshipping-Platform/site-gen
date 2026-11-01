import { describe, expect, it } from 'vitest';
import { MANIFEST_FILE, readManifest, USES_TEXT, type SectionFiles } from '../src/format';
import { prepareSection, type PrepareResult } from '../src/prepare';
import type { SectionProblem } from '../src/problems';
import { storeCycleOf, storeCycleText, storeReadsOf } from '../src/store-cycle';

// Свои сторы при приёме (свои сторы, 01.11): "kind": "store" — section.json и script.ts с defineStore, без шаблона и
// места; "store:<префикс>:<имя>" в uses — в script_meta; код расширения читает только свои сторы; ctx.stores['…'] без
// uses — отказ; круг чтений находит storeCycleOf (приём сверяет с реестром — stack/store-cycle.test.ts).
const manifest = (fields: Record<string, unknown>): string =>
  JSON.stringify({ sdk: 1, name: 'has-items', kind: 'store', title: 'В корзине что-то есть', ...fields });

const STORE_SCRIPT = `import { defineStore } from '@merfy/shell';

export default defineStore<boolean>({
  value: false,
  start(ctx, set) {
    ctx.watch(ctx.cart.$count, (count) => set(count > 0));
  },
});
`;

const storeFiles = (fields: Record<string, unknown> = { uses: ['cart'] }, script = STORE_SCRIPT): SectionFiles => ({
  [MANIFEST_FILE]: manifest(fields),
  'script.ts': script,
});

const prepared = (files: SectionFiles, prefix = 'shop'): Promise<PrepareResult> => prepareSection({ prefix, files });
const lines = (result: PrepareResult): string[] =>
  result.ok ? [] : result.problems.map((item: SectionProblem) => `${item.code} ${item.file} ${item.message}`);
const codes = (result: PrepareResult): string[] => (result.ok ? [] : result.problems.map((item) => item.code));

describe('"kind": "store" — свой стор', () => {
  it('section.json и script.ts с defineStore — принят: шаблона и модуля рендера нет, uses — в script_meta', async () => {
    const result = await prepared(storeFiles({ uses: ['cart', 'store:shop:visits'] }));
    expect(lines(result)).toEqual([]);
    if (!result.ok) return;
    expect(result.section).toMatchObject({ name: 'shop:has-items', template: '', render: null });
    expect(result.section.script).toContain('value:!1');
    expect(result.section.script).not.toContain('defineStore');
    expect(result.section.scriptMeta).toEqual({ uses: ['cart', 'store:shop:visits'], parts: ['cart'], classes: [] });
  }, 30_000);

  it('шаблон у стора — kind-mismatch; скрипта нет — kind-mismatch', async () => {
    const withTemplate = await prepared({ ...storeFiles(), 'template.astro': '<p>x</p>' });
    expect(lines(withTemplate)).toContain(
      'kind-mismatch template.astro у стора нет места на странице: template.astro не нужен',
    );
    const noScript = await prepared({ [MANIFEST_FILE]: manifest({}) });
    expect(lines(noScript)).toEqual([
      'kind-mismatch script.ts у стора нужен script.ts или script.js с export default defineStore({ value, start })',
    ]);
  }, 30_000);

  it('определение не того вида: стор с defineSection, секция с defineStore — kind-mismatch', async () => {
    const asSection = await prepared(
      storeFiles({}, "import { defineSection } from '@merfy/shell';\nexport default defineSection({ mount() {} });\n"),
    );
    expect(lines(asSection)).toEqual([
      'kind-mismatch script.ts у стора ("kind": "store") — export default defineStore({ value, start }), а не defineSection',
    ]);
    const asStore = await prepared({
      [MANIFEST_FILE]: JSON.stringify({ sdk: 1, name: 'popup', kind: 'section', title: 'Окно' }),
      'template.astro': '<div></div>',
      'script.ts': "import { defineStore } from '@merfy/shell';\nexport default defineStore({ value: 1 });\n",
    });
    expect(codes(asStore)).toEqual(['kind-mismatch']);
  }, 30_000);

  it('ключи места и данные шаблона у стора — manifest-invalid', () => {
    const read = readManifest({
      [MANIFEST_FILE]: manifest({ groups: ['page'], role: 'cart-drawer', uses: ['theme'] }),
    });
    expect(read.ok ? [] : read.problems.map((item) => `${item.code} ${item.message}`)).toEqual([
      'manifest-invalid groups: у стора нет места на странице',
      'manifest-invalid role: у стора нет места на странице',
      'manifest-invalid uses: theme — данные шаблона, у стора шаблона нет',
    ]);
  });

  it.each(['store:visits', 'store:Shop:visits', 'store:shop:', 'store:shop:a:b'])(
    '%s в uses — manifest-invalid с подсказкой',
    (use) => {
      const read = readManifest({ [MANIFEST_FILE]: manifest({ uses: [use] }) });
      expect(read.ok ? [] : read.problems.map((item) => item.message)).toEqual([`uses.0: ${USES_TEXT}`]);
    },
  );

  it('ctx стора — первый параметр start: чтения ctx сверяются, как у секции', async () => {
    const script = `import { defineStore } from '@merfy/shell';
export default defineStore({ value: null, start(c, set) { set(c.theme['no-such-setting'] ?? null); } });
`;
    expect(codes(await prepared(storeFiles({}, script)))).toEqual(['theme-setting-unknown']);
  }, 30_000);
});

describe('кто какой стор читает', () => {
  const sectionReading = (uses: readonly string[], store: string): SectionFiles => ({
    [MANIFEST_FILE]: JSON.stringify({ sdk: 1, name: 'popup', kind: 'section', title: 'Окно', uses }),
    'template.astro': '<div data-ref="box"></div>',
    'script.ts': `import { defineSection } from '@merfy/shell';
export default defineSection({ mount(_el, ctx) { const s = ctx.stores['${store}']; if (s) ctx.watch(s, () => undefined); } });
`,
  });

  it('секция магазина читает свой стор и стор расширения из uses', async () => {
    expect(lines(await prepared(sectionReading(['store:shop:has-items'], 'shop:has-items')))).toEqual([]);
    expect(lines(await prepared(sectionReading(['store:popups:seen'], 'popups:seen')))).toEqual([]);
  }, 30_000);

  it('ctx.stores без "store:…" в uses — store-unknown с подсказкой', async () => {
    expect(lines(await prepared(sectionReading(['cart'], 'shop:has-items')))).toEqual([
      'store-unknown script.ts стора «shop:has-items» нет в ctx.stores — добавьте "store:shop:has-items" в uses section.json',
    ]);
  }, 30_000);

  it('код расширения читает только свои сторы: стор магазина и чужого расширения — store-foreign', async () => {
    const own = await prepared(sectionReading(['store:popups:seen'], 'popups:seen'), 'popups');
    expect(lines(own)).toEqual([]);
    const foreign = await prepared(storeFiles({ uses: ['store:shop:visits', 'store:other:x'] }), 'popups');
    expect(lines(foreign)).toEqual([
      'store-foreign section.json uses: store:shop:visits — код расширения popups читает только свои сторы: store:popups:<имя>',
      'store-foreign section.json uses: store:other:x — код расширения popups читает только свои сторы: store:popups:<имя>',
    ]);
  }, 30_000);
});

describe('круг чтений сторов', () => {
  const graph = new Map<string, readonly string[]>([
    ['shop:b', ['shop:c']],
    ['shop:c', ['shop:a']],
    ['shop:d', []],
  ]);

  it('a → b → c → a — путь круга; без круга — null; сам себя — a → a', () => {
    expect(storeCycleOf('shop:a', ['shop:b'], graph)).toEqual(['shop:a', 'shop:b', 'shop:c', 'shop:a']);
    expect(storeCycleOf('shop:a', ['shop:d'], graph)).toBeNull();
    expect(storeCycleOf('shop:a', ['shop:a'], graph)).toEqual(['shop:a', 'shop:a']);
    expect(storeCycleOf('shop:a', ['shop:missing'], graph)).toBeNull();
  });

  it('новая правка заменяет прежнюю: c больше не читает a — круга нет', () => {
    expect(storeCycleOf('shop:c', [], graph)).toBeNull();
  });

  it('сторы из script_meta и текст отказа', () => {
    expect(storeReadsOf({ uses: ['cart', 'store:shop:b', 'ext:popups'], parts: [], classes: [] })).toEqual(['shop:b']);
    expect(storeReadsOf(null)).toEqual([]);
    expect(storeCycleText(['shop:a', 'shop:b', 'shop:a'])).toBe(
      'стор shop:a читает сам себя по кругу: shop:a → shop:b → shop:a — убери одно из этих чтений из uses',
    );
  });
});
