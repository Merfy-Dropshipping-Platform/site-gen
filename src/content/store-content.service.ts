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
import type * as schema from '../db/schema';
import type {
  LoadOptions,
  LoadResult,
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

  private resolveAdapter(site: StoreContentSite): StoreContent {
    const contentModel = site.contentModel ?? 'document';
    if (contentModel === 'document') return this.documentAdapter;
    throw new Error('content_model_not_supported');
  }
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
): StoreContent {
  return injected ?? new StoreContentService(new DocumentAdapter(db));
}
