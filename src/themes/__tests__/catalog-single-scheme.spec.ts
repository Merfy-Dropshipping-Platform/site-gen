/**
 * «Группа товаров» («Каталог товаров», блок Catalog) красится ОДНОЙ схемой.
 *
 * Просьба тестировщика 14.09, санкционирована владельцем — дословно:
 *   «В секции Группа товаров в сайдбаре и настройке убрать цветовую схему
 *    контейнера. Ожидаемый результат: цветовая схема одна для всей секции».
 *
 * «Группа товаров» — это подпись КОНСТРУКТОРА для блока `Catalog`
 * (backend/services/constructor/src/lib/componentLabels.ts:22); в puckConfig
 * темы тот же блок подписан «Каталог товаров». Поэтому сторожим по имени
 * блока, а не по подписи.
 *
 * ЗАМЕР «ДО» (chromium 1440×900, реальный CSS пяти витрин, снятый со стендов
 * 14.09; схема секции 4 → rgb(10,20,30), схема контейнера 3 → rgb(200,100,50)):
 *
 *   тема     подложка секции   внутр. контейнер   классы схем внутри секции
 *   rose     rgb(10,20,30)     прозрачный         нет
 *   vanilla  rgb(238,238,238)  прозрачный         нет
 *   flux     rgb(10,20,30)     прозрачный         нет
 *   satin    rgb(10,20,30)     прозрачный         нет
 *   bloom    rgb(10,20,30)     прозрачный         нет
 *
 * То есть на ЖИВОМ пути контейнерная схема не красила ничего уже до правки:
 * `adaptLegacyProps` приводит `colorScheme`/`containerColorScheme` к ЧИСЛУ
 * (themes/page-blocks.ts, coerceGenericLegacyProps), а порты проверяют
 * `typeof … === 'string'` — класс не печатался. Схему секции при этом
 * доносит обёртка платформы `<div class="color-scheme-N" data-block-scheme>`
 * (v2-page-composer), поэтому секция покрашена и останется покрашенной.
 * Контейнерной схеме такой обёртки не было и нет — её удаление ничего не
 * снимает с экрана.
 *
 * vanilla — отдельная строка: её подложка каталога жёстко сидит на
 * `--vanilla-surface` (#eeeeee) и схему секции не читает. Это ДРУГОЙ баг, он
 * вынесен в отчёт хвостом и здесь не чинится: тест лишь фиксирует, что
 * подложка на месте и заливку секция не потеряла.
 *
 * Что сторожим:
 *   1. в панели «Группы товаров» ровно ОДНА цветовая схема;
 *   2. порт не печатает вложенный класс схемы, даже если старая ревизия
 *      принесла `containerColorScheme` (строкой или числом);
 *   3. подложка секции, которая держит заливку, никуда не делась.
 *
 * САБОТАЖ: верните в puckConfig `containerColorScheme: { type: 'colorScheme' }`
 * или верните `containerSchemeClass` в class:list контейнера — тест обязан
 * покраснеть.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const RAW_CONFIG = resolve(__dirname, 'puck-config-raw.mjs');

/** Пять тем платформы. У каждой СВОЙ порт Catalog — правка нужна в каждом. */
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;
type Theme = (typeof THEMES)[number];

/**
 * Маркер подложки, которая держит заливку секции. Берём из живого рендера:
 * если правка снесёт её вместе со схемой контейнера — секция потеряет фон,
 * и это ровно то, что владелец просил не допустить.
 */
const SECTION_SURFACE: Record<Theme, string> = {
  rose: 'w-full bg-[rgb(var(--color-bg,255_255_255))]',
  vanilla: 'vanilla-pad w-full bg-[var(--vanilla-surface)]',
  flux: 'w-full bg-[rgb(var(--color-bg,255_255_255))]',
  satin: 'satin-pad w-full bg-[rgb(var(--color-bg,255_255_255))]',
  bloom: 'w-full bg-[rgb(var(--color-bg,255_255_255))]',
};

type PuckField = {
  type?: string;
  label?: string;
  objectFields?: Record<string, PuckField>;
  arrayFields?: Record<string, PuckField>;
};

const configCache = new Map<string, Record<string, { fields?: Record<string, PuckField> }>>();

/** Конфиг ровно в том виде, в каком его получает конструктор. */
function components(theme: string): Record<string, { fields?: Record<string, PuckField> }> {
  const hit = configCache.get(theme);
  if (hit) return hit;
  const raw = execFileSync('node', [RAW_CONFIG, theme], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const cfg = JSON.parse(raw) as {
    components?: Record<string, { fields?: Record<string, PuckField> }>;
  };
  const out = cfg.components ?? {};
  configCache.set(theme, out);
  return out;
}

/** Все контролы типа `colorScheme` блока, включая вложенные в объекты/списки. */
function schemeControls(fields: Record<string, PuckField> | undefined): string[] {
  const out: string[] = [];
  const walk = (f: Record<string, PuckField> | undefined, path: string) => {
    for (const [key, field] of Object.entries(f ?? {})) {
      const here = path ? `${path}.${key}` : key;
      if (field?.type === 'colorScheme') out.push(here);
      if (field?.objectFields) walk(field.objectFields, here);
      if (field?.arrayFields) walk(field.arrayFields, `${here}[]`);
    }
  };
  walk(fields, '');
  return out;
}

/** Рендер порта темы той же лестницей, что и витрина (manifest → пакет → base). */
function render(theme: string, props: Record<string, unknown>, live = false): string {
  const jobs = [{ block: 'Catalog', cascade: true, live, props }];
  const raw = execFileSync('node', [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 128 * 1024 * 1024,
  });
  const row = JSON.parse(raw)[0] as {
    html?: string;
    error?: string;
    missing?: boolean;
    pipelineError?: string;
  };
  if (!row.html) {
    throw new Error(
      `${theme}/Catalog не отрендерился: ${row.error ?? row.pipelineError ?? (row.missing ? 'нет модуля в манифесте' : '?')}`,
    );
  }
  return row.html;
}

// ── 1. Панель: одна цветовая схема на секцию ────────────────────────────────

describe('панель «Группы товаров»: цветовая схема одна', () => {
  it.each(THEMES)('%s: ровно один контрол colorScheme', (theme) => {
    const controls = schemeControls(components(theme).Catalog?.fields);
    expect(controls).toEqual(['colorScheme']);
  });

  it.each(THEMES)('%s: «Цветовой схемы контейнера» в панели нет', (theme) => {
    const fields = components(theme).Catalog?.fields ?? {};
    const labels = Object.values(fields).map((f) => f?.label ?? '');
    expect(labels).not.toContain('Цветовая схема контейнера');
    // Проп может остаться в схеме ревизии, но только скрытым — как у
    // «Коллекции товаров» (PopularProducts), где контейнер убрали раньше.
    const container = fields.containerColorScheme;
    if (container) expect(container.type).toBe('hidden');
  });
});

// ── 2. Рендер: вложенной схемы нет ни на одном входе ────────────────────────

describe('рендер «Группы товаров»: вложенной схемы контейнера нет', () => {
  // Строка — то, что писала панель; число — то, во что её приводит
  // adaptLegacyProps на всех трёх путях рендера. Старые ревизии несут и то,
  // и другое, поэтому сторожим оба входа.
  const legacyInputs: [string, unknown][] = [
    ['строкой "scheme-3"', 'scheme-3'],
    ['числом 3', 3],
  ];

  it.each(THEMES)('%s: секция красится одной схемой (своей)', (theme) => {
    const html = render(theme, {
      id: 'Catalog-1',
      colorScheme: 'scheme-4',
      padding: { top: 40, bottom: 40 },
    });
    const schemes = html.match(/color-scheme-\d/g) ?? [];
    expect(schemes).toEqual(['color-scheme-4']);
  });

  describe.each(THEMES)('%s', (theme) => {
    it.each(legacyInputs)(
      'старая ревизия с containerColorScheme %s не печатает вторую схему',
      (_name, value) => {
        const html = render(theme, {
          id: 'Catalog-1',
          colorScheme: 'scheme-4',
          containerColorScheme: value,
          padding: { top: 40, bottom: 40 },
        });
        const schemes = html.match(/color-scheme-\d/g) ?? [];
        expect(schemes).toEqual(['color-scheme-4']);
        expect(html).not.toContain('color-scheme-3');
      },
    );
  });

  it.each(THEMES)('%s: живая цепочка — внутри секции ни одной вложенной схемы', (theme) => {
    const html = render(
      theme,
      {
        id: 'Catalog-1',
        colorScheme: 'scheme-4',
        containerColorScheme: 'scheme-3',
        padding: { top: 40, bottom: 40 },
      },
      true,
    );
    // Схему секции на живом пути доносит обёртка платформы, снаружи блока.
    // Внутри разметки блока классов схем быть не должно вовсе.
    expect(html).not.toMatch(/color-scheme-\d/);
  });
});

// ── 3. Заливка секции на месте ──────────────────────────────────────────────

describe('«Группа товаров» не потеряла фон', () => {
  it.each(THEMES)('%s: подложка секции на месте', (theme) => {
    const html = render(theme, {
      id: 'Catalog-1',
      colorScheme: 'scheme-4',
      padding: { top: 40, bottom: 40 },
    });
    expect(html).toContain(SECTION_SURFACE[theme]);
  });

  it.each(THEMES)('%s: подложка секции на месте и на живой цепочке', (theme) => {
    const html = render(theme, { id: 'Catalog-1', padding: { top: 40, bottom: 40 } }, true);
    expect(html).toContain(SECTION_SURFACE[theme]);
  });
});

// ── 4. Источник: в портах не осталось контейнерной схемы ────────────────────

describe('порты Catalog: containerColorScheme больше не участвует в рендере', () => {
  const PORTS = [
    'packages/theme-base/blocks/Catalog/Catalog.astro',
    'packages/theme-rose/blocks/Catalog/Catalog.astro',
    'packages/theme-vanilla/blocks/Catalog/Catalog.astro',
    'packages/theme-flux/blocks/Catalog/Catalog.astro',
    'packages/theme-satin/blocks/Catalog/Catalog.astro',
    'packages/theme-bloom/blocks/Catalog/Catalog.astro',
  ];

  it.each(PORTS)('%s: нет класса схемы контейнера в разметке', (rel) => {
    const src = readFileSync(resolve(SITES_ROOT, rel), 'utf-8');
    // Комментарии допустимы (объясняют, почему поля больше нет); запрещено
    // именно вычисление и подстановка класса.
    const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('containerSchemeClass');
  });
});
