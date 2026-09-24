/**
 * Каталог тем (этап 3, порт П5 ThemeCatalog).
 *
 * Одна правда о том, какие темы пригодны для магазина: её читают команды
 * `CreateStore`/`SetTheme` (слаг темы проверяется по каталогу — опечатка это
 * ошибка, а не тихо записанный `themeId`) и список тем.
 *
 * Тема пригодна, когда:
 *   - строка в таблице `theme` активна (`is_active`);
 *   - у темы есть пакет витрины с главной страницей — тот же признак, по
 *     которому `buildInitialRevision` строит стартовую ревизию резолвером.
 * Строка `default` из миграции 0002 пакета не имеет — в каталог не попадает
 * без отдельной ветки «под default» (тема = данные пакета).
 */
import { Inject, Injectable } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { getThemeManifest } from "../themes/theme-manifest-loader";

/** Единственное место, где объявлена тема магазина по умолчанию (И1). */
export const DEFAULT_THEME_ID = "rose";

export interface CatalogTheme {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  previewDesktop: string | null;
  previewMobile: string | null;
  tags: string[];
  badge: string | null;
  author: string | null;
  price: number;
}

export interface ThemeCatalog {
  readonly defaultThemeId: string;
  list(tenantId?: string): Promise<CatalogTheme[]>;
  /** Тема каталога или `null`, если слаг не пригоден для магазина. */
  find(themeId: string, tenantId?: string): Promise<CatalogTheme | null>;
}

export const THEME_CATALOG = Symbol("THEME_CATALOG");

/** Есть ли у темы пакет витрины с главной страницей. */
export function hasStorefrontPackage(themeId: string): boolean {
  const manifest = getThemeManifest(themeId) as {
    pages?: Array<{ isHome?: boolean }>;
  } | null;
  return (
    Array.isArray(manifest?.pages) &&
    manifest.pages.some((p) => p?.isHome === true)
  );
}

const CATALOG_COLUMNS = {
  id: schema.theme.id,
  name: schema.theme.name,
  slug: schema.theme.slug,
  description: schema.theme.description,
  previewDesktop: schema.theme.previewDesktop,
  previewMobile: schema.theme.previewMobile,
  tags: schema.theme.tags,
  badge: schema.theme.badge,
  author: schema.theme.author,
  price: schema.theme.price,
};

type CatalogRow = {
  [K in keyof typeof CATALOG_COLUMNS]: unknown;
};

function toCatalogTheme(row: CatalogRow): CatalogTheme {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: (row.description as string | null) ?? null,
    previewDesktop: (row.previewDesktop as string | null) ?? null,
    previewMobile: (row.previewMobile as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    badge: (row.badge as string | null) ?? null,
    author: (row.author as string | null) ?? null,
    price: typeof row.price === "number" ? row.price : 0,
  };
}

@Injectable()
export class DbThemeCatalog implements ThemeCatalog {
  readonly defaultThemeId = DEFAULT_THEME_ID;

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async list(_tenantId?: string): Promise<CatalogTheme[]> {
    const rows = (await this.db
      .select(CATALOG_COLUMNS)
      .from(schema.theme)
      .where(eq(schema.theme.isActive, true))) as CatalogRow[];
    return rows
      .filter((row) => hasStorefrontPackage(String(row.id)))
      .map(toCatalogTheme);
  }

  async find(themeId: string, tenantId?: string): Promise<CatalogTheme | null> {
    const themes = await this.list(tenantId);
    return themes.find((theme) => theme.id === themeId) ?? null;
  }
}
