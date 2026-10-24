import {
  PREVIEW_AGENT,
  PREVIEW_SECTIONS_AGENT,
  parseBuildInputs,
  sha256,
  type ShellBuild,
  type ShopPageLocals,
  type ShopTheme,
} from '@merfy/storefront-build';
import type { CurrentSection } from '@merfy/storefront-sections';
import { parseTheme, platformDictionary } from '@merfy/tokens';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import standInputsJson from '../../storefront-build/fixtures/stand-inputs.json';
import novaThemeJson from '../../theme-nova/theme.json';
import { previewScriptOf, previewTags, scriptHashOf, scriptPlacedOf } from '../src/preview-code';
import { sectionPreview, shopPreview, shopSections, type ShopPreviewDeps } from '../src/shop-preview';

// Код секций в ответах превью (блок 5 «Секций и SDK», часть 5г, Р5г-12, Р5г-13): бандл и скрипт превью в HTML главной,
// код секции в /preview/section, scriptHash в /sections — на подставных зависимостях, как shop-preview.test.ts.
const SHOP = '00000000-0000-4000-8000-000000000001';
const MODULE = 'export default 1; // подбор шарфа';
const RENDER_HASH = sha256(MODULE);
const CODE = 'export default {mount(){globalThis.scarf="scarf-mounted"}};';
const CODE_HASH = sha256(CODE);
const HEX = CODE_HASH.slice('sha256:'.length);
const META: NonNullable<CurrentSection['scriptMeta']> = { uses: ['cart'], parts: ['cart'], classes: ['opacity-40'] };
const SCRIPT = { hash: CODE_HASH, code: CODE };
const MANIFEST: CurrentSection['manifest'] = {
  sdk: 1,
  name: 'scarf-match',
  kind: 'section',
  title: 'Подбор шарфа',
  settings: [],
};
const SCARF: CurrentSection = {
  name: 'shop:scarf-match',
  manifest: MANIFEST,
  render: MODULE,
  renderHash: RENDER_HASH,
  scriptMeta: META,
  script: SCRIPT,
};
const OLD: CurrentSection = {
  name: SCARF.name,
  manifest: MANIFEST,
  render: MODULE,
  renderHash: RENDER_HASH,
  script: SCRIPT,
};
const HERO: CurrentSection = {
  name: 'shop:hero',
  manifest: { sdk: 1, name: 'hero', kind: 'section', title: 'Первый экран', settings: [] },
  render: MODULE,
  renderHash: RENDER_HASH,
};
const PREVIEW_JS = 'globalThis.previewScript = "preview-script";';
const CORE = ['start', 'auth', 'cart', 'favorites', 'watchPreviewReplace']
  .map((name) => `export const ${name} = () => '${name}';`)
  .join('\n');
const SHELL_NO_PREVIEW: ShellBuild = {
  version: '0.1.0',
  hash: sha256(CORE),
  parts: ['auth', 'cart', 'favorites'],
  code: CORE,
};
const SHELL: ShellBuild = { ...SHELL_NO_PREVIEW, preview: PREVIEW_JS };
const INPUTS = parseBuildInputs({
  ...standInputsJson,
  shell: { version: SHELL.version, hash: SHELL.hash, parts: SHELL.parts },
  code: {
    sections: [
      { name: SCARF.name, kind: 'section', hash: sha256('правка'), render: RENDER_HASH, script: CODE_HASH, meta: META },
    ],
    pages: { home: [{ id: 'scarf-1', section: SCARF.name, settings: {} }] },
    globals: [],
  },
});
const RENDERS = new Map([[RENDER_HASH, MODULE]]);
const ASSETS = { shell: SHELL, modules: new Map([[CODE_HASH, Buffer.from(CODE, 'utf8')]]), renders: RENDERS };
const og = (property: string, content: string): string =>
  content === '' ? '' : `<meta property="${property}" content="${content}">`;
const socialTags = (head: ShopPageLocals['head']): string =>
  og('og:type', head.social.type) +
  og('og:title', head.title) +
  og('og:url', head.canonical) +
  og('og:site_name', head.social.siteName) +
  og('og:locale', head.social.locale) +
  `<meta name="twitter:card" content="${head.social.card}">`;
const THEME: ShopTheme = {
  tokens: parseTheme(novaThemeJson.tokens),
  render: (_path, locals) => {
    const { head } = locals;
    const description = head.description === '' ? '' : `<meta name="description" content="${head.description}">`;
    const meta = `${description}<link rel="canonical" href="${head.canonical}">${socialTags(head)}`;
    const headHtml = `${head.configHtml}<title>${head.title}</title>${meta}${head.codeHtml}`;
    return Promise.resolve(
      `<html lang="${head.lang}"><head>${headHtml}</head><body>${locals.sections.join('')}</body></html>`,
    );
  },
};

function depsOf(withAssets: boolean): ShopPreviewDeps {
  return {
    shop: () => Promise.resolve({ shopId: SHOP, dictionary: platformDictionary, inline: (html) => html }),
    stand: () => Promise.resolve({ status: 200, body: 'стенд' }),
    inputs: () => Promise.resolve({ inputs: INPUTS, renders: RENDERS, ...(withAssets ? { assets: ASSETS } : {}) }),
    theme: () => Promise.resolve(THEME),
    sections: () =>
      Promise.resolve(
        new Map([
          [SCARF.name, SCARF],
          [HERO.name, HERO],
        ]),
      ),
    render: () => Promise.resolve('<div class="flex"><p>Подбор</p></div>'),
    fonts: (css) => Promise.resolve(css),
    shell: SHELL,
  };
}

const url = (query: string) => new URL(`http://builder/preview?${query}`);
const block = (id: string, section: string) => JSON.stringify({ instance: { id, section, settings: {} } });
const BUNDLE_TAG = /<script type="application\/json" id="merfy-preview-bundle">(.*?)<\/script>/s;

describe('код секции для превью', () => {
  it('previewScriptOf: hash — 64 знака hex, uses — из script_meta, без него — части ядра; без кода — null', () => {
    expect(previewScriptOf(SCARF, SHELL)).toEqual({ hash: HEX, code: CODE, uses: ['cart'] });
    expect(previewScriptOf(OLD, SHELL)?.uses).toEqual(['auth', 'cart', 'favorites']);
    expect(previewScriptOf(OLD, null)?.uses).toEqual([]);
    expect(previewScriptOf(HERO, SHELL)).toBeNull();
    expect(previewScriptOf({ ...SCARF, script: { hash: 'md5:1', code: CODE } }, SHELL)).toBeNull();
  });

  it('scriptHashOf и scriptPlacedOf — ключи только у секции с кодом', () => {
    expect(scriptHashOf(SCARF)).toEqual({ scriptHash: HEX });
    expect(scriptHashOf(HERO)).toEqual({});
    expect(scriptPlacedOf(SCARF)).toEqual({ script: true, classes: ['opacity-40'] });
    expect(scriptPlacedOf({ ...SCARF, scriptMeta: { ...META, classes: [] } })).toEqual({ script: true });
    expect(scriptPlacedOf(HERO)).toEqual({});
  });

  it('previewTags: нет снимка кода или у сборки ядра нет preview.js — пусто', async () => {
    expect(await previewTags(INPUTS, undefined)).toBe('');
    expect(await previewTags(INPUTS, { ...ASSETS, shell: SHELL_NO_PREVIEW })).toBe('');
  });
});

describe('ответы превью с кодом секций', () => {
  it('главная: после двух скриптов превью — JSON-тег бандла и скрипт превью перед </body>; без снимка кода — как раньше', async () => {
    const agents = `<script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script>`;
    const answer = await shopPreview(depsOf(true), url(`shop=${SHOP}`));
    expect(answer.status).toBe(200);
    expect(answer.body).toContain(`${agents}<script type="application/json" id="merfy-preview-bundle">`);
    expect(answer.body).toContain(`<script>${PREVIEW_JS}</script></body>`);
    const bundle: unknown = JSON.parse(BUNDLE_TAG.exec(answer.body)?.[1] ?? '""');
    expect(String(bundle)).toContain('scarf-mounted');
    expect((await shopPreview(depsOf(false), url(`shop=${SHOP}`))).body).toContain(`${agents}</body>`);
  });

  it('/preview/section: script — код секции; в HTML тег входных данных, в CSS — класс скрипта', async () => {
    const answer = await sectionPreview(depsOf(true), SHOP, block('scarf-2', SCARF.name));
    expect(answer.status).toBe(200);
    const parsed = z.object({ html: z.string(), css: z.string(), script: z.unknown() }).parse(JSON.parse(answer.body));
    expect(parsed.script).toEqual({ hash: HEX, code: CODE, uses: ['cart'] });
    expect(parsed.html).toContain('data-merfy-input');
    expect(parsed.css).toContain('.opacity-40');
    const plain = await sectionPreview(depsOf(true), SHOP, block('hero-1', HERO.name));
    expect(z.object({ script: z.null() }).parse(JSON.parse(plain.body)).script).toBeNull();
  });

  it('/sections: scriptHash — только у секции с кодом', async () => {
    const answer = await shopSections(depsOf(true), SHOP);
    const list = z.object({ sections: z.array(z.record(z.string(), z.unknown())) }).parse(JSON.parse(answer.body));
    expect(list.sections.map((item) => [item.name, item.scriptHash])).toEqual([
      [SCARF.name, HEX],
      [HERO.name, undefined],
    ]);
  });
});
