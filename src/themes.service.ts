/**
 * ThemesService — сервис для работы с каталогом тем.
 *
 * Задачи:
 * - Получение списка доступных тем
 * - Получение темы по ID
 * - Инкремент счётчика просмотров
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { PG_CONNECTION } from "./constants";
import * as schema from "./db/schema";
import {
  DbThemeCatalog,
  THEME_CATALOG,
  type CatalogTheme,
  type ThemeCatalog,
} from "./store/theme-catalog";

export interface ThemeFilters {
  /** Тенант, чьи собственные темы видны в каталоге вместе с темами платформы. */
  tenantId?: string;
}

@Injectable()
export class ThemesService {
  private readonly logger = new Logger(ThemesService.name);
  private readonly catalog: ThemeCatalog;

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    @Optional() @Inject(THEME_CATALOG) catalog?: ThemeCatalog,
  ) {
    this.catalog = catalog ?? new DbThemeCatalog(db);
  }

  /**
   * Список тем для кабинета и агента — каталог тем (этап 3, кусок 3.4, И5):
   * пять тем витрины с «подходит для» и превью; `default` и темы без пакета
   * скрыты.
   */
  async list(
    filters?: Pick<ThemeFilters, "tenantId">,
  ): Promise<{ items: CatalogTheme[] }> {
    return { items: await this.catalog.list(filters?.tenantId) };
  }

  /**
   * Все строки таблицы `theme`, включая неактивные и `default`, — как `list`
   * отдавал до каталога. RPC `themes.list` с явным `isActive: false`.
   */
  async listAllRows() {
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
      .from(schema.theme);

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
    return row?.templateId ?? "default";
  }
}
