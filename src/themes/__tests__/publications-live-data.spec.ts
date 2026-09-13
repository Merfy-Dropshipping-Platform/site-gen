/**
 * Пункт 7 тестировщика: «В секции Публикации моканые данные. Ожидаемый
 * результат: брать данные из админки и только, оживить при выборе публикации
 * в секции».
 *
 * Проверка идёт РЕНДЕРОМ реальных скомпилированных секций пяти тем (тот же
 * модуль, что уходит в превью и на витрину), плюс общий theme-base блок —
 * его берёт rose, у которой собственного порта «Публикаций» нет
 * (`dist/theme-sections/rose/manifest.json` не содержит Publications).
 *
 * Два состояния:
 *   1. у магазина ЕСТЬ публикации → в разметке ровно они;
 *   2. публикаций НЕТ → ни одной выдуманной записи (дат/заголовков-фантомов).
 *
 * Требует: pnpm build && pnpm build:blocks && pnpm build:theme-sections <тема>.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;

/** Выдуманные записи, которые секции рисовали до правки. Возврату не подлежат. */
const INVENTED = [
  'Новая коллекция весна 2025',
  'Как ухаживать за изделиями',
  'Как ухаживать за кожаными изделиями',
  'История бренда: от идеи до магазина',
  'Тренды сезона 2025',
  'Тренды аксессуаров 2025',
  '15 марта 2025',
  '28 февраля 2025',
  '10 февраля 2025',
  '25 января 2025',
];

const REAL_PUBLICATIONS = [
  {
    id: 'pub-1',
    title: 'Открыли пункт выдачи в Казани',
    slug: 'kazan-pvz',
    category: 'news',
    excerpt: 'Забирать заказы стало ближе.',
    coverImageUrl: 'https://cdn.example/kazan.jpg',
    publishedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 'pub-2',
    title: 'Гид по размерам',
    slug: 'size-guide',
    category: 'articles',
    excerpt: 'Как выбрать свой размер.',
    coverImageUrl: null,
    publishedAt: '2026-08-12T09:00:00.000Z',
  },
];

const props = {
  id: 'Publications-1',
  colorScheme: '1',
  padding: { top: 40, bottom: 40 },
  heading: 'Публикации',
  cardsCount: 3,
  columnsCount: 3,
};

type Row = {
  block: string;
  html?: string;
  error?: string;
  missing?: boolean;
  pipelineError?: string;
};

function render(theme: string, jobs: unknown[]): Row[] {
  const raw = execFileSync('node', [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw) as Row[];
}

/** Видимый мерчанту текст секции — без тегов, скриптов и стилей. */
function text(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe.each(THEMES)('«Публикации» берут данные магазина — %s', (theme) => {
  const built = existsSync(
    resolve(SITES_ROOT, 'dist', 'theme-sections', theme, 'manifest.json'),
  );

  // rose рендерит общий блок theme-base (своего порта нет) — проверяем ровно то,
  // что тема реально показывает, а не «в манифесте пусто, значит тест молчит».
  const jobs = (catalog: unknown) =>
    theme === 'rose'
      ? [{ block: 'Publications', pkg: 'theme-base', props, live: true, catalog }]
      : [{ block: 'Publications', props, live: true, catalog }];

  let withData: Row;
  let empty: Row;

  beforeAll(() => {
    if (!built) return;
    withData = render(theme, jobs({ publications: REAL_PUBLICATIONS }))[0];
    empty = render(theme, jobs({ publications: [] }))[0];
  }, 120_000);

  it('секции темы собраны', () => {
    expect(built).toBe(true);
  });

  it('рендерится без ошибок', () => {
    if (!built) return;
    expect(withData.error).toBeUndefined();
    expect(withData.pipelineError).toBeUndefined();
    expect(withData.missing).toBeFalsy();
  });

  it('показывает публикации магазина', () => {
    if (!built) return;
    const t = text(withData.html ?? '');
    expect(t).toContain('Открыли пункт выдачи в Казани');
    expect(t).toContain('Гид по размерам');
  });

  it('на реальных данных не подмешивает выдуманные записи', () => {
    if (!built) return;
    const t = text(withData.html ?? '');
    for (const phrase of INVENTED) expect(t).not.toContain(phrase);
  });

  it('публикаций нет — ни одной выдуманной записи', () => {
    if (!built) return;
    const t = text(empty.html ?? '');
    for (const phrase of INVENTED) expect(t).not.toContain(phrase);
  });

  it('публикаций нет — секция рендерится и не падает', () => {
    if (!built) return;
    expect(empty.error).toBeUndefined();
    expect(empty.html ?? '').toContain('Публикации');
  });

  it('выбор конкретной публикации показывает ИМЕННО её', () => {
    if (!built) return;
    const one = render(
      theme,
      theme === 'rose'
        ? [{
            block: 'Publications',
            pkg: 'theme-base',
            props: { ...props, publicationType: 'pub-2' },
            live: true,
            catalog: { publications: REAL_PUBLICATIONS },
          }]
        : [{
            block: 'Publications',
            props: { ...props, publicationType: 'pub-2' },
            live: true,
            catalog: { publications: REAL_PUBLICATIONS },
          }],
    )[0];
    const t = text(one.html ?? '');
    expect(t).toContain('Гид по размерам');
    expect(t).not.toContain('Открыли пункт выдачи в Казани');
  });
});
