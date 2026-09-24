/**
 * Порт «Контент магазина»: одна дверь `load`/`save` для ревизии.
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.1,
 * модель — merfy-mcp/docs/plans/2026-09-21-deltas-and-port.md §5.
 * Запись с базой и слиянием — этап 2, merfy-mcp/docs/plans/2026-09-24-stage2-safe-write.md
 * (раздел «Контракт записи для клиентов»).
 *
 * Сегодня единственный адаптер — `DocumentAdapter` (`document.adapter.ts`):
 * ровно путь конструктора (`SitesDomainService.getRevision`/`createRevision`
 * ДО этого порта). `provenance` зарезервирован под модель слоёв (§5) и пока
 * не заполняется ни одним адаптером.
 */
import type { ContestedValue, MergePolicy, Op } from "./operations";

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
  currentRevisionId?: string | null;
  /** `site.content_model`; `undefined`/`null` у старых строк — считается 'document'. */
  contentModel?: string | null;
}

export interface LoadOptions {
  /** Конкретная ревизия. Без неё — текущая (`site.currentRevisionId`). */
  revisionId?: string;
  site: StoreContentSite;
  /**
   * Документ как лежит в ревизии, без шагов чтения (миграций, досева) — для
   * точной копии при откате (этап 2, И6): чтение не идемпотентно на границе
   * «страница заморожена в ревизии → досеивается», и копия прочитанного
   * документа читалась бы иначе, чем сама ревизия.
   */
  asStored?: boolean;
}

export interface LoadResult {
  document: Record<string, unknown>;
  /** id ревизии, из которой построен документ. */
  version: string;
  /** Зарезервировано под модель слоёв (§5 деталей карты); адаптеры сегодня не заполняют. */
  provenance?: unknown;
}

/** Кто записал ревизию (И5). */
export type WriteActor = "merchant" | "agent" | "system";

/** Откуда пришла запись (И5). */
export type WriteSource =
  | "constructor"
  | "admin-pages"
  | "rollback"
  | "theme-switch"
  | "seed"
  | "draft"
  | "ops";

/** `meta.kind` снимка документа клиента («линия клиента», И4). Такая ревизия никогда не текущая. */
export const CLIENT_SNAPSHOT_KIND = "client-snapshot";

export interface SaveParams {
  /** Документ целиком (путь конструктора). Вместо него можно `ops` от `base`. */
  document?: Record<string, unknown>;
  /** Операции от `base` (черновики, агент) — вместо `document`; нужна `base`. */
  ops?: Op[];
  /**
   * Тенант, которому принадлежит запись — как параметр (не поле `site`):
   * оригинальный `createRevision` фильтрует CAS-предикат ИМЕННО по нему
   * (`params.tenantId`), а не по `site.tenantId` из `SitesDomainService.get()` —
   * граница безопасности задаётся вызывающим кодом, а не производной от
   * уже прочитанной строки. Совпадает по смыслу с сегодняшним `params.tenantId`.
   */
  tenantId: string;
  /**
   * CAS: id ревизии, которую вызывающий код читал последней.
   * `undefined` — без CAS (простой insert). `null` — ожидаем, что текущей
   * ревизии ещё нет вовсе. Совпадает по смыслу с сегодняшним
   * `expectedCurrentRevisionId`.
   */
  expectedVersion?: string | null;
  /**
   * База записи (этап 2, И2): id ревизии, от которой сделан документ. Вместе
   * с `setCurrent`:
   *  - база = текущая → запись с CAS (как `expectedVersion`);
   *  - база устарела → `merge3(база, текущая, входящая)` по `mergePolicy`
   *    вместо `revision_conflict`; после слияния документ клиента
   *    сохраняется снимком (`effect.clientVersion`).
   * `undefined` — старые пути без базы (создание магазина, смена темы).
   * `null` — ревизии ещё нет вовсе.
   */
  base?: string | null;
  /** Кто пишет (И5). Не задан — в `meta` не пишется. */
  actor?: WriteActor;
  /** Откуда запись (И5). Не задан — в `meta` не пишется. */
  source?: WriteSource;
  /** Политика для одного и того же места при слиянии. По умолчанию `reject-conflicts`. */
  mergePolicy?: MergePolicy;
  actorUserId?: string;
  meta?: Record<string, unknown>;
  /** B17: серверный фильтр досеянных страниц перед записью (revision-write-filter). */
  filterSeeded?: boolean;
  /** Сделать записанную ревизию текущей (`site.currentRevisionId`). */
  setCurrent?: boolean;
  site: StoreContentSite;
}

/** Эффект записи с базой — то, что видит клиент (раздел «Контракт записи» плана этапа 2). */
export interface SaveEffect {
  /** База устарела, и запись слита с чужими правками. */
  merged: boolean;
  /**
   * Ревизия, равная документу клиента: база его следующего сохранения, если
   * он не подтянул слитый документ. Без слияния — то же, что `version`.
   */
  clientVersion: string;
  /** Чужие значения, перезаписанные этой записью (`last-writer-wins`). */
  overwritten: ContestedValue[];
  /** Всегда пусто в успешном ответе: при `reject-conflicts` конфликт — ошибка. */
  conflicts: ContestedValue[];
  /** Адреса, изменённые относительно прежней текущей ревизии; `null` — не удалось посчитать. */
  changes: string[] | null;
}

export interface SaveResult {
  /** id новой ревизии (при `setCurrent` — теперь текущей). */
  version: string;
  /** Есть у записи с базой (`base !== undefined`). */
  effect?: SaveEffect;
}

/** Слияние при политике `reject-conflicts` упёрлось в одно и то же место. Ничего не записано. */
export class RevisionMergeConflictError extends Error {
  constructor(readonly conflicts: ContestedValue[]) {
    super("revision_merge_conflict");
    this.name = "RevisionMergeConflictError";
  }
}

export interface StoreContent {
  load(siteId: string, opts: LoadOptions): Promise<LoadResult>;
  save(siteId: string, params: SaveParams): Promise<SaveResult>;
}

/** Модели контента, которые понимает `StoreContentService`. Сегодня — только 'document'. */
export const SUPPORTED_CONTENT_MODELS = ["document"] as const;
export type SupportedContentModel = (typeof SUPPORTED_CONTENT_MODELS)[number];
