/**
 * Общий набор поведения, которому обязан соответствовать ЛЮБОЙ адаптер
 * `StoreContent` (сегодня — `DocumentAdapter`, позже — `DeltaAdapter`).
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.1.
 *
 * `makeAdapter(seed)` строит независимую фикстуру («свежий магазин» темы
 * `seed.themeId`, как его создаёт `reserve()`) для ОДНОГО теста — конкретную
 * реализацию (мок БД, `DocumentAdapter`) поставляет вызывающий файл
 * (`document.adapter.spec.ts`), сам набор о деталях хранилища не знает.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGoldenSnapshot } from '../../__tests__/golden/normalize';
import type { StoreContent, StoreContentSite } from '../store-content.port';

/** Совпадает с CONTENT_PAGE_IDS в themes/content-page-seed.ts (B17). */
const CONTENT_PAGE_IDS = ['page-about', 'page-delivery', 'page-contacts'] as const;

/** Копия документа без указанной страницы — имитация ревизии, сохранённой до B17. */
function omitPage(
  document: Record<string, unknown>,
  pageId: string,
): Record<string, unknown> {
  const pagesData = { ...(document.pagesData as Record<string, unknown> | undefined) };
  delete pagesData[pageId];
  const pages = Array.isArray(document.pages)
    ? (document.pages as Array<{ id?: string }>).filter((p) => p?.id !== pageId)
    : document.pages;
  return { ...document, pages, pagesData };
}

export interface ConformanceFixture {
  content: StoreContent;
  siteId: string;
  site: StoreContentSite;
  /** Текущая ревизия магазина СЕЙЧАС (после всех save() в этом тесте). */
  currentRevisionId: () => string | null;
  /** Сколько строк ревизий реально лежит в хранилище СЕЙЧАС. */
  countStoredRevisions: () => number;
  /** Сырые (без прогона через порт) данные хранимой ревизии — что РЕАЛЬНО записано. */
  readStoredRevision: (revisionId: string) => Record<string, unknown> | undefined;
}

export interface ConformanceSeed {
  themeId: string;
  publicUrl?: string | null;
  siteName?: string;
}

export type MakeAdapter = (
  seed: ConformanceSeed,
) => ConformanceFixture | Promise<ConformanceFixture>;

const GOLDEN_THEMES = ['rose', 'flux', 'bloom', 'satin', 'vanilla'] as const;

function goldenFixturePath(themeId: string): string {
  return resolve(__dirname, '../../__tests__/golden', themeId, 'fresh-store.json');
}

export function runStoreContentConformance(makeAdapter: MakeAdapter): void {
  describe('(а) load свежего магазина совпадает с golden-документом конструктора', () => {
    it.each(GOLDEN_THEMES)('тема %s == golden/<тема>/fresh-store.json', async (themeId) => {
      const fx = await makeAdapter({ themeId, siteName: 'Витрина' });
      const loaded = await fx.content.load(fx.siteId, { site: fx.site });
      const envelope = {
        item: {
          id: loaded.version,
          siteId: fx.siteId,
          data: loaded.document,
          createdAt: new Date(0),
        },
      };
      const expected = JSON.parse(readFileSync(goldenFixturePath(themeId), 'utf-8'));
      expect(normalizeGoldenSnapshot(envelope)).toEqual(expected);
    });
  });

  it('(б) load детерминирован: два вызова подряд дают одинаковый документ', async () => {
    const fx = await makeAdapter({ themeId: 'rose' });
    const first = await fx.content.load(fx.siteId, { site: fx.site });
    const second = await fx.content.load(fx.siteId, { site: fx.site });
    expect(second.document).toEqual(first.document);
    expect(second.version).toEqual(first.version);
  });

  it('(в) save(load()) с filterSeeded не вмораживает досеянные на чтении контент-страницы', async () => {
    const fx = await makeAdapter({ themeId: 'rose' });
    // B17: about/delivery/contacts — единственные страницы, которые досеивает
    // seedContentPagesFromTheme, когда их нет в pagesData. Свежий магазин их
    // уже несёт (buildInitialRevision), поэтому сценарий строим явно: пишем
    // ревизию БЕЗ них (как её мог сохранить старый клиент до B17), затем
    // читаем (load их досеет) и проверяем, что filterSeeded не вмораживает
    // досеянное обратно.
    const first = await fx.content.load(fx.siteId, { site: fx.site });
    const withoutContentPages = CONTENT_PAGE_IDS.reduce(
      (doc, pageId) => omitPage(doc, pageId),
      first.document,
    );
    await fx.content.save(fx.siteId, {
      document: withoutContentPages,
      filterSeeded: false, // прямая запись «как есть» — без досеянных страниц
      setCurrent: true,
      expectedVersion: first.version,
      site: fx.site,
    });

    const beforeSeed = fx.readStoredRevision(fx.currentRevisionId()!) ?? {};
    const beforeSeedPages = (beforeSeed as { pagesData?: Record<string, unknown> }).pagesData ?? {};
    for (const pageId of CONTENT_PAGE_IDS) {
      expect(beforeSeedPages[pageId]).toBeUndefined();
    }

    // Читаем — load() лениво досеивает все три страницы из пакета темы.
    const loaded = await fx.content.load(fx.siteId, { site: fx.site });
    for (const pageId of CONTENT_PAGE_IDS) {
      expect((loaded.document.pagesData as Record<string, unknown>)[pageId]).toBeDefined();
    }

    // Пишем обратно с filterSeeded=true — досеянные страницы не должны
    // вмёрзнуть в хранимую ревизию.
    const saved = await fx.content.save(fx.siteId, {
      document: loaded.document,
      filterSeeded: true,
      setCurrent: true,
      expectedVersion: loaded.version,
      site: fx.site,
    });
    const stored = fx.readStoredRevision(saved.version) ?? {};
    const storedPages = (stored as { pagesData?: Record<string, unknown> }).pagesData ?? {};
    for (const pageId of CONTENT_PAGE_IDS) {
      expect(storedPages[pageId]).toBeUndefined();
    }

    // Идемпотентность: фильтр ничего не потерял для конструктора — повторное
    // чтение после «отфильтрованной» записи снова видит все три контент-
    // страницы (досеваны заново из пакета темы). Сравниваем СОСТАВ страниц
    // и наличие контента, а не байт-в-байт: id ленивых сидов у некоторых
    // страниц (не относящихся к B17) сами по себе не детерминированы между
    // прогонами — см. write-filter's bodyFingerprint (сознательно роняет
    // props.id при сравнении, тем же читаем и здесь).
    const reloaded = await fx.content.load(fx.siteId, {
      revisionId: saved.version,
      site: fx.site,
    });
    const reloadedPages = reloaded.document.pagesData as Record<string, unknown>;
    expect(Object.keys(reloadedPages).sort()).toEqual(
      Object.keys(loaded.document.pagesData as Record<string, unknown>).sort(),
    );
    for (const pageId of CONTENT_PAGE_IDS) {
      expect(reloadedPages[pageId]).toEqual(
        (loaded.document.pagesData as Record<string, unknown>)[pageId],
      );
    }
  });

  it('(г) save с неверным expectedVersion падает revision_conflict и ничего не пишет', async () => {
    const fx = await makeAdapter({ themeId: 'rose' });
    const beforeCount = fx.countStoredRevisions();
    const beforeCurrent = fx.currentRevisionId();

    await expect(
      fx.content.save(fx.siteId, {
        document: { pages: [], pagesData: {} },
        filterSeeded: false,
        setCurrent: true,
        expectedVersion: 'revision-id-that-was-never-current',
        site: fx.site,
      }),
    ).rejects.toThrow('revision_conflict');

    expect(fx.countStoredRevisions()).toBe(beforeCount);
    expect(fx.currentRevisionId()).toBe(beforeCurrent);
  });

  it('(д) load({revisionId}) читает именно ту ревизию, а не текущую', async () => {
    const fx = await makeAdapter({ themeId: 'rose' });
    const original = await fx.content.load(fx.siteId, { site: fx.site });

    const second = await fx.content.save(fx.siteId, {
      document: { pages: [], pagesData: { home: { marker: 'second-revision' } } },
      filterSeeded: false,
      setCurrent: true,
      expectedVersion: original.version,
      site: fx.site,
    });
    expect(fx.currentRevisionId()).toBe(second.version);
    expect(second.version).not.toBe(original.version);

    const reloadedOld = await fx.content.load(fx.siteId, {
      revisionId: original.version,
      site: fx.site,
    });
    expect(reloadedOld.version).toBe(original.version);
    expect(reloadedOld.document).toEqual(original.document);
  });
}

// ---------------------------------------------------------------------------
// Jest по умолчанию считает тестовым файлом ЛЮБОЙ .ts внутри __tests__/**
// (testMatch `**/__tests__/**/*.[jt]s?(x)`) — этот файл под него попадает,
// хотя описывает `describe`/`it` только ВНУТРИ функции `runStoreContentConformance`,
// которая здесь не вызывается (нет `makeAdapter`). Без хотя бы одного `it()`
// прогон валится с «must contain at least one test» (тот же приём и та же
// причина, что в src/__tests__/golden/normalize.ts). Гвард
// `isOwnTestFile()` — чтобы `document.adapter.spec.ts`, который импортирует
// `runStoreContentConformance`, не зарегистрировал этот describe() ВТОРОЙ раз
// в своём реалме.
// ---------------------------------------------------------------------------
function isOwnTestFile(): boolean {
  try {
    const testPath = (globalThis as any).expect?.getState?.().testPath;
    return testPath === __filename;
  } catch {
    return false;
  }
}

if (isOwnTestFile())
  describe('store-content.conformance.ts: сам модуль', () => {
    it('runStoreContentConformance — функция, готовая принять фабрику адаптера', () => {
      expect(typeof runStoreContentConformance).toBe('function');
      expect(runStoreContentConformance.length).toBe(1);
    });
  });
