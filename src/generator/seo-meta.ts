/**
 * SEO мета-патчинг PDP- и collection-шелла — ЧИСТЫЕ функции (без NestJS/fs/RPC),
 * извлечены из build.service чтобы быть unit-тестируемыми в изоляции.
 * build.service форвардит сюда per-product патч (замыкание patchPdpMeta) и
 * per-collection патч (замыкание patchCollectionMeta), передавая захваченные
 * siteTitle/pub явными аргументами.
 */

/**
 * SEO: экранирование для безопасной подстановки текста в HTML-атрибуты
 * (content="…", href="…") и текстовые узлы (<title>…</title>). Имена/описания
 * товаров — пользовательский ввод, без экранирования рвут разметку или дают XSS.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Per-product патч SEO-меты PDP-шелла. Возвращает HTML с подставленными под
 * конкретный товар canonical / og:* / twitter:* / <title> / description.
 *
 * canonical ВСЕГДА на /product/<slug> (даже на per-id странице) → консолидируем
 * дубликаты в один canonical URL. twitter:* держатся зеркалом og:* (BaseHead
 * скелет несёт `property="twitter:*"` со значениями «Товар — Rose» / placeholder
 * / origin-root без id — без патча они утекают в живой HTML).
 *
 * Пустые поля НЕ трогаем (оставляем скелет, чтобы не было пустых тегов): title/
 * og:title/twitter:title гейтятся на name; og:image/twitter:image — на mainImage;
 * canonical/og:url/twitter:url — на pub (origin).
 *
 * @param html      исходный (домен-пофикшенный) PDP-шелл product/index.html
 * @param p         товар (name / metaDescription / description / image / images / gallery)
 * @param slug      canonical slug товара
 * @param siteTitle суффикс тайтла ("<name> — <siteTitle>"); '' → без суффикса
 * @param pub       origin без хвостового '/'; '' → canonical/og:url/twitter:url не патчатся
 */
export function patchPdpMetaTags(
  html: string,
  p: Record<string, unknown>,
  slug: string,
  siteTitle: string,
  pub: string,
): string {
  let out = html;
  const name = typeof p.name === "string" ? p.name : "";
  // description: предпочитаем metaDescription (явное SEO-поле), иначе description.
  const descRaw =
    (typeof p.metaDescription === "string" && p.metaDescription.trim()
      ? p.metaDescription
      : typeof p.description === "string"
        ? p.description
        : "") ?? "";
  const desc = descRaw.trim();
  // главное изображение: image / images[0] / gallery[0] (поддержка строки и {url}).
  const pickImg = (v: unknown): string | null => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string")
      return (v as { url: string }).url;
    return null;
  };
  const imgs = Array.isArray(p.images) ? p.images : [];
  const gallery = Array.isArray((p as { gallery?: unknown[] }).gallery)
    ? ((p as { gallery: unknown[] }).gallery)
    : [];
  const mainImage =
    pickImg(p.image) ?? pickImg(imgs[0]) ?? pickImg(gallery[0]);

  const canonical = pub ? `${pub}/product/${slug}` : "";
  // canonical href (ВСЕГДА slug) — толерантный regex по атрибутам link.
  if (canonical) {
    out = out.replace(
      /(<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["'])[^"']*(["'])/i,
      `$1${escapeHtml(canonical)}$2`,
    );
    // og:url (та же canonical) — property до/после content, толерантно.
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:url["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(canonical)}$2`,
    );
    // twitter:url — та же canonical, зеркало og:url (скелет держит origin-root без id).
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:url["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(canonical)}$2`,
    );
  }
  // <title> и og:title → "<name> — <siteTitle>" (или просто name без суффикса).
  if (name) {
    const fullTitle = siteTitle ? `${name} — ${siteTitle}` : name;
    out = out.replace(
      /<title>[^<]*<\/title>/i,
      `<title>${escapeHtml(fullTitle)}</title>`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(fullTitle)}$2`,
    );
    // twitter:title — тот же fullTitle, зеркало og:title (скелет держит «Товар — Rose»).
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:title["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(fullTitle)}$2`,
    );
  }
  // description / og:description / twitter:description → обрезка ~160 симв.
  // Пусто → не трогаем (оставляем скелет, чтобы не было пустых тегов).
  if (desc) {
    const trimmed =
      desc.length > 160 ? `${desc.slice(0, 157).trimEnd()}…` : desc;
    const ed = escapeHtml(trimmed);
    out = out.replace(
      /(<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${ed}$2`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${ed}$2`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${ed}$2`,
    );
  }
  // og:image → абсолютный URL главного изображения (если есть).
  if (mainImage) {
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(mainImage)}$2`,
    );
    // twitter:image — тот же mainImage, зеркало og:image (скелет держит placeholder).
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:image["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(mainImage)}$2`,
    );
  }
  return out;
}

/**
 * Per-collection патч SEO-меты шелла collections/preview. Возвращает HTML с
 * подставленными под конкретную коллекцию canonical / og:* / twitter:* /
 * <title> / description, плюс патч ТЕЛА (data-collection-slug / catalog-title /
 * подзаголовок) — per-collection страница = копия шелла collections/preview,
 * поэтому её тело показывает хардкод «Каталог» и не скоуплено.
 *
 * canonical ВСЕГДА на /collections/<slug> (даже на per-id странице) →
 * консолидируем дубликаты в один canonical URL. twitter:* держатся зеркалом
 * og:* (BaseHead скелет несёт `property="twitter:*"` со значениями «Коллекция —
 * Rose» / placeholder / origin-root — без патча они утекают в живой HTML).
 *
 * Пустые поля НЕ трогаем (оставляем скелет, чтобы не было пустых тегов): title/
 * og:title/twitter:title гейтятся на name; og:image/twitter:image — на mainImage;
 * canonical/og:url/twitter:url — на pub (origin).
 *
 * @param html      исходный (домен-пофикшенный) шелл collections/preview/index.html
 * @param c         коллекция (name / title / metaDescription / description / image / images)
 * @param slug      canonical slug коллекции
 * @param siteTitle суффикс тайтла ("<name> — <siteTitle>"); '' → без суффикса
 * @param pub       origin без хвостового '/'; '' → canonical/og:url/twitter:url не патчатся
 */
export function patchCollectionMetaTags(
  html: string,
  c: Record<string, unknown>,
  slug: string,
  siteTitle: string,
  pub: string,
): string {
  let out = html;
  const name = typeof c.name === "string" && c.name.trim()
    ? c.name
    : (typeof c.title === "string" ? c.title : "");
  // description: metaDescription (явное SEO-поле) → description.
  const descRaw =
    (typeof c.metaDescription === "string" && c.metaDescription.trim()
      ? c.metaDescription
      : typeof c.description === "string"
        ? c.description
        : "") ?? "";
  const desc = descRaw.trim();
  // обложка: image / images[0] (поддержка строки и {url}) — как у PDP.
  const pickImg = (v: unknown): string | null => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string")
      return (v as { url: string }).url;
    return null;
  };
  const cImgs = Array.isArray((c as { images?: unknown[] }).images)
    ? ((c as { images: unknown[] }).images)
    : [];
  const mainImage = pickImg(c.image) ?? pickImg(cImgs[0]);

  const canonical = pub ? `${pub}/collections/${slug}` : "";
  if (canonical) {
    out = out.replace(
      /(<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["'])[^"']*(["'])/i,
      `$1${escapeHtml(canonical)}$2`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:url["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(canonical)}$2`,
    );
    // twitter:url — та же canonical, зеркало og:url (скелет держит origin-root без id).
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:url["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(canonical)}$2`,
    );
  }
  if (name) {
    const fullTitle = siteTitle ? `${name} — ${siteTitle}` : name;
    out = out.replace(
      /<title>[^<]*<\/title>/i,
      `<title>${escapeHtml(fullTitle)}</title>`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(fullTitle)}$2`,
    );
    // twitter:title — тот же fullTitle, зеркало og:title (скелет держит «Коллекция — Rose»).
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:title["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(fullTitle)}$2`,
    );
  }
  if (desc) {
    const trimmed =
      desc.length > 160 ? `${desc.slice(0, 157).trimEnd()}…` : desc;
    const ed = escapeHtml(trimmed);
    out = out.replace(
      /(<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${ed}$2`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${ed}$2`,
    );
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${ed}$2`,
    );
  }
  if (mainImage) {
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(mainImage)}$2`,
    );
    // twitter:image — тот же mainImage, зеркало og:image (скелет держит placeholder).
    out = out.replace(
      /(<meta\b[^>]*\bproperty=["']twitter:image["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      `$1${escapeHtml(mainImage)}$2`,
    );
  }
  // --- BODY (не только SEO): per-collection страница = копия шелла
  // collections/preview, поэтому тело показывает хардкод «Каталог» и
  // не скоуплено. Патчим тело под коллекцию. No-op если тема рендерит
  // иначе (regex не совпал) — безопасно. ---
  // 1. Скоуп Catalog на товары коллекции (клиент читает data-collection-slug).
  out = out.replace(
    /(\bdata-collection-slug=["'])[^"']*(["'])/gi,
    `$1${escapeHtml(slug)}$2`,
  );
  if (name) {
    // 2. Заголовок каталога → имя коллекции (id="catalog-title" —
    //    цель aria-labelledby секции Catalog во всех темах).
    out = out.replace(
      /(<(h1|h2)\b[^>]*\bid=["']catalog-title["'][^>]*>)[\s\S]*?(<\/\2>)/i,
      `$1${escapeHtml(name)}$3`,
    );
  }
  if (desc) {
    // 3. Подзаголовок каталога → описание коллекции (замена известных
    //    тема-хардкодов; vanilla подзаголовок пуст).
    const edSub = escapeHtml(desc);
    out = out
      .replace("Здесь начинается персональный стиль", () => edSub)
      .replace("Следующее поколение уже с вами", () => edSub);
  }
  return out;
}
