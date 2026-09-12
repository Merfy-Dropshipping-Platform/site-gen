/**
 * Галерея рисует столько плиток, сколько дал мерчант.
 *
 * До 2026-09-12 список был обрезан дважды: схема блока разрешала `min(1).max(3)`,
 * и каждый порт резал `items.slice(0, 3)`. Добавить четвёртую картинку было
 * нельзя, а если бы данные всё же пришли — четвёртая молча пропадала. Владелец
 * просил «отображается любое количество»; потолок поднят до 12, и раскладка
 * переносит лишние плитки в сетку вместо вытянутой колонки.
 *
 * Секция при этом остаётся на странице при ЛЮБОМ количестве, включая ноль —
 * это второе требование из того же баг-репорта.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;
const COUNTS = [0, 1, 3, 4, 6, 12] as const;

const item = (i: number) => ({
  id: `i${i}`,
  type: 'image',
  url: '/placeholders/landscape-image.png',
  alt: `Изображение ${i}`,
});

describe.each(THEMES)('галерея — количество плиток (%s)', (theme) => {
  const built = existsSync(
    resolve(SITES_ROOT, 'dist', 'theme-sections', theme, 'manifest.json'),
  );
  let rendered: Record<number, string> = {};

  beforeAll(() => {
    if (!built) return;
    const jobs = COUNTS.map((n) => ({
      block: 'Gallery',
      props: {
        id: `Gallery-${n}`,
        heading: 'Галерея',
        text: 'Текст секции',
        colorScheme: '1',
        padding: { top: 40, bottom: 40 },
        layout: 'featured',
        items: Array.from({ length: n }, (_, i) => item(i + 1)),
      },
    }));
    // Рендерер ключует результат по имени блока, поэтому гоним по одному.
    rendered = {};
    COUNTS.forEach((n, idx) => {
      const raw = execFileSync(
        'node',
        [RENDERER, theme, JSON.stringify([jobs[idx]])],
        { cwd: SITES_ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
      );
      const entry = JSON.parse(raw)[0] as { html?: string; error?: string };
      rendered[n] = entry.error ? `ОШИБКА: ${entry.error}` : (entry.html ?? '');
    });
  });

  it('секции темы собраны (pnpm build:theme-sections)', () => {
    expect(built).toBe(true);
  });

  // Единственная видимая плитка занимает всю ширину и получает собственное
  // соотношение сторон. Без этого rose и flux схлопывали её в нулевую высоту
  // (hero брал высоту от соседней колонки), а остальные темы оставляли её
  // прижатой к половине секции рядом с пустотой.
  it('одна плитка растягивается на всю ширину (16:9), а не жмётся в колонку', () => {
    if (!built) return;
    expect(rendered[1]).toContain('aspect-[16/9]');
  });

  it('три плитки сохраняют прежнюю раскладку', () => {
    if (!built) return;
    expect(rendered[3]).not.toContain('aspect-[16/9]');
  });

  for (const n of COUNTS) {
    it(`${n} элементов → ${n} плиток, секция и заголовок на месте`, () => {
      if (!built) return;
      const html = rendered[n];
      expect(html).not.toMatch(/^ОШИБКА/);
      expect(html).toContain(`data-puck-component-id="Gallery-${n}"`);
      expect(html).toContain('Галерея');
      expect((html.match(/<img/g) ?? []).length).toBe(n);
    });
  }
});
