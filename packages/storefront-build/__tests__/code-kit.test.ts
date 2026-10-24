import { MOTION_CSS, MOTION_HEAD_SCRIPT } from '@merfy/shell/behaviors/motion-css';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { pageBundle } from '../src/code';
import { NO_SECTIONS, type PageRender } from '../src/sections-render';
import { ASSETS, MODULES, RENDERS, SHELL_BUILD, codeInputs } from './support-code';
import { KIT } from './support-kit';

// Поведения и движение в бандле страницы (блок 6, часть 6б; Р6б-2, Р6б-5): что подключено — по HTML страницы и скриптам
// секций; флаг и запасной CSS — в теге бандла только при data-animate.
const HEAD = `<script>${MOTION_HEAD_SCRIPT}</script><style id="merfy-motion">${MOTION_CSS}</style>`;
const GLOW = 'export default {mount(e,c){c.animate(e.ref("box"),{opacity:[0,1]})}};';

const livePage = (kit: boolean, extra: Map<string, Uint8Array> = new Map()): PageRender => ({
  sections: { ...NO_SECTIONS, modules: RENDERS },
  mode: 'live',
  code: {
    ...ASSETS,
    shell: kit ? { ...SHELL_BUILD, kit: KIT } : SHELL_BUILD,
    modules: new Map([...MODULES, ...extra]),
  },
});
const textOf = (bundle: Awaited<ReturnType<typeof pageBundle>>): string =>
  new TextDecoder().decode(bundle?.file?.content);

describe('поведения в pageBundle', () => {
  it('data-behavior в HTML страницы — файл поведения и общий кусок; чужих файлов и флага движения нет', async () => {
    const html = { sections: ['<merfy-section><div data-behavior="accordion"></div></merfy-section>'] };
    const bundle = await pageBundle(codeInputs(), 'home', livePage(true), html);
    const text = textOf(bundle);
    for (const marker of ['kit-part', 'kit-accordion', 'kit-chunk']) expect(text).toContain(marker);
    for (const marker of ['kit-carousel', 'kit-reveal', 'kit-animate']) expect(text).not.toContain(marker);
    expect(bundle?.tag.startsWith('<script type="module"')).toBe(true);
  });

  it('data-animate — reveal и флаг движения: <script> и <style id="merfy-motion"> перед бандлом', async () => {
    const html = { header: ['<h1 data-animate="appear">x</h1>'], sections: [] };
    const bundle = await pageBundle(codeInputs(), 'home', livePage(true), html);
    expect(textOf(bundle)).toContain('kit-reveal');
    expect(bundle?.tag.startsWith(HEAD)).toBe(true);
    expect(bundle?.tag.endsWith('</script>')).toBe(true);
  });

  it('ctx.animate в скрипте секции страницы — провайдер animate', async () => {
    const hash = sha256(GLOW);
    const inputs = codeInputs((changed) => {
      changed.code.sections.push({ name: 'shop:glow', kind: 'section', hash, render: null, script: hash });
      changed.code.pages.home?.push({ id: 'glow-1', section: 'shop:glow', settings: {} });
    });
    const page = livePage(true, new Map([[hash, Buffer.from(GLOW)]]));
    const text = textOf(await pageBundle(inputs, 'home', page, { sections: [] }));
    expect(text).toContain('kit-animate');
    expect(text).not.toContain('kit-reveal');
  });

  it('страница без поведений и сборка ядра без kit — как в 5б: меток нет', async () => {
    const html = { sections: ['<div data-behavior="accordion" data-animate="appear"></div>'] };
    expect(textOf(await pageBundle(codeInputs(), 'home', livePage(false), html))).not.toContain('kit-');
    const plain = await pageBundle(codeInputs(), 'home', livePage(true), { sections: ['<p>текст</p>'] });
    expect(textOf(plain)).not.toContain('kit-');
    expect(plain?.tag.includes('merfy-motion')).toBe(false);
  });

  it('без четвёртого аргумента — как раньше; превью — без бандла', async () => {
    expect(textOf(await pageBundle(codeInputs(), 'home', livePage(true)))).not.toContain('kit-');
    expect(await pageBundle(codeInputs(), 'home', { ...livePage(true), mode: 'preview' }, { sections: [] })).toBeNull();
  });
});
