/**
 * «Глаз» у ИМЕНОВАННОГО параметра секции обязан убирать его с витрины.
 *
 * Конструктор кладёт скрытые поля в `props.hiddenFields`, пропускать их обязан
 * порт темы. До 2026-09-12 это было сделано руками в пяти секциях из ~18 в
 * каждой теме — в остальных мерчант жал на глаз, а на витрине ничего не
 * менялось. Снимки разметки такую дыру не ловят: они рендерят секции БЕЗ
 * hiddenFields, и «поле не скрывается» для них выглядит нормой.
 *
 * Здесь секция рендерится тем же скомпилированным модулем темы, что уходит на
 * витрину, дважды: без скрытия и со скрытием. Первый рендер обязан содержать
 * узел параметра, второй — нет.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;

const base = { colorScheme: '1', padding: { top: 40, bottom: 40 } };

/** Секции, у которых параметр «Заголовок» размечен во всех пяти темах. */
const JOBS: { block: string; props: Record<string, unknown>; field?: string; probe?: string }[] = [
  { block: 'Collections', props: { ...base, id: 'Collections-1', heading: 'Коллекции' } },
  { block: 'Gallery', props: { ...base, id: 'Gallery-1', heading: 'Галерея', items: [{ id: 'i1', type: 'image', url: '', alt: 'Изображение' }] } },
  { block: 'PopularProducts', props: { ...base, id: 'Popular-1', heading: 'Популярное', cards: 4, columns: 4 } },
  { block: 'MultiRows', props: { ...base, id: 'MultiRows-1', heading: 'Строки' } },
  { block: 'MultiColumns', props: { ...base, id: 'MultiColumns-1', heading: 'Колонки' } },
  { block: 'CollapsibleSection', props: { ...base, id: 'Collapsible-1', heading: 'Вопросы' } },
  { block: 'Hero', props: { ...base, id: 'Hero-1', heading: { text: 'Заголовок' }, primaryButton: { text: 'Купить', link: '/catalog' }, secondaryButton: { text: 'Подробнее', link: '/about' } }, field: 'buttons', probe: 'primaryButton' },
];

const FIELD = 'heading';
const markerOf = (f: string) => `data-puck-subsection-field="${f}"`;

type Rendered = Record<string, string>;

function render(theme: string, jobs: { block: string; props: Record<string, unknown> }[]): Rendered {
  const raw = execFileSync('node', [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const out: Rendered = {};
  for (const entry of JSON.parse(raw) as { block: string; html?: string; error?: string }[]) {
    out[entry.block] = entry.error ? `ОШИБКА РЕНДЕРА: ${entry.error}` : (entry.html ?? '');
  }
  return out;
}

describe.each(THEMES)('скрытие именованного параметра — %s', (theme) => {
  const dist = resolve(SITES_ROOT, 'dist', 'theme-sections', theme, 'manifest.json');
  const built = existsSync(dist);

  let shown: Rendered = {};
  let hidden: Rendered = {};

  beforeAll(() => {
    if (!built) return;
    shown = render(theme, JOBS);
    hidden = render(
      theme,
      JOBS.map((j) => ({ ...j, props: { ...j.props, hiddenFields: [j.field ?? FIELD] } })),
    );
  });

  it('секции темы собраны (pnpm build:theme-sections)', () => {
    expect(built).toBe(true);
  });

  for (const { block, field, probe } of JOBS) {
    it(`${block}: параметр виден, пока его не скрыли`, () => {
      if (!built) return;
      const html = shown[block];
      if (html === undefined) return; // блока нет в этой теме
      expect(html).not.toMatch(/^ОШИБКА РЕНДЕРА/);
      expect(html).toContain(markerOf(probe ?? field ?? FIELD));
    });

    it(`${block}: скрытый параметр исчезает из разметки`, () => {
      if (!built) return;
      const html = hidden[block];
      if (html === undefined) return;
      expect(html).not.toMatch(/^ОШИБКА РЕНДЕРА/);
      expect(html).not.toContain(markerOf(probe ?? field ?? FIELD));
    });
  }
});
