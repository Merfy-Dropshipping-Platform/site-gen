import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@merfy/storefront-build';
import { describe, expect, it } from 'vitest';
import { compileTemplate } from '../src/compile';
import { readSectionFolder } from '../src/read-folder';
import { SectionRenderError, withSectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';

// Намеренно сломанные секции для проверки руками (блок 2 «Секций и SDK», «Решил сам» п. 9): две проходят проверку и
// падают только при рендере с правками мерчанта, пять проверка не сохраняет. «Буквица» (heading-letter) с блока 3 падает
// на пробном рендере с пустыми значениями — render-empty-failed.
const BROKEN = fileURLToPath(new URL('../fixtures/broken', import.meta.url));

async function codesOf(name: string): Promise<string[]> {
  const result = await prepareInWorker({ prefix: 'shop', files: await readSectionFolder(`${BROKEN}/${name}`) });
  return result.ok ? [] : result.problems.map((item) => item.code);
}

async function requestOf(name: string, settings: Record<string, string>) {
  const compiled = await compileTemplate(await readFile(`${BROKEN}/${name}/template.astro`, 'utf8'));
  if (!compiled.ok) throw new Error(`${name}: ${JSON.stringify(compiled.problems)}`);
  const hash = sha256(Buffer.from(compiled.code, 'utf8'));
  return { section: `shop:${name}`, hash, module: compiled.code, settings };
}

const stageOf = (error: unknown): string => (error instanceof SectionRenderError ? error.stage : 'не отказ секции');

describe('сломанные секции для проверки руками', () => {
  it.each(['long-output', 'slow-grid'])('%s — проверка сохраняет', async (name) => {
    expect(await codesOf(name)).toEqual([]);
  });

  it.each([
    ['heading-letter', 'render-empty-failed'],
    ['read-env', 'template-forbidden'],
    ['fetch-network', 'template-forbidden'],
    ['endless-loop', 'template-forbidden'],
    ['deep-nesting', 'template-too-deep'],
  ])('%s — проверка не сохраняет: %s', async (name, code) => {
    expect(await codesOf(name)).toEqual([code]);
  });

  it('с правками мерчанта рендер отказывает: render, render-output, render-timeout', async () => {
    const cases: [string, Record<string, string>, string][] = [
      ['heading-letter', { heading: '' }, 'render'],
      ['long-output', { heading: 'шарф', subheading: '1000000' }, 'render-output'],
      ['slow-grid', { heading: '100000' }, 'render-timeout'],
    ];
    const stages = await withSectionRenderer(async (render) => {
      const found: string[] = [];
      for (const [name, settings] of cases)
        found.push(await render(await requestOf(name, settings)).then(() => 'отрендерилась', stageOf));
      return found;
    });
    expect(stages).toEqual(cases.map(([, , stage]) => stage));
  }, 30_000);
});
