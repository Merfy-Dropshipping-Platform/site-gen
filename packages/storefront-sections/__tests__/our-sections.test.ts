import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { prepareSection } from '../src/prepare';
import { readSectionFolder } from '../src/read-folder';

// Наши секции блока 9 «Секций и SDK» (часть 9б) проходят проверку при сохранении так же, как секция мерчанта:
// «Значок корзины» и «Уведомления» — без отказов и предупреждений; место (groups, limit) и script_meta — по section.json.
const OUR_SECTIONS = fileURLToPath(new URL('../../storefront-shell/sections', import.meta.url));

async function prepared(folder: string) {
  const result = await prepareSection({ prefix: 'shop', files: await readSectionFolder(`${OUR_SECTIONS}/${folder}`) });
  const problems = result.ok ? [] : result.problems.map((item) => `${item.code} ${item.file} ${item.message}`);
  return { problems, section: result.ok ? result.section : null };
}

describe('наши секции блока 9 — проверка при сохранении', () => {
  it('«Значок корзины»: шапка и страница, модуль cart', async () => {
    const { problems, section } = await prepared('cart-badge');
    expect(problems).toEqual([]);
    expect([section?.name, section?.warnings, section?.manifest.groups, section?.scriptMeta]).toEqual([
      'shop:cart-badge',
      [],
      ['header', 'page'],
      { uses: ['cart'], parts: ['cart'], classes: [] },
    ]);
  });

  it('«Уведомления»: подвал и страница, одна на список, без модулей SDK', async () => {
    const { problems, section } = await prepared('notices');
    expect(problems).toEqual([]);
    expect([section?.name, section?.warnings, section?.manifest.groups, section?.manifest.limit]).toEqual([
      'shop:notices',
      [],
      ['footer', 'page'],
      1,
    ]);
    expect(section?.scriptMeta).toEqual({ uses: [], parts: [], classes: [] });
  });
});
