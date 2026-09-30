/**
 * Порт «Контент магазина»: одна дверь `load`/`save` для ревизии.
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.1,
 * модель — merfy-mcp/docs/plans/2026-09-21-deltas-and-port.md §5.
 * Запись с базой и слиянием — этап 2, merfy-mcp/docs/plans/2026-09-24-stage2-safe-write.md
 * (раздел «Контракт записи для клиентов»). Карта модуля, инварианты и
 * таблица «писатель → политика» — `README.md` рядом.
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

/** Строка `site` (или её часть) → то, что нужно порту. Одна функция на всех вызывающих. */
export function toStoreContentSite(site: {
  themeId?: string | null;
  publicUrl?: string | null;
  name?: string | null;
  currentRevisionId?: string | null;
  contentModel?: string | null;
}): StoreContentSite {
  return {
    themeId: site.themeId ?? null,
    publicUrl: site.publicUrl ?? null,
    name: site.name ?? null,
    currentRevisionId: site.currentRevisionId ?? null,
    contentModel: site.contentModel ?? null,
  };
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

/**
 * Что делать, если база устарела:
 *  - политика слияния движка — слить (`last-writer-wins` / `reject-conflicts`);
 *  - `refuse` — не сливать вовсе: `revision_conflict` (откат — осознанное
 *    действие, поверх чужой правки его молча не пишем).
 */
export type StaleBasePolicy = MergePolicy | "refuse";

/** Общее для обеих форм записи. */
interface WriteCommon {
  /**
   * Тенант, которому принадлежит запись — как параметр (не поле `site`):
   * CAS-предикат фильтруется ИМЕННО по нему, граница безопасности задаётся
   * вызывающим кодом, а не производной от уже прочитанной строки `site`.
   */
  tenantId: string;
  site: StoreContentSite;
  /** Кто пишет (И5). Не задан — в `meta` не пишется. */
  actor?: WriteActor;
  /** Откуда запись (И5). Не задан — в `meta` не пишется. */
  source?: WriteSource;
  actorUserId?: string;
  meta?: Record<string, unknown>;
  /** B17: серверный фильтр досеянных страниц перед записью (revision-write-filter). */
  filterSeeded?: boolean;
}

/**
 * Запись от базы (этап 2, И2): «я видел ревизию `base` и правил её». Всегда
 * делает записанную ревизию текущей.
 *  - база = текущая → запись с CAS;
 *  - база устарела → по `mergePolicy`: `merge3(база, текущая, входящая)` или
 *    отказ; после слияния документ клиента сохраняется снимком
 *    (`effect.clientVersion`).
 * Пишется документ целиком (конструктор, кабинет) или операции от базы
 * (черновики, агент) — одно из двух.
 */
export type SaveOnBaseParams = WriteCommon & {
  mode: "on-base";
  /** Ревизия, от которой сделана правка; `null` — ревизии у магазина ещё нет. */
  base: string | null;
  mergePolicy: StaleBasePolicy;
} & (
    | { document: Record<string, unknown>; ops?: never }
    | { ops: Op[]; document?: never }
  );

/**
 * Запись вслепую — документ целиком поверх текущей, без слияния, меток
 * изменений и снимков: создание магазина, пересев при смене темы (этап 3).
 */
export interface BlindSaveParams extends WriteCommon {
  mode: "blind";
  document: Record<string, unknown>;
  /** Сделать записанную ревизию текущей (`site.currentRevisionId`). */
  setCurrent?: boolean;
  /**
   * Жёсткий CAS (только вместе с `setCurrent`): текущая должна быть этой
   * ревизией, иначе `revision_conflict`. `null` — текущей ещё нет вовсе;
   * не задан — без CAS.
   */
  expectedVersion?: string | null;
}

/** Форма записи выбирается явно: сочетания вроде «база + жёсткий CAS» тип не пропустит. */
export type SaveParams = SaveOnBaseParams | BlindSaveParams;

/**
 * Удобный вход для писателей с «плоским» историческим контрактом (RPC
 * `sites.revisions.create`, создание магазина, легаси-пересев): сам решает,
 * какая форма `SaveParams` нужна (`base` задан — от базы, иначе — вслепую), и
 * возвращает ответ в старой форме (`revisionId`/`currentRevisionId`/…),
 * которую уже знают клиенты. Реализация — `StoreContentService.createRevision`.
 */
export interface CreateRevisionParams {
  site: StoreContentSite;
  tenantId: string;
  data: Record<string, unknown>;
  meta?: Record<string, unknown>;
  actorUserId?: string;
  setCurrent?: boolean;
  /** Жёсткий CAS вне слияния (форма `blind`) — прежнее поведение до этапа 2. */
  expectedCurrentRevisionId?: string | null;
  /** B17: серверный фильтр досеянных страниц перед записью. */
  filterSeededPages?: boolean;
  /**
   * База записи (этап 2, И2). Задана (в т.ч. `null`) — запись от базы; не
   * задана вовсе — запись вслепую, `expectedCurrentRevisionId` — её CAS.
   */
  base?: string | null;
  actor?: WriteActor;
  source?: WriteSource;
  mergePolicy?: StaleBasePolicy;
}

export interface CreateRevisionResult {
  /** Ревизия, равная документу клиента (см. `SaveEffect.clientVersion`). */
  revisionId: string;
  /** Есть только при записи от базы: текущая ревизия магазина после записи. */
  currentRevisionId?: string;
  merged?: boolean;
  overwritten?: ContestedValue[];
  conflicts?: ContestedValue[];
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
  /** Есть у записи от базы (`mode: "on-base"`). */
  effect?: SaveEffect;
}

/**
 * Текущая ревизия не та, от которой пишут: жёсткий CAS не прошёл, база
 * устарела при политике `refuse` или все попытки CAS проиграны. Ничего не
 * записано. `message` — прежний код `revision_conflict` (его видят RPC и
 * шлюз).
 */
export class RevisionConflictError extends Error {
  constructor() {
    super("revision_conflict");
    this.name = "RevisionConflictError";
  }
}

/** Слияние при политике `reject-conflicts` упёрлось в одно и то же место. Ничего не записано. */
export class RevisionMergeConflictError extends Error {
  constructor(readonly conflicts: ContestedValue[]) {
    super("revision_merge_conflict");
    this.name = "RevisionMergeConflictError";
  }
}

/** Одна запись истории магазина (без служебных снимков клиента). */
export interface HistoryItem {
  id: string;
  createdAt: Date;
}

export interface HistoryOptions {
  site: StoreContentSite;
  limit?: number;
}

export interface HistoryPage {
  items: HistoryItem[];
}

/** Метаданные ревизии — без содержимого (`data` несёт `load`/`get`). */
export interface RevisionEnvelope {
  id: string;
  siteId: string;
  meta: Record<string, unknown> | null;
  createdAt: Date;
  createdBy: string | null;
}

/** Конкретная ревизия целиком: конверт + содержимое, прошедшее шаги чтения. */
export interface RevisionItem extends RevisionEnvelope {
  data: Record<string, unknown>;
}

export interface GetOptions {
  site: StoreContentSite;
}

export interface RollbackParams {
  tenantId: string;
  site: StoreContentSite;
  revisionId: string;
  actorUserId?: string;
  /**
   * База отката — текущая ревизия, которую видел клиент. Не передана —
   * текущая на момент чтения. `null` — «ревизии нет»: явное значение, не
   * подменяется текущей.
   */
  base?: string | null;
}

export interface RollbackResult {
  success: true;
  /** Текущая ревизия после отката (копия `revisionId`, либо он же, если уже текущая). */
  revisionId: string;
  /** Ревизия, из которой восстановили. */
  restoredFrom: string;
}

export interface StoreContent {
  load(siteId: string, opts: LoadOptions): Promise<LoadResult>;
  save(siteId: string, params: SaveParams): Promise<SaveResult>;
  /** История версий магазина, без служебных снимков клиента (И4). */
  history(siteId: string, opts: HistoryOptions): Promise<HistoryPage>;
  /** Конкретная ревизия: конверт + содержимое (шаги чтения адаптера). */
  get(siteId: string, revisionId: string, opts: GetOptions): Promise<RevisionItem>;
  /** Откат (И6): новая ревизия — точная копия выбранной, со сверкой текущей. */
  rollback(siteId: string, params: RollbackParams): Promise<RollbackResult>;
}

/** Модели контента, которые понимает `StoreContentService`. Сегодня — только 'document'. */
export const SUPPORTED_CONTENT_MODELS = ["document"] as const;
export type SupportedContentModel = (typeof SUPPORTED_CONTENT_MODELS)[number];
