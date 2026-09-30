/**
 * `StoreContentService` — Nest-провайдер порта `StoreContent`: выбирает
 * адаптер по `site.content_model`. Сегодня поддерживается только
 * `'document'` (`DocumentAdapter`); всё остальное — явная ошибка
 * `content_model_not_supported`, не тихий фолбэк на документ.
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.1.
 */
import { Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DocumentAdapter } from './document.adapter';
import { buildThemeCanon } from './canon';
import type * as schema from '../db/schema';
import type {
  CreateRevisionParams,
  CreateRevisionResult,
  DiffOptions,
  DiffResult,
  GetOptions,
  HistoryOptions,
  HistoryPage,
  LoadOptions,
  LoadResult,
  RevisionEnvelope,
  RevisionItem,
  RollbackParams,
  RollbackResult,
  SaveParams,
  SaveResult,
  StoreContent,
  StoreContentSite,
} from './store-content.port';

@Injectable()
export class StoreContentService implements StoreContent {
  constructor(private readonly documentAdapter: DocumentAdapter) {}

  async load(siteId: string, opts: LoadOptions): Promise<LoadResult> {
    return this.resolveAdapter(opts.site).load(siteId, opts);
  }

  async save(siteId: string, params: SaveParams): Promise<SaveResult> {
    return this.resolveAdapter(params.site).save(siteId, params);
  }

  async history(siteId: string, opts: HistoryOptions): Promise<HistoryPage> {
    return this.resolveAdapter(opts.site).history(siteId, opts);
  }

  async get(
    siteId: string,
    revisionId: string,
    opts: GetOptions,
  ): Promise<RevisionItem> {
    return this.resolveAdapter(opts.site).get(siteId, revisionId, opts);
  }

  async envelope(
    siteId: string,
    revisionId: string,
    opts: GetOptions,
  ): Promise<RevisionEnvelope | null> {
    return this.resolveAdapter(opts.site).envelope(siteId, revisionId, opts);
  }

  async rollback(siteId: string, params: RollbackParams): Promise<RollbackResult> {
    return this.resolveAdapter(params.site).rollback(siteId, params);
  }

  async diff(
    siteId: string,
    from: string,
    to: string,
    opts: DiffOptions,
  ): Promise<DiffResult> {
    return this.resolveAdapter(opts.site).diff(siteId, from, to, opts);
  }

  /**
   * Удобный вход для писателей с плоским историческим контрактом
   * (`store-content.port.ts`, `CreateRevisionParams`): сама решает форму
   * `SaveParams` и переводит эффект записи в старую форму ответа
   * (`revisionId`/`currentRevisionId`/`merged`/…), которую уже знают клиенты
   * (RPC `sites.revisions.create`, создание магазина, легаси-пересев темы).
   */
  async createRevision(
    siteId: string,
    params: CreateRevisionParams,
  ): Promise<CreateRevisionResult> {
    const saved = await this.save(siteId, toSaveParams(params));
    if (!saved.effect) return { revisionId: saved.version };
    return {
      revisionId: saved.effect.clientVersion,
      currentRevisionId: saved.version,
      merged: saved.effect.merged,
      overwritten: saved.effect.overwritten,
      conflicts: saved.effect.conflicts,
    };
  }

  /** Канон темы — см. `canon.ts`. Не привязан к сайту/модели контента. */
  async buildInitialRevision(
    themeId: string,
  ): Promise<Record<string, unknown> | null> {
    return buildThemeCanon(themeId);
  }

  private resolveAdapter(site: StoreContentSite): StoreContent {
    const contentModel = site.contentModel ?? 'document';
    if (contentModel === 'document') return this.documentAdapter;
    throw new Error('content_model_not_supported');
  }

  /**
   * Число версий магазина (без снимков клиента) для ПАЧКИ сайтов —
   * `admin/bulk` (экспорт). Ниже диспетчера по `content_model`: считает
   * пачкой, а не по адаптеру на сайт — сегодня модель одна ('document'), и
   * заводить дозвон на каждый сайт ради будущей гипотетической модели —
   * пока не нужно (пересмотреть, когда появится вторая модель).
   */
  async historyCounts(siteIds: string[]): Promise<Map<string, number>> {
    return this.documentAdapter.historyCounts(siteIds);
  }
}

/** `CreateRevisionParams` → форма записи порта: с базой — от базы, без неё — вслепую. */
function toSaveParams(params: CreateRevisionParams): SaveParams {
  const common = {
    document: params.data,
    tenantId: params.tenantId,
    meta: params.meta,
    actorUserId: params.actorUserId,
    filterSeeded: params.filterSeededPages,
    actor: params.actor,
    source: params.source,
    site: params.site,
  };
  if (params.base === undefined) {
    return {
      mode: 'blind',
      setCurrent: params.setCurrent,
      expectedVersion: params.expectedCurrentRevisionId,
      ...common,
    };
  }
  // Запись от базы всегда делает ревизию текущей и не знает жёсткого CAS:
  // такие сочетания — явная ошибка, а не тихий уход в другой путь.
  if (!params.setCurrent) throw new Error('base_requires_set_current');
  if (params.expectedCurrentRevisionId !== undefined) {
    throw new Error('base_and_expected_version_are_exclusive');
  }
  return {
    mode: 'on-base',
    base: params.base,
    mergePolicy: params.mergePolicy ?? 'reject-conflicts',
    ...common,
  };
}

/**
 * Фолбэк вне Nest DI (тесты/классы, которые собирают себя напрямую — см.
 * SitesDomainService/PreviewController): при отсутствии инъекции строит
 * DocumentAdapter на переданном `db` сам. Общая точка, чтобы оба класса не
 * держали одну и ту же фабрику дважды.
 */
export function resolveStoreContent(
  injected: StoreContentService | undefined,
  db: NodePgDatabase<typeof schema>,
): StoreContentService {
  return injected ?? new StoreContentService(new DocumentAdapter(db));
}
