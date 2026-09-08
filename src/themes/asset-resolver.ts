/**
 * Asset URL resolver — single source of truth для разрешения относительных
 * путей в revision.data.
 *
 * Контракт:
 *   - Theme defaults и Puck seeds хранят assets как relative paths (`/main-image.png`,
 *     `/placeholders/sweater-blue.png`) — clean strings, не привязаны к siteId.
 *   - Merchant uploads через Puck сохраняют **full MinIO URL**
 *     (`https://minio.merfy.ru/...`) — это URL он непосредственно видит и шарит.
 *   - На **читателе** (preview iframe / build pipeline / admin sidebar) мы
 *     знаем `site.publicUrl` и резолвим relative → absolute.
 *   - Результат: один URL для всех pipeline. Никаких origin-specific 404.
 *
 * Использование:
 *   const resolved = resolveAssetUrls(revision.data, site.publicUrl);
 *   // подавать в preview/build/admin
 */
export function resolveAssetUrls<T>(data: T, baseUrl: string | null | undefined): T {
  if (!baseUrl) return data;
  const cleanBase = baseUrl.replace(/\/$/, '');
  return walk(data, cleanBase) as T;
}

function walk(value: unknown, baseUrl: string): unknown {
  if (typeof value === 'string') {
    return rewriteIfRelative(value, baseUrl);
  }
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, baseUrl));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walk(v, baseUrl);
    }
    return out;
  }
  return value;
}

/**
 * Global preview assets — gateway/sites serve these at the URL root
 * (`/placeholders/*`), NOT under `/__theme/<theme>/` or `site.publicUrl`.
 */
export function isGlobalPreviewAssetPath(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.startsWith('/placeholders/');
}

/**
 * Heuristic: string выглядит как relative asset path?
 *   - Начинается с `/` НО НЕ `//` (protocol-relative)
 *   - Не http(s):// или data: URL
 *   - Содержит file extension (`.png`, `.svg`, `.webp`, `.jpg`, etc)
 *
 * Намеренно НЕ трогаем `/catalog`, `/about`, `/product/foo` — это route paths,
 * не assets. Различаем по наличию file extension в last segment.
 */
function rewriteIfRelative(s: string, baseUrl: string): string {
  if (!s.startsWith('/') || s.startsWith('//')) return s;
  if (/^(?:https?|data|blob):/.test(s)) return s;
  if (isGlobalPreviewAssetPath(s)) return s;
  if (s.startsWith('/__theme/')) return s;
  // file path → есть extension в последнем сегменте
  const lastSeg = s.split('?')[0].split('#')[0].split('/').pop() ?? '';
  if (!/\.[a-z0-9]{2,5}$/i.test(lastSeg)) return s;
  return `${baseUrl}${s}`;
}

/**
 * Same as resolveAssetUrls но для HTML строки — переписывает src/srcset/url(...)
 * в готовом HTML. Использовать когда data уже отрендерилась в HTML и доступа
 * к structured JSON нет.
 *
 * Safety net для cases когда:
 *   1. Block .astro hardcoded `<img src="/placeholders/sweater-blue.png">`
 *      (build-time, не из revision.data).
 *   2. Inline-script JS строит innerHTML c relative src.
 */
function rewriteHtmlAssetPath(path: string, base: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (isGlobalPreviewAssetPath(normalized)) return normalized;
  if (normalized.startsWith('/__theme/')) return normalized;
  const trimmed = path.replace(/^\/+/, '');
  return `${base}/${trimmed}`;
}

export function rewriteHtmlAssets(html: string, baseUrl: string | null | undefined): string {
  if (!baseUrl) return html;
  const base = baseUrl.replace(/\/$/, '');
  return html
    .replace(/\bsrc="\/(?!\/)([^"]*)"/g, (_m, p) => `src="${rewriteHtmlAssetPath(p, base)}"`)
    .replace(/\bsrcset="\/(?!\/)([^"]*)"/g, (_m, p) => `srcset="${rewriteHtmlAssetPath(p, base)}"`)
    .replace(/url\(\s*['"]?\/(?!\/)([^'")]*)['"]?\s*\)/g, (_m, p) =>
      `url('${rewriteHtmlAssetPath(p, base)}')`,
    );
}
