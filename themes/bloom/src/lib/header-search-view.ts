/**
 * Разметка результатов поиска из лупы — bloom. Поведение — общий модуль
 * packages/theme-base/runtime/header-search.ts; здесь только вид.
 *
 *   панель  — ряд из трёх карточек (макет 1320×563: фото 429×429 со
 *             скруглением 12, плашка «Скидка» — пилюля акцента, точки-
 *             переключатель фото, имя и цена Inter 300 16/19, старая 14/17);
 *   шторка  — карточки на всю ширину 343 друг под другом через 40px (фото
 *             квадратом, имя и цена 14/17, старая 12/15) и кнопка
 *             «В корзину» 40px — как в макете «Бургер» 375.
 *
 * Точки — не украшение: они переключают фото (обработчик в общем модуле) и
 * рисуются, только если у товара больше одного фото. Кнопка «В корзину» — тот
 * же делегат `[data-add-to-cart]` nt-cart, что у карточек каталога; товар с
 * вариантами кладёт первую комбинацию по порядку показа (решение владельца).
 *
 * Цвета — роли схемы шапки: коробка и выдача красятся схемой шапки, как
 * выпадающие меню (Схема 1 по решению владельца 15.09 — только строка поля и
 * кнопка), в шторке — схема меню. Старая цена цветом текста.
 */
import type {
	HeaderSearchHit,
	HeaderSearchRenderContext,
} from "../../../../packages/theme-base/runtime/header-search";

export const SEARCH_MESSAGE_CLASS =
	"px-1 py-2 font-inter text-[14px] font-light leading-[17px] text-[rgb(var(--color-text,0_0_0))]";

const photo = (hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string =>
	hit.image
		? `<img data-search-img src="${ctx.escapeHtml(hit.image)}" alt="" loading="lazy" onerror="this.onerror=null;this.remove()" class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105" />`
		: "";

const badge = (hit: HeaderSearchHit): string =>
	hit.onSale
		? `<span class="absolute left-3 top-3 inline-flex h-6 items-center rounded-[16px] bg-[rgb(var(--color-accent,227_142_159))] px-1.5 font-inter text-[12px] font-light leading-[15px] !text-white">Скидка</span>`
		: "";

function dots(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string {
	if (hit.images.length < 2) return "";
	const items = hit.images
		.map(
			(src, i) =>
				`<button type="button" data-search-dot data-src="${ctx.escapeHtml(src)}" data-active="${i === 0 ? "true" : "false"}" aria-pressed="${i === 0 ? "true" : "false"}" aria-label="Фото ${i + 1}" class="h-3 w-3 rounded-full bg-[rgb(var(--color-accent,227_142_159)/0.2)] transition-all data-[active=true]:w-5 data-[active=true]:bg-[rgb(var(--color-accent,227_142_159))]"></button>`,
		)
		.join("");
	return `<div class="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-full bg-[rgb(var(--color-surface,245_245_245))] p-0.5">${items}</div>`;
}

function media(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string {
	return (
		`<div class="relative w-full">` +
		`<a href="${ctx.escapeHtml(hit.href)}" tabindex="-1" aria-hidden="true" class="group relative block aspect-square w-full overflow-hidden rounded-[var(--radius-media,12px)] bg-[rgb(var(--color-surface,245_245_245))]">` +
		photo(hit, ctx) +
		badge(hit) +
		`</a>` +
		dots(hit, ctx) +
		`</div>`
	);
}

function panelCard(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string {
	const oldPrice = hit.oldPrice
		? `<span class="text-[14px] leading-[17px] line-through">${ctx.escapeHtml(ctx.formatPrice(hit.oldPrice))}</span>`
		: "";
	return (
		`<li data-search-hit data-product-id="${ctx.escapeHtml(hit.id)}" class="flex min-w-0 flex-col gap-5">` +
		media(hit, ctx) +
		`<a href="${ctx.escapeHtml(hit.href)}" class="flex flex-col gap-1 font-inter font-light text-[rgb(var(--color-text,0_0_0))] outline-none transition-opacity hover:opacity-70 focus-visible:opacity-70">` +
		`<span class="truncate text-[16px] leading-[19px]">${ctx.escapeHtml(hit.title)}</span>` +
		`<span class="flex items-center gap-2"><span class="text-[16px] leading-[19px]">${ctx.escapeHtml(ctx.formatPrice(hit.price))}</span>${oldPrice}</span>` +
		`</a></li>`
	);
}

function addToCart(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string {
	if (!hit.available) {
		return `<button type="button" disabled class="flex h-10 w-full cursor-not-allowed items-center justify-center rounded-[var(--radius-button,9999px)] bg-[rgb(var(--color-surface,245_245_245))] px-3 font-inter text-[14px] font-light leading-[17px] text-[rgb(var(--color-text,0_0_0)/0.5)]">Нет в наличии</button>`;
	}
	const combo = hit.combinationId
		? ` data-variant-combination-id="${ctx.escapeHtml(hit.combinationId)}"`
		: "";
	const options = hit.combinationOptions
		? ` data-variant-options="${ctx.escapeHtml(JSON.stringify(hit.combinationOptions))}"`
		: "";
	return (
		`<button type="button" data-add-to-cart data-product-id="${ctx.escapeHtml(hit.id)}"` +
		` data-name="${ctx.escapeHtml(hit.title)}" data-price="${hit.price}"` +
		` data-old-price="${hit.oldPrice ?? ""}" data-image="${ctx.escapeHtml(hit.image)}" data-quantity="1"` +
		combo +
		options +
		` class="flex h-10 w-full items-center justify-center rounded-[var(--radius-button,9999px)] bg-[rgb(var(--color-button-bg,227_142_159))] px-3 font-inter text-[14px] font-light leading-[17px] text-[rgb(var(--color-button-text,255_255_255))] transition-opacity hover:opacity-90 active:scale-95">В корзину</button>`
	);
}

function drawerCard(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string {
	const oldPrice = hit.oldPrice
		? `<span class="text-[12px] leading-[15px] line-through">${ctx.escapeHtml(ctx.formatPrice(hit.oldPrice))}</span>`
		: "";
	return (
		`<li data-search-hit data-product-id="${ctx.escapeHtml(hit.id)}" class="flex min-w-0 flex-col gap-5">` +
		media(hit, ctx) +
		`<div class="flex flex-col gap-[18px]">` +
		`<a href="${ctx.escapeHtml(hit.href)}" class="flex flex-col gap-1 font-inter font-light text-[rgb(var(--color-text,0_0_0))] outline-none">` +
		`<span class="truncate text-[14px] leading-[17px]">${ctx.escapeHtml(hit.title)}</span>` +
		`<span class="flex items-center gap-2"><span class="text-[14px] leading-[17px]">${ctx.escapeHtml(ctx.formatPrice(hit.price))}</span>${oldPrice}</span>` +
		`</a>` +
		addToCart(hit, ctx) +
		`</div></li>`
	);
}

export function renderSearchResults(
	hits: HeaderSearchHit[],
	ctx: HeaderSearchRenderContext,
): string {
	if (ctx.layout === "drawer") {
		return `<ul class="flex flex-col gap-10">${hits.map((h) => drawerCard(h, ctx)).join("")}</ul>`;
	}
	return `<ul class="grid grid-cols-3 gap-2">${hits.map((h) => panelCard(h, ctx)).join("")}</ul>`;
}
