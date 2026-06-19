/**
 * Превью строки корзины: WebP + PNG/JPEG fallback с учётом Astro base через withBase().
 */
import { withBase } from "./with-base";

export function cartLineThumbPictureHtml(imageUrl: string, alt: string): string {
	const safeAlt = alt.replace(/"/g, "&quot;");
	// Товарные картинки MinIO/API — абсолютный URL: отдаём как есть (как карточка).
	// withBase ломал бы абсолютный URL (→ "/https://…" → 404), а .webp-варианта
	// у них нет (→ 404, и <picture> НЕ откатывается на <img>). onerror прячет битый src.
	if (/^(https?:)?\/\//i.test(imageUrl) || imageUrl.startsWith("data:")) {
		return `<img src="${imageUrl}" alt="${safeAlt}" decoding="async" width="80" height="80" class="h-full w-full object-cover" onerror="this.style.visibility='hidden'" />`;
	}
	const pngAbs = withBase(imageUrl);
	const webpAbs = pngAbs.replace(/\.(png|jpe?g)$/i, ".webp");
	const noWebp = webpAbs === pngAbs;
	return `
<picture class="contents">
	${noWebp ? "" : `<source srcset="${webpAbs}" type="image/webp" />`}
	<img src="${pngAbs}" alt="${safeAlt}" decoding="async" width="80" height="80" class="h-full w-full object-cover" />
</picture>`;
}
