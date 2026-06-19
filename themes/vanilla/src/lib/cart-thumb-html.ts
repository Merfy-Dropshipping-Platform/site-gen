/**
 * Превью строки корзины: WebP (после optimize на диске только .webp).
 */
import { withBase } from "./with-base";

function rasterImgSrc(src: string): string {
	return src.replace(/\.(png|jpe?g)$/i, ".webp");
}

export function cartLineThumbPictureHtml(imageUrl: string, alt: string): string {
	const safeAlt = alt.replace(/"/g, "&quot;");
	// Абсолютный URL (MinIO/API товары): сырой .jpg/.png как есть — withBase ломал
	// бы абсолютный URL, а .webp-варианта у них нет (→ 404). rasterImgSrc/.webp —
	// только для локальных ассетов (плейсхолдер).
	const isAbs = /^(https?:)?\/\//i.test(imageUrl) || imageUrl.startsWith("data:");
	const imgAbs = isAbs ? imageUrl : withBase(rasterImgSrc(imageUrl));
	return `<img src="${imgAbs}" alt="${safeAlt}" decoding="async" width="80" height="80" class="h-full w-full object-cover" onerror="this.style.visibility='hidden'" />`;
}
