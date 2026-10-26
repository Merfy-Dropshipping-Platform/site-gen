import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { prepareSection } from '../src/prepare';
import { readSectionFolder } from '../src/read-folder';

// Вход по коду и кабинет — часть auth вне ядра (блок 15 «Секций и SDK», часть 15ж, Р15ж-2): в бандл страницы она
// попадает по script_meta.parts её секций (pageParts сборки). «Вход» и «Личный кабинет» её объявляют, «Шапке» хватает
// customer ядра — главная и каталог без кода входа. Что auth нет в ядре, проверяет core-weight.test.ts пакета ядра.
const OUR_SECTIONS = fileURLToPath(new URL('../../storefront-shell/sections', import.meta.url));
const HEADER = fileURLToPath(new URL('../fixtures/shop/header', import.meta.url));

async function partsOf(folder: string): Promise<readonly string[]> {
  const result = await prepareSection({ prefix: 'shop', files: await readSectionFolder(folder) });
  if (!result.ok) throw new Error(result.problems.map((item) => `${item.code} ${item.file} ${item.message}`).join('; '));
  return result.section.scriptMeta.parts;
}

describe('часть auth — в бандле только страниц с секцией, которая её объявила', () => {
  it.each(['login', 'account'])('«%s»: в script_meta.parts — auth', async (folder) => {
    expect(await partsOf(`${OUR_SECTIONS}/${folder}`)).toContain('auth');
  });

  it('«Шапка»: customer, без auth', async () => {
    const parts = await partsOf(HEADER);
    expect(parts).toContain('customer');
    expect(parts).not.toContain('auth');
  });

  it('«Заказы»: orders, без auth — страница заказов без кода входа', async () => {
    expect(await partsOf(`${OUR_SECTIONS}/orders`)).not.toContain('auth');
  });
});
