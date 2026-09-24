/**
 * Каталог тем (этап 3, порт П5 ThemeCatalog; кусок 3.4, И5).
 *
 * Одна правда о темах магазина: её читают команды `CreateStore`/`SetTheme`
 * (слаг темы проверяется по каталогу — опечатка это ошибка, а не тихо
 * записанный `themeId`) и список тем для кабинета и агента (`themes.list` →
 * шлюз `GET /api/themes`).
 *
 * Тема в каталоге, когда выполнены ВСЕ правила `CATALOG_RULES` (данные, не
 * ветки): строка активна; тема платформы или своя у этого тенанта; у темы
 * собственный пакет витрины с главной страницей — тот же признак, по которому
 * `buildInitialRevision` строит стартовую ревизию. Строка `default` из
 * миграции 0002 пакета не имеет — в каталог не попадает без отдельной ветки
 * «под default» (тема = данные пакета). Своя тема на основе (`base_theme_id`)
 * пока тоже не попадает: витрина и конструктор рендерят только темы с
 * собственным пакетом; её создание — вместе с MCP.
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
  /** «Подходит для» (Merfy Docs). */
  fitsFor: string[];
  previewDesktop: string | null;
  previewMobile: string | null;
  tags: string[];
  badge: string | null;
  author: string | null;
  price: number;
  templateId: string | null;
  viewCount: number;
  /** Владелец: `null` — тема платформы. */
  ownerTenantId: string | null;
  /** Основа своей темы: `null` — тема сама себе основа. */
  baseThemeId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
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
  fitsFor: schema.theme.fitsFor,
  previewDesktop: schema.theme.previewDesktop,
  previewMobile: schema.theme.previewMobile,
  tags: schema.theme.tags,
  badge: schema.theme.badge,
  author: schema.theme.author,
  price: schema.theme.price,
  templateId: schema.theme.templateId,
  viewCount: schema.theme.viewCount,
  ownerTenantId: schema.theme.ownerTenantId,
  baseThemeId: schema.theme.baseThemeId,
  createdAt: schema.theme.createdAt,
  updatedAt: schema.theme.updatedAt,
};

type CatalogRow = { [K in keyof typeof CATALOG_COLUMNS]: unknown };

/** Правила каталога: тема в каталоге, когда все правила её пропускают. */
const CATALOG_RULES: ReadonlyArray<
  (row: CatalogRow, tenantId?: string) => boolean
> = [
  // Своя тема видна только владельцу; тема платформы — всем.
  (row, tenantId) =>
    row.ownerTenantId == null || row.ownerTenantId === tenantId,
  // Тема на основе ещё не рендерится ни витриной, ни конструктором.
  (row) => row.baseThemeId == null,
  // Нет пакета витрины — нечего показывать (так скрыта строка `default`).
  (row) => hasStorefrontPackage(String(row.id)),
];

const stringOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;
const dateOrNull = (v: unknown): Date | null => (v instanceof Date ? v : null);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function toCatalogTheme(row: CatalogRow): CatalogTheme {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: stringOrNull(row.description),
    fitsFor: strings(row.fitsFor),
    previewDesktop: stringOrNull(row.previewDesktop),
    previewMobile: stringOrNull(row.previewMobile),
    tags: strings(row.tags),
    badge: stringOrNull(row.badge),
    author: stringOrNull(row.author),
    price: typeof row.price === "number" ? row.price : 0,
    templateId: stringOrNull(row.templateId),
    viewCount: typeof row.viewCount === "number" ? row.viewCount : 0,
    ownerTenantId: stringOrNull(row.ownerTenantId),
    baseThemeId: stringOrNull(row.baseThemeId),
    createdAt: dateOrNull(row.createdAt),
    updatedAt: dateOrNull(row.updatedAt),
  };
}

@Injectable()
export class DbThemeCatalog implements ThemeCatalog {
  readonly defaultThemeId = DEFAULT_THEME_ID;

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async list(tenantId?: string): Promise<CatalogTheme[]> {
    const rows = (await this.db
      .select(CATALOG_COLUMNS)
      .from(schema.theme)
      .where(eq(schema.theme.isActive, true))) as CatalogRow[];
    return rows
      .filter((row) => CATALOG_RULES.every((rule) => rule(row, tenantId)))
      .map(toCatalogTheme);
  }

  async find(themeId: string, tenantId?: string): Promise<CatalogTheme | null> {
    const themes = await this.list(tenantId);
    return themes.find((theme) => theme.id === themeId) ?? null;
  }
}
