/**
 * Название магазина в шапке (текст на месте логотипа, когда файла нет).
 *
 * Владелец 28.09: «крч везде вместо логотипа брать название сайта». В ревизиях
 * у шапки `siteTitle` почти всегда стартовое название темы из сида: «Rose» у
 * 124 магазинов, «Flux» у 15, «Satin» у 18, «Vanilla Pilot» у 25 (замер
 * 28.09), — и шапка печатала имя шаблона вместо имени магазина. Подвалу
 * название из админки подставляют давно (`applyFooterData`), шапке — нет.
 *
 * Порядок источников:
 *   1. своё название мерчанта в шапке — непустое и не стартовое название темы
 *      (конструктор пишет его туда сам, когда мерчант удаляет логотип:
 *      ConstructorContext.withBrandLogoApplied), — остаётся как есть;
 *   2. иначе — название сайта из админки (`site.name`);
 *   3. названия сайта нет — проп не трогаем (порт темы возьмёт свой запасной).
 *
 * Зовут оба пути рендера: сборка витрины и превью конструктора — через
 * `applyFooterData` (utils/footer-data.ts) и точечную перерисовку шапки
 * (`applyHeaderShopName`, preview.controller).
 *
 * Список стартовых названий — ДАННЫЕ: всё, что сиды тем, шаблоны и порты кладут
 * в шапку до мерчанта. Сторож `src/utils/__tests__/header-title.spec.ts`
 * сверяет его со всеми сидами — новое стартовое название без записи здесь
 * покраснит проверку. Сравнение без учёта регистра и пробелов по краям.
 */
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schemaTypes from "../db/schema";

export const TEMPLATE_SITE_TITLES: readonly string[] = [
  // Порты тем (themes/<t>/src/consts.ts SITE_TITLE) и сиды страниц/theme.json.
  "Rose",
  "Flux",
  "Bloom",
  "Satin",
  "Vanilla",
  "Luna",
  // vanilla: сиды pages/*.json и старый шаблон templates/defaults/vanilla.json.
  "Vanilla Pilot",
  "Vanila",
  // rose: старый сид (12 магазинов с «Rose Theme» в шапке на 28.09).
  "Rose Theme",
  // Общие заглушки: defaultProps шапки theme-base и конструктор («Мой
  // магазин»), параметр по умолчанию Header.astro theme-base («Store»).
  "Мой магазин",
  "Store",
];

const TEMPLATE_KEYS = new Set(TEMPLATE_SITE_TITLES.map((t) => t.trim().toLowerCase()));

export function isTemplateSiteTitle(title: unknown): boolean {
  return typeof title === "string" && TEMPLATE_KEYS.has(title.trim().toLowerCase());
}

/** Название для шапки или undefined — проп не трогать. */
export function headerSiteTitle(current: unknown, siteName: string | null | undefined): string | undefined {
  const own = typeof current === "string" ? current.trim() : "";
  if (own && !isTemplateSiteTitle(own)) return undefined;
  const name = (siteName ?? "").trim();
  return name || undefined;
}

type Block = { type?: unknown; props?: Record<string, unknown> };

function contentArraysOf(revisionData: Record<string, unknown>): unknown[][] {
  const rev = revisionData as { pagesData?: Record<string, { content?: unknown }>; content?: unknown };
  const pages = rev.pagesData && typeof rev.pagesData === "object" ? Object.values(rev.pagesData) : [];
  return [...pages.map((page) => page?.content), rev.content].filter(Array.isArray) as unknown[][];
}

/** Мутирует шапки ревизии; возвращает число изменённых блоков. */
export function applyHeaderSiteTitles(
  revisionData: Record<string, unknown> | null | undefined,
  siteName: string | null | undefined,
): number {
  if (!revisionData || typeof revisionData !== "object") return 0;
  const headers = contentArraysOf(revisionData)
    .flat()
    .filter((b): b is Block => (b as Block)?.type === "Header" && !!(b as Block).props);
  let changed = 0;
  for (const header of headers) {
    const title = headerSiteTitle(header.props!.siteTitle, siteName);
    if (!title) continue;
    header.props!.siteTitle = title;
    changed++;
  }
  return changed;
}

export interface HeaderTitleDeps {
  db: NodePgDatabase<typeof schemaTypes>;
  schema: typeof schemaTypes;
}

/**
 * То же для точечной перерисовки шапки в превью: читает только `site.name`
 * (без политик, контактов и кассы, которые нужны подвалу).
 */
export async function applyHeaderShopName(
  deps: HeaderTitleDeps,
  siteId: string,
  revisionData: Record<string, unknown>,
): Promise<void> {
  const rows = await deps.db
    .select({ name: deps.schema.site.name })
    .from(deps.schema.site)
    .where(eq(deps.schema.site.id, siteId));
  applyHeaderSiteTitles(revisionData, typeof rows[0]?.name === "string" ? rows[0].name : null);
}
