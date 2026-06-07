/**
 * Превью строки корзины: WebP (после optimize на диске только .webp).
 */
import { withBase } from "./with-base";

function rasterImgSrc(src: string): string {
	return src.replace(/\.(png|jpe?g)$/i, ".webp");
}

export function cartLineThumbPictureHtml(imageUrl: string, alt: string): string {
	const imgAbs = withBase(rasterImgSrc(imageUrl));
	const safeAlt = alt.replace(/"/g, "&quot;");
	return `<img src="${imgAbs}" alt="${safeAlt}" decoding="async" width="80" height="80" class="h-full w-full object-cover" />`;
}
