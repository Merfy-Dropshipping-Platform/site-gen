import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { renderShopPage, type ShopTheme } from '../src/page';
import { changedInputs, standInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

const SITE_ID = '00000000-0000-4000-8000-000000000001';
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const text = (content: Uint8Array): string => Buffer.from(content).toString('utf8');

describe('renderShopPage', () => {
  it('главная: строка в формате манифеста и файл', async () => {
    const page = await renderShopPage(standInputs, '/', theme);
    expect(page.row).toEqual({
      path: '/',
      file: 'index.html',
      hash: sha256(page.file.content),
      entity: { type: 'site', id: SITE_ID },
      deps: [`site:${SITE_ID}`],
      dataUpdatedAt: '2026-10-06T09:00:00.000Z',
    });
    expect(page.file.path).toBe('index.html');
    expect(text(page.file.content)).toContain('<h1>Стенд Nova</h1>');
  });

  it('те же входы — те же байты и строка', async () => {
    const [first, second] = await Promise.all([
      renderShopPage(standInputs, '/', theme),
      renderShopPage(structuredClone(standInputs), '/', theme),
    ]);
    expect(second).toEqual(first);
  });

  it('правка цены товара главную не меняет: она от товара не зависит', async () => {
    const repriced = changedInputs((inputs) => (inputs.data.entities[0].data.price = 2300));
    const [before, after] = await Promise.all([
      renderShopPage(standInputs, '/', theme),
      renderShopPage(repriced, '/', theme),
    ]);
    expect(after.row).toEqual(before.row);
  });

  it('правка имени магазина — другой файл, хэш и дата правки', async () => {
    const renamed = changedInputs((inputs) => {
      inputs.site.name = 'Лён и шерсть';
      inputs.site.updatedAt = '2026-10-06T10:00:00.000Z';
    });
    const [before, after] = await Promise.all([
      renderShopPage(standInputs, '/', theme),
      renderShopPage(renamed, '/', theme),
    ]);
    expect(after.row.hash).not.toBe(before.row.hash);
    expect(after.row.dataUpdatedAt).toBe('2026-10-06T10:00:00.000Z');
    expect(text(after.file.content)).toContain('<h1>Лён и шерсть</h1>');
  });

  it('такой страницы нет — page-unknown, рисовальщик не зовётся', async () => {
    const calls: string[] = [];
    const counting: ShopTheme = {
      tokens: novaTokens,
      render: (path, locals) => (calls.push(path), fakeRender(path, locals)),
    };
    await expect(renderShopPage(standInputs, '/products/scarf/', counting)).rejects.toMatchObject({
      code: 'page-unknown',
      message: '/products/scarf/: такой страницы у магазина нет',
    });
    expect(calls).toEqual([]);
  });

  it('страница нарушила договор SEO — seo-contract с адресом', async () => {
    const noCanonical: ShopTheme = {
      tokens: novaTokens,
      render: async (path, locals) => (await fakeRender(path, locals)).replace(/<link rel="canonical"[^>]*>/, ''),
    };
    await expect(renderShopPage(standInputs, '/', noCanonical)).rejects.toMatchObject({
      code: 'seo-contract',
      message: '/: нет канонического адреса https://',
    });
  });
});
