import { describe, expect, it } from 'vitest';
import { bundleEntry, type BundleSection } from '../src/bundle';
import { hashOf, sha256 } from '../src/canonical';
import { pageBundle, type CodeAssets } from '../src/code';
import { parseBuildInputs, type BuildInputs, type CodeSection } from '../src/inputs';
import { previewCode } from '../src/preview-bundle';
import { NO_SECTIONS, type PageRender } from '../src/sections-render';
import type { ShellBuild } from '../src/shell';
import { errorOf } from './support';
import { ASSETS, BADGE, HERO, MODULES, SHELL_BUILD, codeInputs } from './support-code';

// Свои сторы в сборке (свои сторы, 01.11): стор — строка code.sections вида store без места и модуля рендера; в бандл
// страницы он идёт, только когда его читает секция или глобальный скрипт этой страницы (сам или через другой стор);
// в аргументах бандла — pageStores([…]) рядом с секциями, строки секций не меняются.
const bytes = (text: string): Uint8Array => Buffer.from(text, 'utf8');
const hexOf = (hash: string | null): string => (hash ?? '').slice('sha256:'.length);

const STORE_SCRIPTS = {
  items: bytes('export default {value:!1,start(c,s){globalThis.items="items-started"}};'),
  offer: bytes('export default {value:"нет",start(c,s){globalThis.offer="offer-started"}};'),
  unused: bytes('export default {value:0,start(){globalThis.unused="unused-started"}};'),
};

function storeSection(name: string, script: Uint8Array, uses: string[]): CodeSection {
  const scriptHash = sha256(script);
  return {
    name,
    kind: 'store',
    hash: hashOf({ name, render: null, script: scriptHash }),
    render: null,
    script: scriptHash,
    meta: { uses, parts: [], classes: [] },
  };
}

const ITEMS = storeSection('shop:has-items', STORE_SCRIPTS.items, ['cart']);
const OFFER = storeSection('shop:offer', STORE_SCRIPTS.offer, ['store:shop:has-items']);
const UNUSED = storeSection('shop:unused', STORE_SCRIPTS.unused, []);

// Ядро для тестов с экспортами pageStores и watchPreviewReplace, как у dist/core.js.
const CORE = `${SHELL_BUILD.code}\nexport const pageStores = (list) => ({ stores: list });\nexport const watchPreviewReplace = () => undefined;`;
const SHELL_WITH_STORES: ShellBuild = { ...SHELL_BUILD, code: CORE, hash: sha256(CORE) };
const STORE_MODULES = new Map([
  ...MODULES,
  ...Object.values(STORE_SCRIPTS).map((content): [string, Uint8Array] => [sha256(content), content]),
]);
const ASSETS_WITH_STORES: CodeAssets = { ...ASSETS, shell: SHELL_WITH_STORES, modules: STORE_MODULES };
const livePage = (): PageRender => ({
  sections: { ...NO_SECTIONS, modules: ASSETS.renders },
  mode: 'live',
  code: ASSETS_WITH_STORES,
});

// Значок корзины читает shop:offer, тот — shop:has-items; shop:unused никто не читает.
function storeInputs(change: (inputs: BuildInputs) => void = () => undefined): BuildInputs {
  return codeInputs((inputs) => {
    inputs.shell = { version: SHELL_WITH_STORES.version, hash: SHELL_WITH_STORES.hash, parts: SHELL_WITH_STORES.parts };
    inputs.code.sections = [
      ...inputs.code.sections.map((section) =>
        section.name === BADGE.name
          ? { ...section, meta: { uses: ['cart', 'store:shop:offer'], parts: ['cart'], classes: [] } }
          : section,
      ),
      ITEMS,
      OFFER,
      UNUSED,
    ];
    inputs.code.pages = { ...inputs.code.pages, about: [{ id: 'hero-1', section: HERO.name, settings: {} }] };
    change(inputs);
  });
}

async function bundleText(inputs: BuildInputs, pageId: string): Promise<string> {
  const bundle = await pageBundle(inputs, pageId, livePage());
  return bundle?.file === null ? (bundle.tag ?? '') : new TextDecoder().decode(bundle?.file?.content);
}

describe('аргументы бандла со своими сторами', () => {
  const badge: BundleSection = { name: BADGE.name, kind: 'section', script: hexOf(BADGE.script), uses: ['cart'] };
  const items: BundleSection = { name: ITEMS.name, kind: 'store', script: hexOf(ITEMS.script), uses: ['cart'] };

  it('сторы — в stores: pageStores([…]) без поля kind; строки секций те же, что без сторов', () => {
    const withStore = bundleEntry(['cart'], [badge, items]);
    const without = bundleEntry(['cart'], [badge]);
    expect(withStore).toContain("import { start, cart, pageStores } from '@merfy/shell/core';");
    expect(withStore).toContain(
      `stores: pageStores([{ name: "shop:has-items", script: "${items.script}", uses: ["cart"], definition: s1 }])`,
    );
    const sectionsOf = (text: string): string => text.slice(text.indexOf('sections: ['), text.indexOf(']') + 1);
    expect(sectionsOf(withStore)).toBe(sectionsOf(without));
    expect(without).not.toContain('pageStores');
  });
});

describe('свой стор — в бандле только тех страниц, где его читают', () => {
  it('главная: значок читает offer, offer — has-items; оба в бандле, unused — нет', async () => {
    const text = await bundleText(storeInputs(), 'home');
    expect(text).toContain('items-started');
    expect(text).toContain('offer-started');
    expect(text).not.toContain('unused-started');
    expect(text).toContain('stores:');
  });

  it('страница без читающих секций — сторов нет, pageStores не вызывается', async () => {
    const text = await bundleText(storeInputs(), 'about');
    expect(text).not.toContain('items-started');
    expect(text).not.toContain('offer-started');
    expect(text).not.toContain('stores:');
  });

  it('глобальный скрипт читает стор — стор на каждой странице', async () => {
    const inputs = storeInputs((changed) => {
      changed.code.sections = changed.code.sections.map((section) =>
        section.kind === 'global'
          ? { ...section, meta: { uses: ['store:shop:unused'], parts: [], classes: [] } }
          : section,
      );
    });
    expect(await bundleText(inputs, 'about')).toContain('unused-started');
  });

  it('превью: сторы кода магазина — в бандле превью', async () => {
    const preview = await previewCode(storeInputs(), {
      ...ASSETS_WITH_STORES,
      shell: { ...SHELL_WITH_STORES, preview: '' },
    });
    const json = /<script type="application\/json" id="[^"]+">(.*?)<\/script>/s.exec(preview.tags)?.[1] ?? '""';
    const text = String(JSON.parse(json));
    expect(text).toContain('items-started');
    expect(text).toContain('stores:');
  });
});

describe('стор во входах сборки', () => {
  it('стор с "store:…" в meta.uses проходит схему', () => {
    const inputs = storeInputs();
    expect(parseBuildInputs(inputs)).toEqual(inputs);
  });

  it('модуль рендера у стора — code-invalid; стор на месте секции — code-invalid', () => {
    const withRender = storeInputs((inputs) => {
      inputs.code.sections = inputs.code.sections.map((section) =>
        section.name === ITEMS.name ? { ...section, render: HERO.render } : section,
      );
    });
    const error = errorOf(() => parseBuildInputs(withRender));
    expect(error).toMatchObject({ code: 'code-invalid' });
    expect(error instanceof Error ? error.message : '').toContain('у стора модуля рендера не бывает');
    const placed = storeInputs((inputs) => {
      inputs.code.pages = { home: [{ id: 'items-1', section: ITEMS.name, settings: {} }] };
    });
    expect(errorOf(() => parseBuildInputs(placed))).toMatchObject({ code: 'code-invalid' });
  });
});
