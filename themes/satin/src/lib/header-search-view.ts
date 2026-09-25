/**
 * Разметка результатов поиска из лупы — satin. Поведение — общий модуль
 * packages/theme-base/runtime/header-search.ts; здесь только вид.
 *
 *   панель  — горизонтальный ряд карточек 195×256 через 12px с прокруткой
 *             вбок (макет «Поиск» 1320×374: плашка «Скидка» в углу, сердце
 *             избранного, название и цена Arsenal 14/18 прописными, старая
 *             цена 12/15);
 *   шторка  — те же карточки сеткой в две колонки.
 *
 * `font-manrope` у satin — это Arsenal (global.css переопределяет класс на
 * --font-body), тот же класс стоит в штатной карточке SatinProductCard.
 * Сердце — общий делегат избранного `[data-wishlist-toggle][data-product-id]`;
 * начальное состояние берём у window.__satinWishlist, как карточки каталога.
 *
 * Цвета — роли схемы шапки: коробка и выдача красятся схемой шапки, как
 * выпадающие меню (Схема 1 по решению владельца 15.09 — только строка поля и
 * кнопка), в шторке — схема меню. Старая цена цветом текста, как в карточках.
 */
import type {
	HeaderSearchHit,
	HeaderSearchRenderContext,
} from "../../../../packages/theme-base/runtime/header-search";

export const SEARCH_MESSAGE_CLASS =
	"py-2 font-manrope text-[14px] font-normal uppercase leading-[18px] text-[rgb(var(--color-text,0_0_0))]";

const HEART_OUTLINE =
	'<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">' +
	'<g transform="translate(4.22 5.867)"><path d="M10.0342 18.882C6.93786 16.5652 0.8 11.2695 0.8 6.50305C0.8 3.35396 3.11131 0.8 6.29004 0.8C7.93705 0.8 9.58406 1.349 11.7801 3.54502C13.9761 1.349 15.6231 0.8 17.2701 0.8C20.4488 0.8 22.7601 3.35396 22.7601 6.50305C22.7601 11.2684 16.6223 16.5652 13.5259 18.882C12.4828 19.6616 11.0773 19.6616 10.0342 18.882Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></g>' +
	"</svg>";

interface SatinWishlistLike {
	has(id: string): boolean;
	heartSvg(filled: boolean): string;
}

function heart(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string {
	const api =
		typeof window !== "undefined"
			? (window as unknown as { __satinWishlist?: SatinWishlistLike }).__satinWishlist
			: undefined;
	const wished = !!api && api.has(hit.id);
	const inner = api ? api.heartSvg(wished) : HEART_OUTLINE;
	return (
		`<button type="button" data-wishlist-toggle data-product-id="${ctx.escapeHtml(hit.id)}" aria-pressed="${wished ? "true" : "false"}" aria-label="В избранное" ` +
		`class="absolute right-2 top-2 z-20 flex size-6 items-center justify-center text-[rgb(var(--color-text,0_0_0))] transition-opacity hover:opacity-70">` +
		`<span data-wishlist-icon class="block size-6">${inner}</span></button>`
	);
}

function card(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext, drawer: boolean): string {
	const badge = hit.onSale
		? `<span class="pointer-events-none absolute left-0 top-0 inline-flex h-6 items-center bg-[rgb(var(--color-accent,0_0_0))] px-1.5 font-manrope text-[12px] font-medium uppercase leading-4 text-white">Скидка</span>`
		: "";
	const photo = hit.image
		? `<img src="${ctx.escapeHtml(hit.image)}" alt="" loading="lazy" onerror="this.onerror=null;this.remove()" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />`
		: "";
	const size = drawer ? "text-[12px] leading-[15px]" : "text-[14px] leading-[18px]";
	const oldSize = drawer ? "text-[10px] leading-[13px]" : "text-[12px] leading-[15px]";
	const oldPrice = hit.oldPrice
		? `<span class="${oldSize} text-[rgb(var(--color-text,0_0_0))] line-through">${ctx.escapeHtml(ctx.formatPrice(hit.oldPrice))}</span>`
		: "";
	return (
		`<li data-search-hit data-product-id="${ctx.escapeHtml(hit.id)}" class="${drawer ? "min-w-0" : "w-[195px] shrink-0"}">` +
		`<div class="group flex flex-col gap-2">` +
		`<div class="relative aspect-[195/256] w-full overflow-hidden rounded-[var(--radius-media,0px)] bg-[rgb(var(--color-surface,245_245_245))]">` +
		`<a href="${ctx.escapeHtml(hit.href)}" tabindex="-1" aria-hidden="true" class="block size-full">${photo}</a>` +
		badge +
		heart(hit, ctx) +
		`</div>` +
		`<a href="${ctx.escapeHtml(hit.href)}" class="flex flex-col gap-0.5 font-manrope font-normal text-[rgb(var(--color-text,0_0_0))] outline-none transition-opacity hover:opacity-70 focus-visible:opacity-70">` +
		`<span class="truncate uppercase ${size}">${ctx.highlight(hit.title)}</span>` +
		`<span class="flex items-center gap-1"><span class="${size}">${ctx.escapeHtml(ctx.formatPrice(hit.price))}</span>${oldPrice}</span>` +
		`</a></div></li>`
	);
}

export function renderSearchResults(
	hits: HeaderSearchHit[],
	ctx: HeaderSearchRenderContext,
): string {
	if (ctx.layout === "drawer") {
		return `<ul class="grid grid-cols-2 gap-x-2 gap-y-6">${hits.map((h) => card(h, ctx, true)).join("")}</ul>`;
	}
	return (
		`<ul class="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] ` +
		`[scrollbar-color:rgb(var(--color-text,0_0_0)/0.3)_transparent]">` +
		hits.map((h) => card(h, ctx, false)).join("") +
		`</ul>`
	);
}
