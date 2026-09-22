/**
 * Разметка результатов поиска из лупы — rose. Поведение — общий модуль
 * packages/theme-base/runtime/header-search.ts; здесь только вид.
 *
 *   панель  — ряд из четырёх штатных карточек rose (как RoseProductCard:
 *             фото 318×444 со скруглением медиа, плашка «Скидка», имя 14,
 *             цена 16, старая 14) — макет десктопа 1320, карточки через 8px;
 *   шторка  — сетка в две колонки, карточка 168×220 (макет «Бургер» 375:
 *             зазор 8 по горизонтали и 40 по вертикали, имя и цены 12/16,
 *             старая цена 10/14).
 *
 * Цвета — роли схемы шапки: коробка и выдача красятся схемой шапки, как
 * выпадающие меню (Схема 1 по решению владельца 15.09 — только строка поля и
 * кнопка), в шторке — схема меню. Старая цена цветом текста, как в карточках
 * (жалоба тестировщика 14.09).
 */
import type {
	HeaderSearchHit,
	HeaderSearchRenderContext,
} from "../../../../packages/theme-base/runtime/header-search";

export const SEARCH_MESSAGE_CLASS =
	"py-2 font-manrope text-[14px] font-normal leading-normal text-[rgb(var(--color-text,0_0_0))]";

// Битое фото снимается — остаётся подложка роли «Поверхность», как у карточек
// каталога без фото.
const photo = (hit: HeaderSearchHit, ctx: HeaderSearchRenderContext, cls: string): string =>
	hit.image
		? `<img src="${ctx.escapeHtml(hit.image)}" alt="" loading="lazy" onerror="this.onerror=null;this.remove()" class="${cls}" />`
		: "";

function panelCard(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string {
	const badge = hit.onSale
		? `<span class="absolute left-3 top-3 z-10 flex h-6 min-w-12 items-center justify-center rounded-[4px] bg-[rgb(var(--color-accent,0_0_0))] px-2 font-manrope text-[12px] font-normal leading-none !text-white">Скидка</span>`
		: "";
	const oldPrice = hit.oldPrice
		? `<span class="font-manrope text-[14px] font-normal leading-none text-[rgb(var(--color-text,0_0_0))] line-through">${ctx.escapeHtml(ctx.formatPrice(hit.oldPrice))}</span>`
		: "";
	return (
		`<li data-search-hit data-product-id="${ctx.escapeHtml(hit.id)}" class="min-w-0">` +
		`<a href="${ctx.escapeHtml(hit.href)}" class="group flex flex-col gap-5 outline-none focus-visible:opacity-80">` +
		`<span class="relative block aspect-[318/444] w-full overflow-hidden rounded-[var(--radius-media,8px)] bg-[rgb(var(--color-surface,245_245_245))]">` +
		photo(hit, ctx, "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105") +
		badge +
		`</span>` +
		`<span class="flex w-full flex-col gap-1 text-left">` +
		`<span class="block w-full truncate font-manrope text-[14px] font-normal leading-none text-[rgb(var(--color-text,0_0_0))]">${ctx.escapeHtml(hit.title)}</span>` +
		`<span class="flex w-full flex-wrap items-baseline gap-2">` +
		`<span class="font-manrope text-[16px] font-normal leading-none text-[rgb(var(--color-text,0_0_0))]">${ctx.escapeHtml(ctx.formatPrice(hit.price))}</span>` +
		oldPrice +
		`</span></span></a></li>`
	);
}

function drawerCard(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string {
	const badge = hit.onSale
		? `<span class="absolute left-2 top-2 z-10 flex h-5 items-center justify-center rounded-[4px] bg-[rgb(var(--color-accent,0_0_0))] px-1 font-manrope text-[10px] font-normal leading-[14px] !text-white">Скидка</span>`
		: "";
	const oldPrice = hit.oldPrice
		? `<span class="text-[10px] leading-[14px] line-through">${ctx.escapeHtml(ctx.formatPrice(hit.oldPrice))}</span>`
		: "";
	return (
		`<li data-search-hit data-product-id="${ctx.escapeHtml(hit.id)}" class="min-w-0">` +
		`<a href="${ctx.escapeHtml(hit.href)}" class="flex flex-col gap-3 outline-none focus-visible:opacity-80">` +
		`<span class="relative block aspect-[168/220] w-full overflow-hidden rounded-[var(--radius-media,8px)] bg-[rgb(var(--color-surface,245_245_245))]">` +
		photo(hit, ctx, "h-full w-full object-cover") +
		badge +
		`</span>` +
		`<span class="flex flex-col gap-1 font-manrope font-normal text-[rgb(var(--color-text,0_0_0))]">` +
		`<span class="truncate text-[12px] leading-4">${ctx.escapeHtml(hit.title)}</span>` +
		`<span class="flex items-center gap-1.5">` +
		`<span class="text-[12px] leading-4">${ctx.escapeHtml(ctx.formatPrice(hit.price))}</span>` +
		oldPrice +
		`</span></span></a></li>`
	);
}

export function renderSearchResults(
	hits: HeaderSearchHit[],
	ctx: HeaderSearchRenderContext,
): string {
	if (ctx.layout === "drawer") {
		return `<ul class="grid grid-cols-2 gap-x-2 gap-y-10">${hits.map((h) => drawerCard(h, ctx)).join("")}</ul>`;
	}
	return `<ul class="grid grid-cols-4 gap-2">${hits.map((h) => panelCard(h, ctx)).join("")}</ul>`;
}
