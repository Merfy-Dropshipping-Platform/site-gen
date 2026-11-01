import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { overlayPartsOf, pageBundle, placedSections, type CodeAssets } from '../src/code';
import type { BuildInputs } from '../src/inputs';
import { previewCode } from '../src/preview-bundle';
import { NO_SECTIONS, type PageRender } from '../src/sections-render';
import { ASSETS, HERO, RENDERS, SHELL_BUILD, codeInputs } from './support-code';

// Часть окон поверх страницы в бандле (01.11): часть overlay — только у страницы, где стоит секция-окно
// (CodeSection.overlay), и у превью магазина с такой секцией; в core.json её нет — бюджет ядра без неё.
const CORE = `${SHELL_BUILD.code}\nexport const overlay = { name: 'overlay' };\nexport const watchPreviewReplace = () => 0;`;
const SHELL = { ...SHELL_BUILD, hash: sha256(CORE), code: CORE, preview: 'globalThis.preview = 1;' };
const OVERLAY_ASSETS: CodeAssets = { ...ASSETS, shell: SHELL };

// Входы с ядром стенда; window — у «Героя» окно поверх страницы, его экземпляр — в списке overlay.
function inputsOf(window: boolean): BuildInputs {
  return codeInputs((inputs) => {
    if (inputs.shell !== null) inputs.shell.hash = SHELL.hash;
    if (!window) return;
    inputs.code.sections = inputs.code.sections.map((section) =>
      section.name === HERO.name ? { ...section, overlay: true } : section,
    );
    inputs.code.pages.overlay = [{ id: 'promo-1', section: HERO.name, settings: {} }];
  });
}

const livePage = (): PageRender => ({
  sections: { ...NO_SECTIONS, modules: RENDERS },
  mode: 'live',
  code: OVERLAY_ASSETS,
});

async function bundleText(inputs: BuildInputs, pageId = 'home'): Promise<string> {
  const bundle = await pageBundle(inputs, pageId, livePage());
  return new TextDecoder().decode(bundle?.file?.content);
}

describe('часть overlay в бандле страницы', () => {
  it('страница с окном — с частью overlay; страница без окна — без неё', async () => {
    expect(await bundleText(inputsOf(true))).toContain('name:"overlay"');
    expect(await bundleText(inputsOf(false))).not.toContain('name:"overlay"');
  });

  it('окно в списке overlay — на каждой странице: часть и на своей странице магазина', async () => {
    expect(await bundleText(inputsOf(true), 'page-custom-x')).toContain('name:"overlay"');
  });

  it('превью магазина с окном — с частью overlay', async () => {
    const preview = await previewCode(inputsOf(true), OVERLAY_ASSETS);
    expect(preview.tags).toContain('name:\\"overlay\\"');
    const without = await previewCode(inputsOf(false), OVERLAY_ASSETS);
    expect(without.tags).not.toContain('name:\\"overlay\\"');
  });

  it('overlayPartsOf и экземпляр: overlay: true — только у секции-окна', () => {
    const inputs = inputsOf(true);
    expect(overlayPartsOf(inputs.code.sections)).toEqual(['overlay']);
    expect(overlayPartsOf(inputsOf(false).code.sections)).toEqual([]);
    expect(placedSections(inputs, 'overlay').map((entry) => entry.overlay)).toEqual([true]);
    expect(placedSections(inputs, 'home').every((entry) => entry.name === HERO.name || !('overlay' in entry))).toBe(
      true,
    );
  });
});
