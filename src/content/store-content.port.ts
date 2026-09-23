/**
 * Порт «Контент магазина»: одна дверь `load`/`save` для ревизии.
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.1,
 * модель — merfy-mcp/docs/plans/2026-09-21-deltas-and-port.md §5.
 *
 * Сегодня единственный адаптер — `DocumentAdapter` (`document.adapter.ts`):
 * ровно путь конструктора (`SitesDomainService.getRevision`/`createRevision`
 * ДО этого порта). `provenance` зарезервирован под модель слоёв (§5) и пока
 * не заполняется ни одним адаптером.
 */

/**
 * Метаданные магазина, нужные адаптеру, чтобы построить документ.
 *
 * Порт НЕ делает собственный `SELECT` по `schema.site`: вызывающий код
 * (`SitesDomainService.get()`, `PreviewController`/`build.service` — свои
 * уже существующие запросы) передаёт то, что уже прочитал. Так сохраняется
 * мокаемость `jest.spyOn(service, "get")` в существующих характеризационных
 * и золотых тестах — независимый запрос адаптера по `schema.site` не попал
 * бы под их моки `db.select` (некоторые из них вообще не дают `select`,
 * например `revision-create-cas.spec.ts`).
 */
export interface StoreContentSite {
  themeId: string | null;
  publicUrl: string | null;
  name?: string | null;
  tenantId?: string | null;
  currentRevisionId?: string | null;
  /** `site.content_model`; `undefined`/`null` у старых строк — считается 'document'. */
  contentModel?: string | null;
}

export interface LoadOptions {
  /** Конкретная ревизия. Без неё — текущая (`site.currentRevisionId`). */
  revisionId?: string;
  site: StoreContentSite;
}

export interface LoadResult {
  document: Record<string, unknown>;
  /** id ревизии, из которой построен документ. */
  version: string;
  /** Зарезервировано под модель слоёв (§5 деталей карты); адаптеры сегодня не заполняют. */
  provenance?: unknown;
}

export interface SaveParams {
  document: Record<string, unknown>;
  /**
   * CAS: id ревизии, которую вызывающий код читал последней.
   * `undefined` — без CAS (простой insert). `null` — ожидаем, что текущей
   * ревизии ещё нет вовсе. Совпадает по смыслу с сегодняшним
   * `expectedCurrentRevisionId`.
   */
  expectedVersion?: string | null;
  actorUserId?: string;
  meta?: Record<string, unknown>;
  /** B17: серверный фильтр досеянных страниц перед записью (revision-write-filter). */
  filterSeeded?: boolean;
  /** Сделать записанную ревизию текущей (`site.currentRevisionId`). */
  setCurrent?: boolean;
  site: StoreContentSite;
}

export interface SaveResult {
  /** id новой ревизии. */
  version: string;
}

export interface StoreContent {
  load(siteId: string, opts: LoadOptions): Promise<LoadResult>;
  save(siteId: string, params: SaveParams): Promise<SaveResult>;
}

/** Модели контента, которые понимает `StoreContentService`. Сегодня — только 'document'. */
export const SUPPORTED_CONTENT_MODELS = ["document"] as const;
export type SupportedContentModel = (typeof SUPPORTED_CONTENT_MODELS)[number];
