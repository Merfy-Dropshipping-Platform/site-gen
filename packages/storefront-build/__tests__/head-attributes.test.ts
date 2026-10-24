import { describe, expect, it } from 'vitest';
import { renderShopPage, type RenderPage } from '../src/page';
import type { ShopPageLocals } from '../src/locals';
import { changedInputs, standInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

// Атрибуты выборов словаря у <html> страницы магазина (блок 6, часть 6б; Р6б-7): тема печатает их как есть.
async function attributesOf(inputs: typeof standInputs): Promise<Record<string, string> | undefined> {
  let seen: ShopPageLocals['head']['attributes'];
  const render: RenderPage = (path, locals) => {
    seen = locals.head.attributes;
    // Заготовка — fakeRender: SEO-проверка renderShopPage требует валидный <head>, атрибуты читаем из locals.
    return fakeRender(path, locals);
  };
  await renderShopPage(inputs, '/', { tokens: novaTokens, render });
  return seen;
}

describe('head.attributes', () => {
  it('по умолчанию появление секций выключено, наведение — none; остальные выборы словаря тоже есть', async () => {
    const attributes = await attributesOf(standInputs);
    expect(attributes).toMatchObject({ 'data-motion-reveal': 'off', 'data-motion-hover': 'none' });
    expect(Object.keys(attributes ?? {})).toEqual(expect.arrayContaining(['data-card-style', 'data-card-align']));
  });

  it('мерчант включил «Появление секций при прокрутке» — data-motion-reveal="on"; другие выборы не меняются', async () => {
    const base = await attributesOf(standInputs);
    const on = changedInputs((inputs) => (inputs.revision.tokens = { root: { 'choice-motion-reveal': 'on' } }));
    expect(await attributesOf(on)).toEqual({ ...base, 'data-motion-reveal': 'on' });
  });
});
