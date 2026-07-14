import * as fs from "fs/promises";
import * as path from "path";

/**
 * favicon-inject — доставка мерчантских фавиконов магазина на витрину.
 *
 * Мерчант задаёт до 4 вариантов в админке (Настройки → Основные → Favicon):
 *   universal — база для всех браузеров/тем
 *   dark      — иконка под тёмную тему браузера  (prefers-color-scheme: dark)
 *   light     — иконка под светлую тему браузера  (prefers-color-scheme: light)
 *   apple     — Apple & Android Tile (home-screen / PWA)
 * URL-ы уже абсолютные публичные S3 (`merfy-sites`, public-read) — доставляем как есть.
 *
 * Владельцы <head> живых тем (theme-base BaseLayout / themes BaseHead) фавикон
 * из брендинга НЕ эмитят (пустой slot или хардкод /page_logo.svg). Поэтому
 * инжектим пост-процессингом собранного диста — один код кроет ОБА пути
 * (themes-v2 + legacy) и любую будущую тему. Зеркало паттерна tokens-inject /
 * injectAnalyticsTracker (walk *.html + идемпотентная замена перед </head>).
 */

/** Маркер инжектированных тегов: идемпотентность + отличие от хардкода темы. */
export const FAVICON_MARKER = "data-merfy-favicon";

/** Web-manifest пишется в корень диста и линкуется same-origin с домен-рута. */
export const WEB_MANIFEST_PATH = "/site.webmanifest";

/** Ветвь favicons из site.branding — все варианты опциональны. */
export interface FaviconSet {
  universal?: string;
  dark?: string;
  light?: string;
  apple?: string;
}

/** Подмножество branding, нужное инжектору (совместимо с BuildContext["branding"]). */
export interface FaviconBranding {
  favicons?: FaviconSet;
  primaryColor?: string;
  secondaryColor?: string;
}

/**
 * Вырезание существующего icon-тега темы (хардкод /page_logo.svg и т.п.).
 * НЕжадный per-tag: `[^>]*` не пересекает границу тега, `\1`-закрытие кавычки
 * требует, чтобы rel был ровно `icon`/`apple-touch-icon`/… (а не `stylesheet`
 * или `apple-touch-icon-precomposed`). Ведущий отступ и хвостовой перевод строки
 * поглощаются, чтобы не оставлять пустых строк.
 */
const ICON_LINK_RE =
  /[ \t]*<link\b[^>]*\brel=(["'])(?:shortcut icon|icon|apple-touch-icon|mask-icon)\1[^>]*>\n?/gi;

/** MIME по расширению URL. Неизвестное → undefined (неверный type заставит браузер пропустить тег). */
function iconMime(url: string): string | undefined {
  const clean = url.split(/[?#]/)[0].toLowerCase();
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".ico")) return "image/x-icon";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  return undefined;
}

function typeAttr(url: string): string {
  const mime = iconMime(url);
  return mime ? ` type="${mime}"` : "";
}

/** Экранирование значения атрибута в двойных кавычках (URL из БД: `&` в query ломает разметку). */
function escAttr(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function hasAnyFavicon(f: FaviconSet | undefined): f is FaviconSet {
  return !!f && (!!f.universal || !!f.dark || !!f.light || !!f.apple);
}

/**
 * Строит блок <link>/<meta> для <head>. Пустой набор → "".
 *
 * Порядок universal-ПЕРВЫМ (без media), media-скоуп dark/light — ПОСЛЕ: среди
 * совпавших icon-тегов браузер берёт последний в document order, поэтому на
 * тёмной схеме выигрывает dark, на светлой — light, а universal остаётся
 * базой/фолбэком. apple-touch-icon + manifest + theme-color — в конце.
 */
export function buildFaviconHead(
  branding: FaviconBranding | null | undefined,
  opts: { manifestHref?: string } = {},
): string {
  const f = branding?.favicons;
  if (!hasAnyFavicon(f)) return "";

  // Фолбэк для универсальной базы, чтобы браузеры без поддержки media на
  // <link rel=icon> (напр. Safari) не остались без иконки. apple НЕ берём в
  // базу — apple-иконки часто непрозрачные/квадратные, плохи как таб-фавикон.
  // `||` (не `??`): пустая строка "" от FE (сброс слота) трактуется как незадано,
  // как и в hasAnyFavicon/`if (f.dark)` ниже — единая truthiness-семантика.
  const universal = f.universal || f.dark || f.light;

  const lines: string[] = [];
  if (universal) {
    lines.push(
      `<link rel="icon" ${FAVICON_MARKER} href="${escAttr(universal)}"${typeAttr(universal)} sizes="any">`,
    );
  }
  if (f.dark) {
    lines.push(
      `<link rel="icon" ${FAVICON_MARKER} href="${escAttr(f.dark)}" media="(prefers-color-scheme: dark)"${typeAttr(f.dark)} sizes="any">`,
    );
  }
  if (f.light) {
    lines.push(
      `<link rel="icon" ${FAVICON_MARKER} href="${escAttr(f.light)}" media="(prefers-color-scheme: light)"${typeAttr(f.light)} sizes="any">`,
    );
  }
  if (f.apple) {
    lines.push(
      `<link rel="apple-touch-icon" ${FAVICON_MARKER} href="${escAttr(f.apple)}" sizes="180x180">`,
    );
  }
  if (opts.manifestHref) {
    lines.push(`<link rel="manifest" ${FAVICON_MARKER} href="${escAttr(opts.manifestHref)}">`);
  }
  if (branding?.primaryColor) {
    lines.push(`<meta name="theme-color" ${FAVICON_MARKER} content="${escAttr(branding.primaryColor)}">`);
  }
  return lines.join("\n");
}

/**
 * Web-app manifest (Android/Chrome «Установить» + tile). iOS «на экран Домой»
 * тянет apple-touch-icon (см. buildFaviconHead) — нужны ОБА механизма.
 * Иконка — apple (приоритет) либо universal. Размеры реальных файлов неизвестны:
 * svg → "any"; png/прочее → best-effort 192 + 512(maskable).
 */
export function buildWebManifest(
  branding: FaviconBranding | null | undefined,
  opts: { name?: string } = {},
): string {
  const f = branding?.favicons ?? {};
  // Тот же фолбэк-порядок, что buildFaviconHead (apple → universal → dark → light),
  // и `||` ради empty-string-семантики: dark/light-only магазин получит иконку в
  // манифесте (иначе icons:[] → пустая иконка в PWA/«на главный экран»).
  const src = f.apple || f.universal || f.dark || f.light;
  const icons: Array<Record<string, string>> = [];
  if (src) {
    const type = iconMime(src);
    if (type === "image/svg+xml") {
      icons.push({ src, sizes: "any", type, purpose: "any" });
    } else {
      const any192: Record<string, string> = { src, sizes: "192x192", purpose: "any" };
      const maskable512: Record<string, string> = { src, sizes: "512x512", purpose: "maskable" };
      if (type) {
        any192.type = type;
        maskable512.type = type;
      }
      icons.push(any192, maskable512);
    }
  }
  const manifest: Record<string, unknown> = { display: "standalone", icons };
  if (opts.name) {
    manifest.name = opts.name;
    manifest.short_name = opts.name;
  }
  if (branding?.primaryColor) manifest.theme_color = branding.primaryColor;
  if (branding?.secondaryColor) manifest.background_color = branding.secondaryColor;
  return JSON.stringify(manifest, null, 2);
}

/**
 * Применяет favicon-<head>-блок к одной HTML-строке. Чистая, тестируется без fs.
 * - пустой head → HTML как есть;
 * - уже содержит маркер → как есть (идемпотентность повторного прогона);
 * - нет </head> → как есть (не вырезаем чужой icon вслепую);
 * - иначе: снять существующий icon-тег темы и вставить блок перед </head>.
 * Замена </head> — ЧЕРЕЗ ФУНКЦИЮ: `$&`/`$1` в URL не интерпретируются.
 */
export function applyFaviconHeadToHtml(html: string, head: string): string {
  if (head === "") return html;
  if (html.includes(FAVICON_MARKER)) return html;
  if (!/<\/head>/i.test(html)) return html;
  const stripped = html.replace(ICON_LINK_RE, "");
  return stripped.replace(/<\/head>/i, () => `${head}\n</head>`);
}

async function collectHtmlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string): Promise<void> => {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith(".html")) out.push(p);
    }
  };
  await walk(dir);
  return out;
}

/**
 * Инжектит favicon-теги во все *.html диста и пишет web-manifest в его корень.
 * Пустой набор фавиконов → полный noop (дефолт темы /page_logo.svg остаётся,
 * манифест не создаётся) → нулевая регрессия. Возвращает число изменённых файлов.
 */
export async function injectFavicons(
  distDir: string,
  branding: FaviconBranding | null | undefined,
  opts: { name?: string } = {},
): Promise<number> {
  const head = buildFaviconHead(branding, { manifestHref: WEB_MANIFEST_PATH });
  if (head === "") return 0;

  await fs.writeFile(
    path.join(distDir, "site.webmanifest"),
    buildWebManifest(branding, { name: opts.name }),
    "utf8",
  );

  const files = await collectHtmlFiles(distDir);
  let count = 0;
  for (const file of files) {
    const html = await fs.readFile(file, "utf8");
    const next = applyFaviconHeadToHtml(html, head);
    if (next !== html) {
      await fs.writeFile(file, next, "utf8");
      count++;
    }
  }
  return count;
}
