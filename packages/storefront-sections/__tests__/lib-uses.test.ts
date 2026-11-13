import { describe, expect, it } from 'vitest';
import { MANIFEST_FILE, readManifest, USES_TEXT, type SectionFiles } from '../src/format';
import { prepareSection, type PrepareResult } from '../src/prepare';
import type { SectionProblem } from '../src/problems';

// Библиотеки SDK при приёме (13.11, часть 2в спеки анимаций): "lib:<имя>" в uses — только из каталога
// (@merfy/shell/libraries), иначе lib-unknown; ctx.lib.<имя> без "lib:<имя>" в uses — тоже lib-unknown; принятая
// библиотека — в script_meta.uses, частей бандла не добавляет.
const files = (uses: readonly string[], body = 'ctx.lib.motion.tween(0, 100, { duration: 300 }, () => undefined);') =>
  ({
    [MANIFEST_FILE]: JSON.stringify({ sdk: 1, name: 'counter', kind: 'section', title: 'Счётчик', uses }),
    'template.astro': '<p data-ref="count">0</p>',
    'script.ts': `import { defineSection } from '@merfy/shell';
export default defineSection({ mount(_el, ctx) { ${body} } });
`,
  }) satisfies SectionFiles;

const prepared = (input: SectionFiles): Promise<PrepareResult> => prepareSection({ prefix: 'shop', files: input });
const lines = (result: PrepareResult): string[] =>
  result.ok ? [] : result.problems.map((item: SectionProblem) => `${item.code} ${item.file} ${item.message}`);

describe('uses: ["lib:…"]', () => {
  it('lib:motion — принят, в script_meta.uses; частей бандла не добавляет', async () => {
    const result = await prepared(files(['lib:motion']));
    expect(lines(result)).toEqual([]);
    if (!result.ok) return;
    expect(result.section.scriptMeta).toMatchObject({ uses: ['lib:motion'], parts: [] });
  }, 30_000);

  it('lib:lenis — принят, в script_meta.uses; ctx.lib.lenis без него — lib-unknown', async () => {
    const body = 'ctx.lib.lenis.onScroll(() => undefined);';
    const result = await prepared(files(['lib:lenis'], body));
    expect(lines(result)).toEqual([]);
    if (result.ok) expect(result.section.scriptMeta).toMatchObject({ uses: ['lib:lenis'], parts: [] });
    expect(lines(await prepared(files(['lib:motion'], body)))).toEqual([
      'lib-unknown script.ts ctx.lib.lenis без "lib:lenis" в uses section.json — библиотеки на странице не будет',
    ]);
  }, 30_000);

  it('имени нет в каталоге — отказ lib-unknown со списком каталога', async () => {
    expect(lines(await prepared(files(['lib:gsap'], 'void ctx;')))).toEqual([
      'lib-unknown section.json uses: библиотеки «gsap» нет в каталоге SDK. Есть: lib:motion, lib:lenis',
    ]);
  }, 30_000);

  it('ctx.lib.motion без "lib:motion" в uses — lib-unknown с подсказкой', async () => {
    expect(lines(await prepared(files(['cart'])))).toEqual([
      'lib-unknown script.ts ctx.lib.motion без "lib:motion" в uses section.json — библиотеки на странице не будет',
    ]);
  }, 30_000);

  it.each(['lib:', 'lib:Motion', 'lib:a', 'motion'])('%s в uses — manifest-invalid с подсказкой', (use) => {
    const read = readManifest(files([use]));
    expect(read.ok ? [] : read.problems.map((item) => item.message)).toEqual([`uses.0: ${USES_TEXT}`]);
  });
});
