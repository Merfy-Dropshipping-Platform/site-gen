/**
 * Разметка результатов поиска из лупы — vanilla. Поведение — общий модуль
 * packages/theme-base/runtime/header-search.ts; здесь только вид.
 *
 *   панель  — столбец строк 48px (миниатюра 48 + название Arsenal 14/18, цена
 *             14/18, старая 12/15), видно три строки, дальше прокрутка с тонкой
 *             полосой справа — макет «Поиск» 1320×232;
 *   шторка  — тот же столбец без ограничения высоты (макет «Бургер» 375).
 *
 * Цвета. Панель — роли схемы шапки, как выпадающие меню vanilla (NavItem).
 * Шторка — палитра самой шторки `--vanilla-*`: её полотно и пункты меню
 * красятся ими, а схема меню ремапит их на токены (global.css,
 * #vanilla-burger[class*="color-scheme-"]). Роль «Текст» схемы шапки на
 * светлом полотне шторки дала бы белый текст на белом. Старая цена — цветом
 * текста, как в карточках (жалоба тестировщика 14.09).
 */
import type {
	HeaderSearchHit,
	HeaderSearchRenderContext,
} from "../../../../packages/theme-base/runtime/header-search";

export const SEARCH_MESSAGE_CLASS =
	"py-2 font-vanilla-arsenal text-[14px] font-normal leading-[18px]";

const thumb = (hit: HeaderSearchHit, ctx: HeaderSearchRenderContext): string =>
	hit.image
		? `<img src="${ctx.escapeHtml(hit.image)}" alt="" loading="lazy" onerror="this.onerror=null;this.remove()" class="size-full object-cover" />`
		: "";

function row(hit: HeaderSearchHit, ctx: HeaderSearchRenderContext, drawer: boolean): string {
	const textCls = drawer
		? "text-[var(--vanilla-dark)]"
		: "text-[rgb(var(--color-text,0_0_0))]";
	const thumbBg = drawer
		? "bg-[var(--vanilla-line)]"
		: "bg-[rgb(var(--color-surface,245_245_245))]";
	const oldPrice = hit.oldPrice
		? `<span class="text-[12px] leading-[15px] line-through">${ctx.escapeHtml(ctx.formatPrice(hit.oldPrice))}</span>`
		: "";
	return (
		`<li data-search-hit data-product-id="${ctx.escapeHtml(hit.id)}" class="min-w-0">` +
		`<a href="${ctx.escapeHtml(hit.href)}" class="flex h-12 min-w-0 items-center gap-3 outline-none transition-opacity hover:opacity-70 focus-visible:opacity-70">` +
		`<span class="size-12 shrink-0 overflow-hidden ${thumbBg}">${thumb(hit, ctx)}</span>` +
		`<span class="flex min-w-0 flex-col gap-0.5 font-vanilla-arsenal font-normal ${textCls}">` +
		`<span class="truncate text-[14px] leading-[18px]">${ctx.escapeHtml(hit.title)}</span>` +
		`<span class="flex items-center gap-1"><span class="text-[14px] leading-[18px]">${ctx.escapeHtml(ctx.formatPrice(hit.price))}</span>${oldPrice}</span>` +
		`</span></a></li>`
	);
}

export function renderSearchResults(
	hits: HeaderSearchHit[],
	ctx: HeaderSearchRenderContext,
): string {
	const drawer = ctx.layout === "drawer";
	const items = hits.map((hit) => row(hit, ctx, drawer)).join("");
	if (drawer) return `<ul class="flex flex-col gap-2">${items}</ul>`;
	// Три строки (3×48 + 2×8 = 160px), дальше — прокрутка. Полоса 4px на
	// подложке «Поверхность», как в макете.
	return (
		`<ul class="flex max-h-[160px] flex-col gap-2 overflow-y-auto pr-2 [scrollbar-width:thin] ` +
		`[scrollbar-color:rgb(var(--color-text,0_0_0)/0.3)_rgb(var(--color-surface,238_238_238))] ` +
		`[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[rgb(var(--color-surface,238_238_238))] ` +
		`[&::-webkit-scrollbar-thumb]:bg-[rgb(var(--color-text,0_0_0)/0.3)]">${items}</ul>`
	);
}
