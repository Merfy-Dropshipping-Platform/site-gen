import { platformDictionary } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import {
  LIVE_PAGE,
  NO_SECTIONS,
  PAGE_SECTIONS_BYTES,
  renderPlacedSections,
  renderSection,
  type PageRender,
  type SectionFailure,
  type SectionsRender,
} from '../src/sections-render';

const dictionary = platformDictionary;
const MODULE = 'export default 1;';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const PLACED = { id: 'hero-1', name: 'shop:hero', hash: HASH, settings: { heading: 'Шарфы к первым холодам' } };
const sectionsWith = (render: SectionsRender['render']): SectionsRender => ({
  modules: new Map([[HASH, MODULE]]),
  render,
});
// Отказ процесса рендера со стадией (storefront-sections, SectionRenderError) — отказ секции, а не процесса.
const sectionError = (stage: string, message: string): Error => Object.assign(new Error(message), { stage });

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
    expect(seen).toEqual([
      { section: 'shop:hero', hash: HASH, module: MODULE, settings: PLACED.settings, blocks: [], preview: false },
    ]);
  });

  it('нет модуля или байты не те — code-missing', async () => {
    const empty = sectionsWith(() => Promise.resolve(''));
    await expect(renderSection({ ...PLACED, hash: 'sha256:00' }, empty, 'live')).rejects.toMatchObject({
      code: 'code-missing',
    });
    const wrong: SectionsRender = {
      modules: new Map([[HASH, 'export default 2;']]),
      render: () => Promise.resolve(''),
    };
    await expect(renderSection(PLACED, wrong, 'preview')).rejects.toMatchObject({ code: 'code-missing' });
  });

  it('ошибка рендера на опубликованном сайте — render-failed с именем секции', async () => {
    const failing = sectionsWith(() => Promise.reject(new Error('boom')));
    await expect(renderSection(PLACED, failing, 'live')).rejects.toMatchObject({
      code: 'render-failed',
      message: 'hero-1: секция shop:hero не отрисовалась: boom',
    });
  });

  it('секция упала на опубликованном сайте — её нет, об ошибке сообщено; removable: false — render-failed', async () => {
    const failing = sectionsWith(() =>
      Promise.reject(sectionError('render-timeout', 'секция рендерилась дольше 1000 мс')),
    );
    const failures: SectionFailure[] = [];
    expect(await renderSection(PLACED, failing, 'live', (failure) => failures.push(failure))).toBe('');
    expect(failures).toEqual([
      {
        id: 'hero-1',
        section: 'shop:hero',
        hash: HASH,
        stage: 'render-timeout',
        message: 'секция рендерилась дольше 1000 мс',
      },
    ]);
    await expect(renderSection({ ...PLACED, removable: false }, failing, 'live')).rejects.toMatchObject({
      code: 'render-failed',
    });
  });

  it('ошибка рендера в превью — блок с именем секции и текстом ошибки', async () => {
    const html = await renderSection(
      PLACED,
      sectionsWith(() => Promise.reject(new Error('<boom>'))),
      'preview',
    );
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

  it('HTML секций больше предела страницы — секция, которая не влезла, не рендерится (render-output)', async () => {
    const half = 'ш'.repeat(PAGE_SECTIONS_BYTES / 4);
    const failures: SectionFailure[] = [];
    const page: PageRender = {
      sections: sectionsWith(() => Promise.resolve(half)),
      mode: 'live',
      failed: (failure) => failures.push(failure),
    };
    const placed = [PLACED, { ...PLACED, id: 'hero-2' }, { ...PLACED, id: 'hero-3' }];
    const content = await renderPlacedSections(placed, dictionary, page);
    expect(content.sections.map((html) => html !== '')).toEqual([true, false, false]);
    expect(failures.map((failure) => [failure.id, failure.stage])).toEqual([
      ['hero-2', 'render-output'],
      ['hero-3', 'render-output'],
    ]);
  });

  it('секции по порядку и CSS их классов', async () => {
    const page: PageRender = {
      sections: sectionsWith((request) => {
        const heading = request.settings.heading;
        return Promise.resolve(`<p class="flex">${typeof heading === 'string' ? heading : ''}</p>`);
      }),
      mode: 'preview',
    };
    const second = { ...PLACED, id: 'hero-2', settings: { heading: 'Второй' } };
    const content = await renderPlacedSections([PLACED, second], dictionary, page);
    expect(content.sections.map((html) => (html.includes('data-section-id="hero-1"') ? 1 : 2))).toEqual([1, 2]);
    expect(content.sectionsCss).toContain('.flex');
    expect(content.mode).toBe('preview');
  });
});
