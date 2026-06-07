/**
 * Превью строки корзины: WebP + PNG fallback, учёт astro base через withBase().
 * Используется и на странице /cart/, и в NtCartDrawer (см. nt-cart-rose.ts).
 */
import { withBase } from "./with-base";

export function cartLineThumbPictureHtml(imageUrl: string, alt: string): string {
	const pngAbs = withBase(imageUrl);
	const webpAbs = pngAbs.replace(/\.(png|jpe?g)$/i, ".webp");
	const noWebp = webpAbs === pngAbs;
	const safeAlt = alt.replace(/"/g, "&quot;");
	return `
<picture class="contents">
	${noWebp ? "" : `<source srcset="${webpAbs}" type="image/webp" />`}
	<img src="${pngAbs}" alt="${safeAlt}" decoding="async" width="80" height="80" class="h-full w-full object-cover" />
</picture>`;
}
