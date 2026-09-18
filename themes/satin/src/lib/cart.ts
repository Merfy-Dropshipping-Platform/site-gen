/**
 * Корзина Satin — ЕДИНОЕ ядро nt-cart (`packages/theme-base/runtime/nt-cart`) +
 * только satin-разметка строки дровера.
 *
 * Была локальная копия ядра (`nt-cart-satin.ts`). Она разошлась с общим на 309
 * строк и не имела reconcile-самолечения, variantImage и хука разметки строки.
 * Мигрировано тем же путём, что flux (theme-registry/CART-WISHLIST.md):
 * storageKey/eventPrefix НЕ менялись — корзины покупателей живы.
 */
import {
	createNtCart,
	type NtCartLine,
	type NtCartLineVariant,
} from "../../../../packages/theme-base/runtime/nt-cart";
import { cartLineThumbPictureHtml } from "./cart-thumb-html";

const api = createNtCart({
	storageKey: "satin:cart:v1",
	eventPrefix: "satin:cart",
	// Само-лечение корзины из каталога — как у rose (эталон). У локальной копии
	// ядра его не было: корзина могла показывать старую цену.
	catalogUrl: "/data/products.json",
	// Разметка строки дровера (вид satin сохранён: шрифт manrope, скруглённое
	// превью) — форма НЕ меняется, только краска.
	//
	// ЦВЕТ — только токенами схемы (жалоба владельца 15.09: «не применяется
	// цветовая схема» — CartBody.astro починили, а строки ДРОВЕРА рисует ЭТОТ
	// файл, отдельная разметка, гард до него не доставал). Роли — по эталону
	// CartBody.astro (satin): название/цена/счётчик → --color-text;
	// приглушённое (вариант, «Удалить») → --color-muted; рамка степпера →
	// --color-muted/0.3 (тот же перевод, что уже сделан в CartBody.astro).
	// Плашка-плейсхолдер уже была токеном (--color-surface) — не трогаем.
	// Сторож: pnpm test:cart-drawer-items-scheme.
	renderDrawerItem: (line, { formatPrice, productPathPrefix }) => {
		const variant = [line.variant?.color, line.variant?.size].filter(Boolean).join(", ");
		const pHref = `${productPathPrefix}/${line.productId}`;
		const thumb = cartLineThumbPictureHtml(line.image, line.name);
		return `
					<li class="flex items-start gap-4" data-line-id="${line.id}">
						<a href="${pHref}" class="block size-20 shrink-0 overflow-hidden rounded-[var(--radius-media,0px)] bg-[rgb(var(--color-surface,245_245_245))]">
							${thumb}
						</a>
						<div class="flex flex-1 flex-col gap-2">
							<div class="flex items-start justify-between gap-2">
								<div class="flex flex-col gap-1">
									<a href="${pHref}" class="font-manrope text-[16px] font-normal leading-normal text-[rgb(var(--color-text,0_0_0))] hover:opacity-80">${line.name}</a>
									${variant ? `<span class="font-manrope text-[14px] font-light leading-normal text-[rgb(var(--color-muted,153_153_153))]">${variant}</span>` : ""}
								</div>
								<button type="button" data-cart-remove data-id="${line.id}" class="font-manrope text-[14px] font-normal leading-normal text-[rgb(var(--color-muted,153_153_153))] transition-opacity hover:text-[rgb(var(--color-text,0_0_0))]" aria-label="Удалить">Удалить</button>
							</div>
							<div class="flex items-center justify-between">
								<div class="inline-flex h-9 items-center rounded-[4px] border border-[rgb(var(--color-muted,153_153_153)/0.3)]">
									<button type="button" data-cart-dec data-id="${line.id}" class="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text,0_0_0))]" aria-label="Уменьшить">−</button>
									<span class="min-w-[28px] text-center font-manrope text-[14px] text-[rgb(var(--color-text,0_0_0))]">${line.quantity}</span>
									<button type="button" data-cart-inc data-id="${line.id}" class="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text,0_0_0))]" aria-label="Увеличить">+</button>
								</div>
								<div class="flex items-baseline gap-2">
									<span class="font-manrope text-[16px] font-normal leading-normal text-[rgb(var(--color-text,0_0_0))]">${formatPrice(line.price * line.quantity)}</span>
									${
										typeof line.oldPrice === "number" && line.oldPrice > line.price
											? `<span class="font-manrope text-[13px] font-light leading-normal text-[rgb(var(--color-text,0_0_0))] line-through">${formatPrice(line.oldPrice * line.quantity)}</span>`
											: ""
									}
								</div>
							</div>
						</div>
					</li>
				`;
	},
});

export type CartLine = NtCartLine;
export type CartLineVariant = NtCartLineVariant;

export const getCart = api.getCart;
export const addToCart = api.addToCart;
export const updateQuantity = api.updateQuantity;
export const removeFromCart = api.removeFromCart;
export const clearCart = api.clearCart;
export const getCartCount = api.getCartCount;
export const getCartTotal = api.getCartTotal;
export const formatCartPrice = api.formatCartPrice;
export const initCartUI = api.initCartUI;
