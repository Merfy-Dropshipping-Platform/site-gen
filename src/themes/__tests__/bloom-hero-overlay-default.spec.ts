import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * bloom «Первый экран»: «Затемнение» по умолчанию 0, как у верстальщиков
 * (Bloom-theme @5aae2ad6 Hero.astro — на широком экране фото без слоя).
 *
 * Владелец 24.09 на сравнении с bloom.merfy.ru: наш первый экран серый во всю
 * ширину. Причина — дефолт `blockDefaults.Hero.overlay = 40` (пришёл общей
 * чисткой 07.09, отдельного решения не было): чёрный слой 40% на всю секцию.
 * Затемнение, выставленное мерчантом явно, остаётся как есть.
 */

const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const built = existsSync(resolve(SITES_ROOT, 'dist', 'theme-sections', 'bloom', 'manifest.json'));

/** Живая цепочка: adaptLegacyProps → blockDefaults темы → resolveBlockProps. */
function renderHero(props: Record<string, unknown>): string {
  const raw = execFileSync('node', [RENDERER, 'bloom', JSON.stringify([{ block: 'Hero', props, live: true }])], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const entry = JSON.parse(raw)[0] as { html?: string; error?: string; pipelineError?: string };
  if (entry.error || entry.pipelineError) throw new Error(entry.error ?? entry.pipelineError);
  return entry.html ?? '';
}

/** Слой «Затемнения»: `bg-black` + инлайн-прозрачность. */
const overlayLayers = (html: string) => html.match(/class="[^"]*\bbg-black"[^>]*style="opacity:[^"]*"/g) ?? [];

const HERO = {
  id: 'Hero-1',
  heading: { text: 'Искусство заботы о себе' },
  backgroundImages: { url1: '/images/hero-photo.webp' },
};

describe('bloom «Первый экран»: затемнение по умолчанию как у верстальщиков', () => {
  it('секции темы собраны (pnpm build:theme-sections)', () => {
    expect(built).toBe(true);
  });

  (built ? it : it.skip)('без своего значения — слоя затемнения нет', () => {
    expect(overlayLayers(renderHero(HERO))).toEqual([]);
  });

  (built ? it : it.skip)('своё значение мерчанта остаётся', () => {
    const layers = overlayLayers(renderHero({ ...HERO, overlay: 40 }));
    expect(layers).toHaveLength(1);
    expect(layers[0]).toContain('opacity:0.4');
  });
});
