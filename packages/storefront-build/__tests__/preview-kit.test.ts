import { describe, expect, it } from 'vitest';
import type { CodeAssets } from '../src/code';
import { previewCode } from '../src/preview-bundle';
import { previewKit } from '../src/preview-kit';
import type { ShellBuild } from '../src/shell';
import { ASSETS, SHELL_BUILD, codeInputs } from './support-code';
import { KIT, KIT_FILES } from './support-kit';

// Поведения в превью (блок 6 «Секций и SDK», часть 6в; design.md блока 6, раздел 12): бандл превью — со всеми
// поведениями сборки ядра, появлениями и провайдером ctx.animate, без разбора HTML страницы.
const PREVIEW_SHELL: ShellBuild = {
  ...SHELL_BUILD,
  code: [SHELL_BUILD.code, "export const watchPreviewReplace = () => 'preview-watch';"].join('\n'),
  preview: 'globalThis.previewScript = "preview-script";',
};
const KIT_ASSETS: CodeAssets = { ...ASSETS, shell: { ...PREVIEW_SHELL, kit: KIT } };
const MARKERS = ['kit-part', 'kit-accordion', 'kit-carousel', 'kit-nav-menu', 'kit-reveal', 'kit-animate', 'kit-chunk'];

// Строка бандла из JSON-тега превью.
function bundleOf(tags: string): string {
  const json = /<script type="application\/json" id="[^"]+">(.*?)<\/script>/s.exec(tags)?.[1] ?? '""';
  const text: unknown = JSON.parse(json);
  return typeof text === 'string' ? text : '';
}

describe('поведения в бандле превью', () => {
  it('previewKit: все поведения сборки ядра, появления и animate; нет kit — без поведений', () => {
    expect(previewKit({ ...PREVIEW_SHELL, kit: KIT })).toEqual({
      kit: {
        files: KIT_FILES,
        plan: { behaviors: ['accordion', 'carousel', 'nav-menu'], reveal: true, animate: true },
      },
    });
    expect(previewKit(PREVIEW_SHELL)).toEqual({});
  });

  it('бандл превью — со всеми файлами kit, общий кусок один раз; флага data-merfy-motion нет', async () => {
    const { tags, notices } = await previewCode(codeInputs(), KIT_ASSETS);
    const bundle = bundleOf(tags);
    expect(notices).toEqual([]);
    expect(MARKERS.filter((marker) => !bundle.includes(marker))).toEqual([]);
    expect(bundle.split('kit-chunk')).toHaveLength(2);
    expect(bundle).toContain('preview-watch');
    expect(tags).not.toContain('data-merfy-motion');
  });

  it('сборка ядра без kit — превью без поведений, как в 5г', async () => {
    const bundle = bundleOf((await previewCode(codeInputs(), { ...ASSETS, shell: PREVIEW_SHELL })).tags);
    expect(bundle).toContain('preview-watch');
    expect(bundle).not.toContain('kit-');
  });
});
