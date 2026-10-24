import { describe, expect, it } from 'vitest';
import type { CodeInstance } from '../src/inputs';
import { renderShopPage, type ShopTheme } from '../src/page';
import { NO_SECTIONS, type PageRender, type SectionRenderRequest } from '../src/sections-render';
import { ASSETS, NO_SCRIPT, RENDERS, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// Страница с секциями SDK 1 (блок 1 «Секций и SDK»): секции рисует функция рендера, CSS — классы Tailwind их разметки.
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const text = (content: Uint8Array): string => Buffer.from(content).toString('utf8');

// Подставной рендер: имя секции, заголовок из настроек и класс из словаря.
const render = (request: SectionRenderRequest): Promise<string> => {
  const heading = request.settings.heading;
  return Promise.resolve(`<h2 class="flex">${request.section} ${typeof heading === 'string' ? heading : ''}</h2>`);
};
const pageOf = (mode: PageRender['mode']): PageRender => ({
  sections: { modules: RENDERS, render },
  mode,
  code: ASSETS,
});
const BUNDLE_TAG = /<script type="module" src="\/_merfy\/b\/[0-9a-f]{64}\.js"><\/script>/;

describe('страница с секциями', () => {
  it('секции — по порядку мерчанта в обёртках; CSS их классов — в <style id="merfy-sections">', async () => {
    const html = text((await renderShopPage(codeInputs(), '/', theme, pageOf('live'))).file.content);
    const order = [...html.matchAll(/data-section-id="([^"]+)"/g)].map((match) => match[1]);
    expect(order).toEqual(['cart-badge-1', 'hero-1', 'list-1', 'list-2']);
    expect(html).toContain('shop:hero Шарфы к первым холодам');
    // База обёртки (merfy-section{display:block}) — в base.css темы (4а блока 4), тег несёт только CSS классов секций.
    expect(html).toMatch(/<style id="merfy-sections">[^<]*\.flex/);
    // Бандл страницы (часть 5б) — один тег после стилей секций; тег входных данных — у трёх экземпляров со скриптом.
    expect(html).toMatch(BUNDLE_TAG);
    expect(html.indexOf('<style id="merfy-sections">')).toBeLessThan(html.search(BUNDLE_TAG));
    expect(html.match(/data-merfy-input/g)).toHaveLength(3);
    expect(html).not.toContain('id="merfy-modules"');
  });

  it('превью: стили секций и теги входных данных, без бандла страницы и без аналитики', async () => {
    const html = text((await renderShopPage(codeInputs(), '/', theme, pageOf('preview'))).file.content);
    expect(html).toContain('<style id="merfy-sections">');
    expect(html).toContain('data-merfy-input');
    expect(html).not.toContain('<script type="module"');
    expect(html).not.toContain('"analytics":{');
  });

  it('модуль есть, процесса рендера нет — render-failed; модуля нет — code-missing', async () => {
    const inputs = codeInputs((changed) => (changed.code = structuredClone(NO_SCRIPT)));
    const noRenderer: PageRender = { sections: { ...NO_SECTIONS, modules: RENDERS }, mode: 'live' };
    await expect(renderShopPage(inputs, '/', theme, noRenderer)).rejects.toMatchObject({ code: 'render-failed' });
    await expect(renderShopPage(inputs, '/', theme)).rejects.toMatchObject({ code: 'code-missing' });
  });

  it('страница без секций — как раньше, без процесса рендера', async () => {
    const inputs = codeInputs((changed) => (changed.code = { sections: [], pages: {}, globals: [] }));
    expect(text((await renderShopPage(inputs, '/', theme)).file.content)).not.toContain('<merfy-section');
  });

  it('скрытый экземпляр (hidden: true, п. 22) — его нет ни в сборке, ни в превью: ни разметки, ни модуля', async () => {
    const hide = new Set(['cart-badge-1', 'list-1']);
    const inputs = codeInputs((changed) => {
      changed.code.pages.home = (changed.code.pages.home ?? []).map(
        (instance): CodeInstance => (hide.has(instance.id) ? { ...instance, hidden: true } : instance),
      );
    });
    const rendered = await renderShopPage(inputs, '/', theme, pageOf('live'));
    const live = text(rendered.file.content);
    const preview = text((await renderShopPage(inputs, '/', theme, pageOf('preview'))).file.content);
    for (const html of [live, preview]) {
      expect([...html.matchAll(/data-section-id="([^"]+)"/g)].map((match) => match[1])).toEqual(['hero-1', 'list-2']);
      expect(html).not.toContain('data-section="shop:cart-badge"');
    }
    // Модуль скрытого «Значка корзины» в бандл страницы не попадает; отзывы видимы — их модуль на месте.
    const bundle = text(rendered.bundle?.content ?? new Uint8Array());
    expect(bundle).not.toContain('badge-mounted');
    expect(bundle).toContain('reviews-mounted');
  });
});
