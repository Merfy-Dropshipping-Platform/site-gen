import { PREVIEW_BUNDLE_TAG_ID } from '@merfy/shell/preview';
import { describe, expect, it } from 'vitest';
import { bundleEntry } from '../src/bundle';
import { sha256 } from '../src/canonical';
import type { CodeAssets } from '../src/code';
import type { CodeSection } from '../src/inputs';
import { previewCode } from '../src/preview-bundle';
import { ASSETS, BADGE, MODULES, SHELL_BUILD, codeInputs } from './support-code';

// Код страницы превью (блок 5 «Секций и SDK», часть 5г, Р5г-10): JSON-тег со строкой бандла и скрипт превью. Бандл —
// все секции кода магазина со скриптом, ядро с watchPreviewReplace, без аналитики.
const PREVIEW_SCRIPT = 'globalThis.previewScript = "preview-script";';
const PREVIEW_CORE = [
  SHELL_BUILD.code,
  "export const newsletter = { name: 'newsletter' };",
  "export const watchPreviewReplace = () => 'preview-watch';",
].join('\n');
const PREVIEW_ASSETS: CodeAssets = {
  ...ASSETS,
  shell: { ...SHELL_BUILD, code: PREVIEW_CORE, preview: PREVIEW_SCRIPT },
};
const NONE = { tags: '', notices: [] };
const TAGS = /^<script type="application\/json" id="([^"]+)">(.*)<\/script><script>(.*)<\/script>$/s;

// Теги превью по частям: id JSON-тега, его текст, строка бандла (JSON.parse) и текст скрипта превью.
function readTags(tags: string): { id: string; json: string; bundle: string; script: string } {
  const [, id = '', json = '""', script = ''] = TAGS.exec(tags) ?? [];
  const bundle: unknown = JSON.parse(json);
  return { id, json, bundle: typeof bundle === 'string' ? bundle : '', script };
}

describe('код страницы превью', () => {
  it('bundleEntry с preview — watchPreviewReplace из ядра и preview в start; без preview — как раньше', () => {
    expect(bundleEntry(['cart'], [], undefined, true)).toBe(
      "import { start, cart, watchPreviewReplace } from '@merfy/shell/core';\n" +
        'start({ parts: [cart], sections: [], preview: watchPreviewReplace });\n',
    );
    expect(bundleEntry(['cart'], [])).toBe(
      "import { start, cart } from '@merfy/shell/core';\nstart({ parts: [cart], sections: [] });\n",
    );
  });

  it('нет dist/preview.js, сборки ядра или ядра во входах — тегов нет', async () => {
    expect(await previewCode(codeInputs(), ASSETS)).toEqual(NONE);
    expect(await previewCode(codeInputs(), { ...PREVIEW_ASSETS, shell: null })).toEqual(NONE);
    const noShell = codeInputs((inputs) => {
      inputs.shell = null;
    });
    expect(await previewCode(noShell, PREVIEW_ASSETS)).toEqual(NONE);
  });

  it('JSON-тег со строкой бандла, за ним скрипт превью; в бандле все секции со скриптом и preview, аналитики нет', async () => {
    const { tags, notices } = await previewCode(codeInputs(), PREVIEW_ASSETS);
    const { id, bundle, script } = readTags(tags);
    expect(notices).toEqual([]);
    expect(id).toBe(PREVIEW_BUNDLE_TAG_ID);
    expect(script).toBe(PREVIEW_SCRIPT);
    const markers = ['badge-mounted', 'reviews-mounted', 'geo-mounted', 'preview-watch', 'preview:', 'name:"cart"'];
    expect(markers.filter((marker) => !bundle.includes(marker))).toEqual([]);
    expect(bundle).not.toContain('name:"analytics"');
  });

  it('«</script>» в коде секции — в JSON-теге нет «<», строка бандла после JSON.parse с ним', async () => {
    const module = Buffer.from('export default {mount(){globalThis.tricky="</script><!--"}};', 'utf8');
    const hash = sha256(module);
    const tricky: CodeSection = {
      name: 'shop:tricky',
      kind: 'section',
      hash: sha256('tricky'),
      render: null,
      script: hash,
    };
    const inputs = codeInputs((draft) => {
      draft.code.sections.push(tricky);
    });
    const modules = new Map([...MODULES, [hash, module]]);
    const { json, bundle } = readTags((await previewCode(inputs, { ...PREVIEW_ASSETS, modules })).tags);
    expect(json).not.toContain('<');
    expect(bundle).toContain('tricky');
    expect(bundle).toContain('<');
  });

  it('uses секции — из её meta, часть из meta вне ядра — в бандле; у секции без meta — части ядра', async () => {
    const meta = { uses: ['cart'], parts: ['cart', 'newsletter'], classes: [] };
    const inputs = codeInputs((draft) => {
      draft.code.sections = draft.code.sections.map((section) =>
        section.name === BADGE.name ? { ...section, meta } : section,
      );
    });
    const { bundle } = readTags((await previewCode(inputs, PREVIEW_ASSETS)).tags);
    expect(bundle).toContain('name:"newsletter"');
    expect(bundle).toContain('uses:["cart"]');
    expect(bundle).toContain('uses:["auth","cart","favorites"]');
  });

  it('нет байтов модуля секции — code-missing', async () => {
    const modules = new Map([...MODULES].filter(([hash]) => hash !== BADGE.script));
    await expect(previewCode(codeInputs(), { ...PREVIEW_ASSETS, modules })).rejects.toMatchObject({
      code: 'code-missing',
    });
  });
});
