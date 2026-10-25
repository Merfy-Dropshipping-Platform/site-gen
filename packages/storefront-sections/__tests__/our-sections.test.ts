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

// Блок 10, часть 10а: секции корзины — те же правила, что у секции мерчанта.
describe('наши секции блока 10 — проверка при сохранении', () => {
  it.each([
    ['cart', 'shop:cart', ['page']],
    ['cart-summary', 'shop:cart-summary', ['page']],
    ['cart-drawer', 'shop:cart-drawer', ['footer']],
    ['cart-added', 'shop:cart-added', ['footer']],
  ])('%s: без отказов и предупреждений, одна на список, модуль cart', async (folder, name, groups) => {
    const { problems, section } = await prepared(folder);
    expect(problems).toEqual([]);
    expect([section?.name, section?.warnings, section?.manifest.groups, section?.manifest.limit]).toEqual([name, [], groups, 1]);
    expect(section?.scriptMeta.uses).toEqual(['cart']);
  });

  it('«Значок корзины» с cart.open — без отказов', async () => {
    expect((await prepared('cart-badge')).problems).toEqual([]);
  });
});

// Блок 10, часть 10б: «Избранное» — те же правила, что у секции мерчанта; «Шапка» с themeSettings — без отказов.
describe('наши секции блока 10б — проверка при сохранении', () => {
  it('«Избранное»: страница, одна на список, модуль favorites', async () => {
    const { problems, section } = await prepared('wishlist');
    expect(problems).toEqual([]);
    expect([section?.name, section?.warnings, section?.manifest.groups, section?.manifest.limit]).toEqual([
      'shop:wishlist',
      [],
      ['page'],
      1,
    ]);
    expect(section?.scriptMeta.uses).toEqual(['favorites']);
  });
});


// Блок 10, часть 10в: вход и кабинет — те же правила, что у секции мерчанта.
describe('наши секции блока 10в — проверка при сохранении', () => {
  it.each([
    ['login', 'shop:login', ['auth'], undefined],
    ['account', 'shop:account', ['auth'], ['scheme']],
    ['orders', 'shop:orders', ['orders'], ['scheme']],
  ])('%s: страница, одна на список, свой модуль', async (folder, name, uses, wrapper) => {
    const { problems, section } = await prepared(folder);
    expect(problems).toEqual([]);
    expect([section?.name, section?.warnings, section?.manifest.groups, section?.manifest.limit]).toEqual([name, [], ['page'], 1]);
    expect(section?.scriptMeta.uses).toEqual(uses);
    expect(section?.manifest.wrapper).toEqual(wrapper);
  });

  it('«Шапка» с auth — без отказов', async () => {
    const { problems } = await prepared('../../storefront-sections/fixtures/shop/header');
    expect(problems).toEqual([]);
  });
});
