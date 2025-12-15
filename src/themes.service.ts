/**
 * ThemesService — сервис для работы с каталогом тем.
 *
 * Задачи:
 * - Получение списка доступных тем
 * - Получение темы по ID
 * - Инкремент счётчика просмотров
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { PG_CONNECTION } from './constants';
import * as schema from './db/schema';

export interface ThemeFilters {
  isActive?: boolean;
}

@Injectable()
export class ThemesService {
  private readonly logger = new Logger(ThemesService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Получить список всех активных тем.
   */
  async list(filters?: ThemeFilters) {
    const rows = await this.db
      .select({
        id: schema.theme.id,
        name: schema.theme.name,
        slug: schema.theme.slug,
        description: schema.theme.description,
        previewDesktop: schema.theme.previewDesktop,
        previewMobile: schema.theme.previewMobile,
        templateId: schema.theme.templateId,
        price: schema.theme.price,
        tags: schema.theme.tags,
        badge: schema.theme.badge,
        author: schema.theme.author,
        viewCount: schema.theme.viewCount,
        createdAt: schema.theme.createdAt,
        updatedAt: schema.theme.updatedAt,
      })
      .from(schema.theme)
      .where(filters?.isActive !== false ? eq(schema.theme.isActive, true) : undefined);

    return { items: rows };
  }

  /**
   * Получить тему по ID.
   */
  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.theme)
      .where(eq(schema.theme.id, id));
    return row ?? null;
  }

  /**
   * Получить тему по slug.
   */
  async getBySlug(slug: string) {
    const [row] = await this.db
      .select()
      .from(schema.theme)
      .where(eq(schema.theme.slug, slug));
    return row ?? null;
  }

  /**
   * Инкрементировать счётчик просмотров темы.
   */
  async incrementViewCount(id: string) {
    await this.db
      .update(schema.theme)
      .set({ viewCount: sql`COALESCE(${schema.theme.viewCount}, 0) + 1` })
      .where(eq(schema.theme.id, id));
  }

  /**
   * Получить templateId по themeId для генератора.
   */
  async getTemplateId(themeId: string): Promise<string> {
    const [row] = await this.db
      .select({ templateId: schema.theme.templateId })
      .from(schema.theme)
      .where(eq(schema.theme.id, themeId));
    return row?.templateId ?? 'default';
  }
}
