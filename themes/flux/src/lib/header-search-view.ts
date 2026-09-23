/**
 * Разметка результатов поиска из лупы — flux (Figma «Поиск», 1320×232 на
 * десктопе, шторка 375 на телефоне). Поведение — общий модуль
 * packages/theme-base/runtime/header-search.ts; здесь только вид.
 *
 *   панель  — три колонки по три строки (строка 48px: миниатюра 48 + название
 *             и цена), колонки идут сверху вниз, как в макете;
 *   шторка  — один столбец тех же строк с шагом 12px.
 *
 * Строка: Roboto Flex 300 14/16 прописными, цена 14/16, старая цена 12/14
 * зачёркнутая. Все цвета — роли схемы шапки (строку поиска над выдачей красит
 * Схема 1 — правило form[role="search"], решение владельца 15.09 про поле и
 * кнопку; коробка и выдача — схема шапки, как выпадающие меню; в шторке —
 * схема меню). Старая цена цветом текста, а не серым: так же, как в карточках
 * (жалоба тестировщика 14.09).
 */
import type {
	HeaderSearchHit,
	HeaderSearchRenderContext,
} from "../../../../packages/theme-base/runtime/header-search";

/** Строка-сообщение («Ищем…», «ничего не нашлось»). */
export const SEARCH_MESSAGE_CLASS =
	"font-roboto-flex text-[14px] font-light leading-4 text-[rgb(var(--color-text,0_0_0))]";

// Битое фото (файл удалён из хранилища) снимается целиком — остаётся подложка
// роли «Поверхность», а не значок сломанной картинки.
const thumb = (hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string =>
	hit.image
		? `<img src="${ctx.escapeHtml(hit.image)}" alt="" loading="lazy" onerror="this.onerror=null;this.remove()" class="size-full object-cover" />`
		: "";

function row(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string {
	const oldPrice = hit.oldPrice
		? `<span class="text-[12px] leading-[14px] text-[rgb(var(--color-text,0_0_0))] line-through">${ctx.escapeHtml(ctx.formatPrice(hit.oldPrice))}</span>`
		: "";
	return (
		`<li data-search-hit data-product-id="${ctx.escapeHtml(hit.id)}" class="min-w-0">` +
		`<a href="${ctx.escapeHtml(hit.href)}" class="flex h-12 min-w-0 items-center gap-3 outline-none transition-opacity hover:opacity-70 focus-visible:opacity-70">` +
		`<span class="size-12 shrink-0 overflow-hidden bg-[rgb(var(--color-surface,245_245_245))]">${thumb(hit, ctx)}</span>` +
		`<span class="flex min-w-0 flex-col gap-0.5 font-roboto-flex font-light">` +
		`<span class="truncate text-[14px] uppercase leading-4 text-[rgb(var(--color-text,0_0_0))]">${ctx.highlight(hit.title)}</span>` +
		`<span class="flex items-center gap-1">` +
		`<span class="text-[14px] leading-4 text-[rgb(var(--color-text,0_0_0))]">${ctx.escapeHtml(ctx.formatPrice(hit.price))}</span>` +
		oldPrice +
		`</span></span></a></li>`
	);
}

export function renderSearchResults(
	hits: HeaderSearchHit[],
	ctx: HeaderSearchRenderContext,
): string {
	const items = hits.map((hit) => row(hit, ctx)).join("");
	if (ctx.layout === "drawer") {
		return `<ul class="flex flex-col gap-3">${items}</ul>`;
	}
	return `<ul class="grid grid-flow-col grid-cols-3 grid-rows-3 gap-x-8 gap-y-2 xl:gap-x-[126px]">${items}</ul>`;
}
