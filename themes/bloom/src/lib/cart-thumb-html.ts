/**
 * Превью строки корзины с учётом Astro base через withBase().
 */
import { withBase } from "./with-base";

export function cartLineThumbPictureHtml(imageUrl: string, alt: string): string {
	const safeAlt = alt.replace(/"/g, "&quot;");
	// Абсолютный URL (MinIO/API товары) — как есть; withBase ломал бы (→ "/https://…" → 404).
	const src = /^(https?:)?\/\//i.test(imageUrl) || imageUrl.startsWith("data:") ? imageUrl : withBase(imageUrl);
	return `<img src="${src}" alt="${safeAlt}" decoding="async" width="80" height="80" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" onerror="this.style.visibility='hidden'" />`;
}
