/**
 * `StoreContentService` — Nest-провайдер порта `StoreContent`: выбирает
 * адаптер по `site.content_model`. Сегодня поддерживается только
 * `'document'` (`DocumentAdapter`); всё остальное — явная ошибка
 * `content_model_not_supported`, не тихий фолбэк на документ.
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.1.
 */
import { Injectable } from '@nestjs/common';
import { DocumentAdapter } from './document.adapter';
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
