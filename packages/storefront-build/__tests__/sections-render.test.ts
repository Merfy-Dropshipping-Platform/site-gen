import { platformDictionary } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import {
  LIVE_PAGE,
  NO_SECTIONS,
  renderPlacedSections,
  renderSection,
  type PageRender,
  type SectionsRender,
} from '../src/sections-render';

const dictionary = platformDictionary;
const MODULE = 'export default 1;';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const PLACED = { id: 'hero-1', name: 'shop:hero', hash: HASH, settings: { heading: 'Шарфы к первым холодам' } };
const sectionsWith = (render: SectionsRender['render']): SectionsRender => ({ modules: new Map([[HASH, MODULE]]), render });

describe('рендер секции', () => {
  it('обёртка с именем, id и классом отступа; в рендер уходят модуль и значения', async () => {
    const seen: unknown[] = [];
    const sections = sectionsWith((request) => {
      seen.push(request);
      return Promise.resolve('<h2 class="text-5xl">Шарфы к первым холодам</h2>');
    });
    expect(await renderSection(PLACED, sections, 'live')).toBe(
      '<merfy-section data-section="shop:hero" data-section-id="hero-1" class="py-section"><h2 class="text-5xl">Шарфы к первым холодам</h2></merfy-section>',
    );
    expect(seen).toEqual([{ section: 'shop:hero', hash: HASH, module: MODULE, settings: PLACED.settings }]);
  });

  it('нет модуля или байты не те — code-missing', async () => {
    const empty = sectionsWith(() => Promise.resolve(''));
    await expect(renderSection({ ...PLACED, hash: 'sha256:00' }, empty, 'live')).rejects.toMatchObject({
      code: 'code-missing',
    });
    const wrong: SectionsRender = { modules: new Map([[HASH, 'export default 2;']]), render: () => Promise.resolve('') };
    await expect(renderSection(PLACED, wrong, 'preview')).rejects.toMatchObject({ code: 'code-missing' });
  });

  it('ошибка рендера на опубликованном сайте — render-failed с именем секции', async () => {
    const failing = sectionsWith(() => Promise.reject(new Error('boom')));
    await expect(renderSection(PLACED, failing, 'live')).rejects.toMatchObject({
      code: 'render-failed',
      message: 'hero-1: секция shop:hero не отрисовалась: boom',
    });
  });

  it('ошибка рендера в превью — блок с именем секции и текстом ошибки', async () => {
    const html = await renderSection(PLACED, sectionsWith(() => Promise.reject(new Error('<boom>'))), 'preview');
    expect(html).toContain('data-section-id="hero-1"');
    expect(html).toContain('data-merfy-error');
    expect(html).toContain('Секция shop:hero не отрисовалась: &lt;boom&gt;');
  });
});

describe('секции страницы', () => {
  it('без процесса рендера: страница без секций — пусто, с секцией — render-failed', async () => {
    expect(await renderPlacedSections([], dictionary, LIVE_PAGE)).toEqual({
      sections: [],
      sectionsCss: '',
      mode: 'live',
    });
    const page: PageRender = { sections: { ...NO_SECTIONS, modules: new Map([[HASH, MODULE]]) }, mode: 'live' };
    await expect(renderPlacedSections([PLACED], dictionary, page)).rejects.toMatchObject({
      code: 'render-failed',
    });
  });

  it('секции по порядку и CSS их классов', async () => {
    const page: PageRender = {
      sections: sectionsWith((request) => Promise.resolve(`<p class="flex">${String(request.settings.heading)}</p>`)),
      mode: 'preview',
    };
    const second = { ...PLACED, id: 'hero-2', settings: { heading: 'Второй' } };
    const content = await renderPlacedSections([PLACED, second], dictionary, page);
    expect(content.sections.map((html) => (html.includes('data-section-id="hero-1"') ? 1 : 2))).toEqual([1, 2]);
    expect(content.sectionsCss).toContain('.flex');
    expect(content.mode).toBe('preview');
  });
});
