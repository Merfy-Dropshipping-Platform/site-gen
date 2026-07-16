import * as fs from "fs/promises";
import * as path from "path";
import { escapeHtml } from "./seo-meta";

/**
 * home-seo-inject — доставка site-level SEO Главной страницы в <head>.
 *
 * Мерчант задаёт в админке (Настройки → Основные → «Оптимизация поисковых систем»)
 * title / description / keywords. Хранятся site-level в `site.branding.seo`
 * (та же jsonb, что favicons — единый branding-паттерн, shallow-merge защищает).
 *
 * Сегодня из home-<head> по мерчанту патчится ТОЛЬКО <title>; description/og/twitter
 * на v2-пути падают в скелетон темы, <meta keywords> не эмитится нигде. Этот
 * пост-процесс патчит title/description/og/twitter (замена in-place, как
 * seo-meta.ts patchPdpMetaTags) и вставляет keywords, трогая ТОЛЬКО dist/index.html
 * (Главная). Зеркало favicon-inject (idempotent-маркер, замена перед </head>).
 */

export interface HomeSeo {
  title?: string;
  description?: string;
  keywords?: string;
}

/** Маркер вставленного keywords-тега — идемпотентность повторного прогона. */
const SEO_MARKER = "data-merfy-seo";

function hasAnySeo(seo: HomeSeo | null | undefined): seo is HomeSeo {
  return (
    !!seo &&
    (!!seo.title?.trim() || !!seo.description?.trim() || !!seo.keywords?.trim())
  );
}

/**
 * Патчит <head> одной HTML-строки под home-SEO. Чистая, тестируется без fs.
 * Пустые поля НЕ трогают соответствующие теги (скелет темы остаётся).
 * <title>/description/og/twitter — замена in-place существующих тегов;
 * keywords — вставка перед </head> (в скелете его нет), только если непусто.
 */
export function applyHomeSeoToHtml(html: string, seo: HomeSeo | null | undefined): string {
  if (!hasAnySeo(seo)) return html;
  let out = html;

  const title = (seo.title ?? "").trim();
  const description = (seo.description ?? "").trim();
  const keywords = (seo.keywords ?? "").trim();

  // Все подстановки — ЧЕРЕЗ ФУНКЦИЮ-replacer: escapeHtml НЕ экранирует `$`, а
  // строка-замена трактовала бы `$1/$&/$$` в title/description (напр. цена «$100»)
  // как паттерны → порча тегов. В функции значение вставляется дословно, а группы
  // ($1/$2 = префикс тега и закрывающая кавычка) приходят аргументами p1/p2.
  if (title) {
    const t = escapeHtml(title);
    out = out.replace(/<title>[^<]*<\/title>/i, () => `<title>${t}</title>`);
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      (_m, p1, p2) => `${p1}${t}${p2}`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:title["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      (_m, p1, p2) => `${p1}${t}${p2}`,
    );
  }

  if (description) {
    const d = escapeHtml(description);
    out = out.replace(
      /(<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      (_m, p1, p2) => `${p1}${d}${p2}`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      (_m, p1, p2) => `${p1}${d}${p2}`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      (_m, p1, p2) => `${p1}${d}${p2}`,
    );
  }

  // keywords — не в скелете. Вставляем перед </head> (только непустое; Google/Bing
  // его игнорируют для ранжирования, но мерчанту привычно). Идемпотентно (маркер).
  if (keywords && !out.includes(SEO_MARKER) && /<\/head>/i.test(out)) {
    const tag = `<meta name="keywords" ${SEO_MARKER} content="${escapeHtml(keywords)}">`;
    // Замена ЧЕРЕЗ ФУНКЦИЮ — $-паттерны в keywords не интерпретируются.
    out = out.replace(/<\/head>/i, () => `${tag}\n</head>`);
  }

  return out;
}

/**
 * Патчит home-SEO в dist/index.html (Главная). Пустой SEO → noop. Возвращает,
 * был ли файл изменён. Не walk по *.html — home-SEO касается ТОЛЬКО Главной.
 */
export async function injectHomeSeo(
  distDir: string,
  seo: HomeSeo | null | undefined,
): Promise<boolean> {
  if (!hasAnySeo(seo)) return false;
  const indexPath = path.join(distDir, "index.html");
  let html: string;
  try {
    html = await fs.readFile(indexPath, "utf8");
  } catch {
    return false; // нет index.html — нечего патчить
  }
  const next = applyHomeSeoToHtml(html, seo);
  if (next !== html) {
    await fs.writeFile(indexPath, next, "utf8");
    return true;
  }
  return false;
}
