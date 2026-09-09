import * as fs from "fs/promises";
import * as path from "path";
import { applyHomeSeoToHtml, type HomeSeo } from "./home-seo-inject";
import { isV2ComplexRoute } from "../themes/v2-routes";

/**
 * custom-pages-seo-inject — доставка per-page SEO КАСТОМНЫХ страниц в <head>.
 *
 * Мерчант редактирует SEO кастомной страницы в админке (Магазин → Страницы) →
 * пишется в revision.pages[i].seo (SeoMeta{title,description,keywords}). Этот
 * пост-процесс патчит <head> каждой кастомной страницы в её dist/<slug>/index.html,
 * переиспользуя протестированный идемпотентный applyHomeSeoToHtml (zero blast
 * radius на v2-композитор; та же конвенция post-compose walk, что favicon/home-seo).
 *
 * СИСТЕМНЫЕ страницы и home пропускаются: home-SEO авторитетно живёт в branding.seo
 * и патчит dist/index.html отдельно (injectHomeSeo) — иначе двойная запись за один
 * файл. ВАЖНО: createPage блокирует коллизии слага только с manifest.pages, но
 * verbatim-роуты темы (blog/legal/products/… — VERBATIM_PREFIXES) шире → кастомная
 * страница со слагом verbatim-роута перезаписала бы SEO системной страницы. Поэтому
 * зеркалим collision-guard compose: пропускаем isV2ComplexRoute(slug) (как
 * composeContentPagesIntoDist в v2-live-pages.ts).
 */

interface SeoMetaLike {
  title?: string;
  description?: string;
  keywords?: string;
}

/** Проекция SeoMeta → HomeSeo (форма, которую понимает applyHomeSeoToHtml). */
export const seoMetaToHomeSeo = (s: SeoMetaLike | null | undefined): HomeSeo => ({
  title: s?.title,
  description: s?.description,
  keywords: s?.keywords,
});

function hasSeo(s: SeoMetaLike | null | undefined): boolean {
  return !!s && (!!s.title?.trim() || !!s.description?.trim() || !!s.keywords?.trim());
}

/**
 * Патчит per-page SEO во все кастомные страницы диста. Пустой набор → 0.
 * Возвращает число пропатченных файлов. Отсутствующий dist/<slug>/index.html
 * (страница не собрана / сложный роут) → skip без throw.
 */
export async function injectCustomPagesSeo(
  distDir: string,
  revData: unknown,
): Promise<number> {
  const pages = Array.isArray((revData as { pages?: unknown[] })?.pages)
    ? ((revData as { pages: any[] }).pages)
    : [];
  let count = 0;
  for (const p of pages) {
    // Только кастомные с непустым seo; системные/home пропускаем.
    const isCustom = p?.role === "custom" || Boolean(p?.isCustom);
    if (!isCustom || p?.role === "system") continue;
    if (!hasSeo(p?.seo)) continue;

    const rawSlug = typeof p?.slug === "string" ? p.slug : "";
    const slug = rawSlug.replace(/^\/+|\/+$/g, "");
    // home = branding.seo; verbatim-роуты темы = системные файлы (не перезаписываем).
    if (!slug || slug === "home" || isV2ComplexRoute(slug)) continue;

    const pagePath = path.join(distDir, slug, "index.html");
    let html: string;
    try {
      html = await fs.readFile(pagePath, "utf8");
    } catch {
      continue; // страница не в дисте — skip
    }
    const next = applyHomeSeoToHtml(html, seoMetaToHomeSeo(p.seo));
    if (next !== html) {
      await fs.writeFile(pagePath, next, "utf8");
      count++;
    }
  }
  return count;
}
