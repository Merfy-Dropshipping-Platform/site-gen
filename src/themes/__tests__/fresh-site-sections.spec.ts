/**
 * Свежесозданный магазин: секция обязана РИСОВАТЬСЯ сразу, без правки мерчанта.
 *
 * Баг владельца (2026-09-14): «При создании магазина секция галерея не
 * отображается, требуется выполнить любое действие с секцией и тогда все
 * работает штатно».
 *
 * Механизм, который это ловит (замер 2026-09-14, origin/main ed3d5948):
 *
 *   1. `buildInitialRevision` сеет Gallery тремя плитками из
 *      `packages/theme-<t>/pages/home.json` — это дизайнерские демо-фото.
 *   2. `migrateRevisionData` → `clearDemoImageSections` (spec 099) узнаёт эти
 *      URL в `DEMO_IMAGE_URLS` и СНИМАЕТ контент-пропы, включая `items`.
 *      У rose/bloom от секции остаётся `props = { id }`.
 *   3. Порты всех пяти тем рисуют плитки СТРОГО по `p.items` — пустой массив
 *      даёт пустую секцию (замер: видимый текст rose = "Галерея", 0 <img>).
 *      Общий `theme-base/blocks/Gallery/Gallery.astro` пустое состояние
 *      подменяет (DEMO_ITEMS), но на витрину и в превью идёт ПОРТ.
 *   4. Дерево конструктора при этом НЕ пустое: `findArrayField().defaultItems`
 *      подставляет `GalleryPuckConfig.defaults.items` — те самые «Изображение
 *      / Товар / Коллекция» со скриншота. Первая же правка пишет этот массив
 *      в props (`CustomFieldsPanel`: «Первая же правка запишет массив целиком
 *      в props») — и секция «начинает работать».
 *
 * Отсюда инвариант, который здесь сторожится: РЕНДЕР НЕТРОНУТОЙ СЕКЦИИ РАВЕН
 * РЕНДЕРУ ПОСЛЕ ПЕРВОЙ ПРАВКИ. Всё, что конструктор показывает мерчанту в
 * дереве, обязано быть видно и на экране — до того, как он что-то тронул.
 *
 * Состав параметров панели тут НЕ трогается: канон галереи — те же три плитки
 * (Изображение / Товар / Коллекция), гард только требует, чтобы они доезжали
 * до рендера.
 *
 * Требует собранных блоков и секций:
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { getPageResolver } from '../page-resolver-instance';
import {
  migrateRevisionData,
  GALLERY_CANON_ITEMS,
} from '../../utils/revision-migrations';

const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const PUCK_CONFIG = resolve(__dirname, 'puck-config-raw.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;
type Theme = (typeof THEMES)[number];

/** Плитка на экране помечена якорем подсекции — по нему и считаем. */
const TILE_ANCHOR = /data-puck-subsection-field="items"/g;

const sectionsBuilt = (theme: Theme) =>
  existsSync(resolve(SITES_ROOT, 'dist', 'theme-sections', theme, 'manifest.json'));

/** Рендер ПОРТОМ темы полной живой цепочкой (adaptLegacyProps → blockDefaults → resolveBlockProps). */
function renderPort(theme: Theme, block: string, props: Record<string, unknown>): string {
  const job = { block, props, live: true };
  const raw = execFileSync('node', [RENDERER, theme, JSON.stringify([job])], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const entry = JSON.parse(raw)[0] as {
    html?: string;
    error?: string;
    pipelineError?: string;
    missing?: boolean;
  };
  if (entry.missing) throw new Error(`${theme}/${block}: нет в манифесте темы`);
  if (entry.error) throw new Error(`${theme}/${block}: ${entry.error}`);
  if (entry.pipelineError) throw new Error(`${theme}/${block}: ${entry.pipelineError}`);
  return entry.html ?? '';
}

/** Ровно тот путь, что проходит ревизия свежего магазина: createSite → getRevision. */
async function freshRevision(theme: Theme): Promise<Record<string, any>> {
  const resolver = getPageResolver(theme);
  const initial = await resolver.buildInitialRevision();
  const migrated = migrateRevisionData(initial as any, theme) as Record<string, any>;
  return resolver.normalizeRevision(migrated) as unknown as Record<string, any>;
}

function blocksOfType(revision: Record<string, any>, type: string) {
  const out: { pageId: string; props: Record<string, unknown> }[] = [];
  for (const [pageId, page] of Object.entries(revision.pagesData ?? {})) {
    const content = (page as { content?: unknown[] })?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      const block = b as { type?: string; props?: Record<string, unknown> };
      if (block?.type === type) out.push({ pageId, props: block.props ?? {} });
    }
  }
  return out;
}

/**
 * Фолбэк конструктора: нетронутая секция держит элементы ТОЛЬКО в
 * `defaultProps` — читаем их оттуда же, откуда их берёт конструктор
 * (`GET /api/themes/:id/puck-config`), а не из исходника блока.
 */
function canonItems(theme: Theme): unknown[] {
  const raw = execFileSync('node', [PUCK_CONFIG, theme], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const cfg = JSON.parse(raw) as {
    components?: Record<string, { defaultProps?: Record<string, unknown> }>;
  };
  const items = cfg.components?.Gallery?.defaultProps?.items;
  return Array.isArray(items) ? items : [];
}

describe('свежий магазин — галерея видна без правок мерчанта', () => {
  const revisions = new Map<Theme, Record<string, any>>();

  beforeAll(async () => {
    for (const t of THEMES) revisions.set(t, await freshRevision(t));
  }, 120_000);

  it.each(THEMES)(
    '%s: канон галереи в конфиге — три плитки: изображение, товар, коллекция',
    (theme) => {
      const canon = canonItems(theme);
      expect(canon).toHaveLength(3);
      expect((canon as { type: string }[]).map((i) => i.type)).toEqual([
        'image',
        'product',
        'collection',
      ]);
    },
  );

  // Миграция держит канон литералом (файл блока лежит в packages/ и тянет
  // zod-схему). Расхождение литерала с тем, что реально отдают конструктору,
  // — это молчаливое расхождение данных и панели, поэтому сверяем по всем темам.
  it.each(THEMES)(
    '%s: канон в миграции совпадает с тем, что получает конструктор',
    (theme) => {
      expect(GALLERY_CANON_ITEMS).toEqual(canonItems(theme));
    },
  );

  // Состав главной — канон владельца. Набор тем, сеющих галерею, фиксируем
  // явно: если тема её потеряет (или обретёт), гард обязан это показать,
  // а не молча пропустить проверки рендера.
  it('галерею на свежей главной сеют ровно эти темы', () => {
    const withGallery = THEMES.filter(
      (t) => blocksOfType(revisions.get(t)!, 'Gallery').length > 0,
    );
    expect(withGallery).toEqual(['rose', 'flux', 'bloom']);
  });

  it.each(THEMES)('%s: секции темы собраны (pnpm build:theme-sections:all)', (theme) => {
    expect(sectionsBuilt(theme)).toBe(true);
  });

  it.each(THEMES)('%s: у галереи свежей ревизии есть элементы', (theme) => {
    const found = blocksOfType(revisions.get(theme)!, 'Gallery');
    // Темы без галереи на главной перечислены отдельным тестом выше —
    // здесь просто нечего проверять.
    if (found.length === 0) return;
    for (const { pageId, props } of found) {
      const items = props.items;
      expect({ theme, pageId, items }).toEqual({
        theme,
        pageId,
        items: expect.any(Array),
      });
      expect((items as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it.each(THEMES)('%s: нетронутая галерея рисует плитки, а не пустую рамку', (theme) => {
    const found = blocksOfType(revisions.get(theme)!, 'Gallery');
    if (found.length === 0) return;
    for (const { props } of found) {
      const html = renderPort(theme, 'Gallery', props);
      expect((html.match(TILE_ANCHOR) ?? []).length).toBeGreaterThan(0);
      expect((html.match(/<img/g) ?? []).length).toBeGreaterThan(0);
    }
  });

  it.each(THEMES)(
    '%s: рендер нетронутой галереи совпадает с рендером после первой правки',
    (theme) => {
      const found = blocksOfType(revisions.get(theme)!, 'Gallery');
      if (found.length === 0) return;
      for (const { props } of found) {
        // Что конструктор покажет в дереве и впишет в props первой же правкой.
        const materialized = Array.isArray(props.items)
          ? (props.items as unknown[])
          : canonItems(theme);
        const untouched = renderPort(theme, 'Gallery', props);
        const afterEdit = renderPort(theme, 'Gallery', { ...props, items: materialized });
        expect(untouched).toBe(afterEdit);
      }
    },
  );

  it.each(THEMES)('%s: удалённые мерчантом плитки НЕ воскресают на экране', (theme) => {
    // items: [] — это осознанное «мерчант удалил всё», а не «ещё не трогал».
    const html = renderPort(theme, 'Gallery', { id: 'Gallery-empty', items: [] });
    expect((html.match(TILE_ANCHOR) ?? []).length).toBe(0);
    expect((html.match(/<img/g) ?? []).length).toBe(0);
  });
});

/**
 * Границы материализации на уровне ДАННЫХ. Рендер её не видит (порт получает
 * props уже после миграций), поэтому проверяется отдельно и напрямую.
 */
describe('материализация плиток галереи — границы', () => {
  // Кладём галерею на page-about, а НЕ на home: главная любой темы уже несёт
  // собственный богатый сид пакета (packages/theme-<t>/pages/home.json), и
  // проверка на ней мерила бы состав сида, а не материализацию плиток отдельно.
  // (Раньше у vanilla главную ещё и целиком пересобирала migrateVanillaHomePage
  // (spec 084) — миграция удалена 2026-09-23, сид переехал в пакет темы.)
  const PAGE = 'page-about';
  const galleryPage = (props: Record<string, unknown>) => ({
    pagesData: {
      [PAGE]: { content: [{ type: 'Gallery', props: { id: 'Gallery-x', ...props } }] },
    },
  });
  const galleryProps = (revision: unknown) =>
    ((
      revision as {
        pagesData: Record<string, { content: { props: Record<string, unknown> }[] }>;
      }
    ).pagesData[PAGE].content.find(
      (b) => (b as unknown as { type?: string }).type === 'Gallery',
    )?.props ?? {}) as Record<string, unknown>;

  it('нет ключа items — кладём канон', () => {
    const out = migrateRevisionData(galleryPage({}) as any, 'rose');
    expect(galleryProps(out).items).toEqual(GALLERY_CANON_ITEMS);
  });

  it('пустой массив — мерчант удалил всё, плитки НЕ воскресают', () => {
    const out = migrateRevisionData(galleryPage({ items: [] }) as any, 'rose');
    expect(galleryProps(out).items).toEqual([]);
  });

  it('плитки мерчанта не трогаем', () => {
    const mine = [{ id: 'my-1', type: 'image', url: 'https://cdn.example/1.jpg', alt: 'моё' }];
    const out = migrateRevisionData(galleryPage({ items: mine }) as any, 'rose');
    expect(galleryProps(out).items).toEqual(mine);
  });

  it('идемпотентна: второй прогон ничего не меняет', () => {
    const once = migrateRevisionData(galleryPage({}) as any, 'rose');
    const twice = migrateRevisionData(JSON.parse(JSON.stringify(once)) as any, 'rose');
    expect(galleryProps(twice)).toEqual(galleryProps(once));
  });

  it.each(THEMES)('%s: канон кладётся одинаково во всех темах', (theme) => {
    const out = migrateRevisionData(galleryPage({}) as any, theme);
    expect(galleryProps(out).items).toEqual(GALLERY_CANON_ITEMS);
  });
});

/**
 * Класс, а не один случай: `clearDemoImageSections` снимает контент у целой
 * группы декоративных секций. Порт каждой обязан сохранять видимое состояние —
 * своим плейсхолдером (Hero/ImageWithText/Slideshow/MultiColumns) или канон-
 * данными (Gallery). Пустая секция после снятия демо = тот же баг в другом месте.
 */
describe('свежий магазин — декоративные секции не схлопываются в пустоту', () => {
  const STRIPPED_SECTIONS = ['Hero', 'ImageWithText', 'Slideshow', 'MultiColumns'] as const;

  it.each(
    THEMES.flatMap((theme) => STRIPPED_SECTIONS.map((block) => [theme, block] as const)),
  )('%s/%s: после снятия демо-контента секция остаётся видимой', (theme, block) => {
    const html = renderPort(theme, block, { id: `${block}-stripped` });
    const visible =
      (html.match(/<img/g) ?? []).length + (html.match(/<a\b/g) ?? []).length;
    expect(visible).toBeGreaterThan(0);
  });
});
