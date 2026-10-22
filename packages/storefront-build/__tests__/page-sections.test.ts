import { describe, expect, it } from 'vitest';
import type { CodeInstance } from '../src/inputs';
import { renderShopPage, type ShopTheme } from '../src/page';
import { NO_SECTIONS, type PageRender, type SectionRenderRequest } from '../src/sections-render';
import { NO_SCRIPT, RENDERS, SRC, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// Страница с секциями SDK 1 (блок 1 «Секций и SDK»): секции рисует функция рендера, CSS — классы Tailwind их разметки.
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const text = (content: Uint8Array): string => Buffer.from(content).toString('utf8');

// Подставной рендер: имя секции, заголовок из настроек и класс из словаря.
const render = (request: SectionRenderRequest): Promise<string> =>
  Promise.resolve(`<h2 class="flex">${request.section} ${String(request.settings.heading ?? '')}</h2>`);
const pageOf = (mode: PageRender['mode']): PageRender => ({ sections: { modules: RENDERS, render }, mode });

describe('страница с секциями', () => {
  it('секции — по порядку мерчанта в обёртках; CSS их классов — в <style id="merfy-sections">', async () => {
    const html = text((await renderShopPage(codeInputs(), '/', theme, pageOf('live'))).file.content);
    const order = [...html.matchAll(/data-section-id="([^"]+)"/g)].map((match) => match[1]);
    expect(order).toEqual(['cart-badge-1', 'hero-1', 'list-1', 'list-2']);
    expect(html).toContain('shop:hero Шарфы к первым холодам');
    expect(html).toMatch(/<style id="merfy-sections">merfy-section\{display:block\}[^<]*\.flex/);
    expect(html).toContain('id="merfy-modules"');
  });

  it('превью: только стили секций — без списка модулей, карты импортов и ядра; без аналитики', async () => {
    const html = text((await renderShopPage(codeInputs(), '/', theme, pageOf('preview'))).file.content);
    expect(html).toContain('<style id="merfy-sections">');
    expect(html).not.toContain('id="merfy-modules"');
    expect(html).not.toContain('type="importmap"');
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
    const live = text((await renderShopPage(inputs, '/', theme, pageOf('live'))).file.content);
    const preview = text((await renderShopPage(inputs, '/', theme, pageOf('preview'))).file.content);
    for (const html of [live, preview]) {
      expect([...html.matchAll(/data-section-id="([^"]+)"/g)].map((match) => match[1])).toEqual(['hero-1', 'list-2']);
      expect(html).not.toContain('data-section="shop:cart-badge"');
    }
    // Модуль скрытого «Значка корзины» в список модулей страницы не попадает; отзывы видимы — их модуль на месте.
    expect(live).not.toContain(SRC.badge);
    expect(live).toContain(SRC.reviews);
  });
});
