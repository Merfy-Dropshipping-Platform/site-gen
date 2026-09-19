/**
 * Корзина Flux — ЕДИНОЕ ядро nt-cart (`packages/theme-base/runtime/nt-cart`) +
 * только flux-разметка строки дровера (roboto-flex, рамки #F5F5F5, WebP-превью
 * через cartLineThumbPictureHtml).
 *
 * Была локальная копия ядра (`nt-cart-flux.ts`) с обоснованием «пакетный
 * nt-cart не имеет variantCombinationId» — оно УСТАРЕЛО: общее ядро давно несёт
 * variantCombinationId, плюс reconcile-самолечение строк, variantImage и
 * storefront-fallback, которых у копии не было (миграция 2026-08-09,
 * theme-registry/CART-WISHLIST.md). storageKey/eventPrefix НЕ менялись —
 * корзины покупателей живы.
 */
import {
	createNtCart,
	type NtCartLine,
	type NtCartLineVariant,
} from "../../../../packages/theme-base/runtime/nt-cart";
import { cartLineThumbPictureHtml } from "./cart-thumb-html";

const api = createNtCart({
	storageKey: "flux:cart:v1",
	eventPrefix: "flux:cart",
	// Разметка строки дровера — вид flux сохранён (шрифт roboto-flex).
	//
	// ЦВЕТ — только токенами схемы (жалоба владельца 15.09: «схема не доезжает
	// до корзины flux» — CartBody.astro починили, а строки ДРОВЕРА рисует ЭТОТ
	// файл, отдельная разметка, гард до него не доставал). Роли — по эталону
	// CartBody.astro (flux): название/цена → --color-text (у flux это основной
	// текст, не приглушённый); приглушённое (вариант, «Удалить») →
	// --color-muted; рамка степпера → --color-muted/0.3 (щадящий перевод: было
	// #F5F5F5, страница уже сменила степпер на заливку --color-button-bg, но
	// здесь оставляем прежнюю рамочную вёрстку — переводим только краску, не
	// форму). Плашка-плейсхолдер (#F5F5F5) — законное исключение, как в
	// CartBody.astro. Сторож: pnpm test:cart-drawer-items-scheme.
	renderDrawerItem: (line, { formatPrice, productPathPrefix }) => {
		const variant = [line.variant?.color, line.variant?.size].filter(Boolean).join(", ");
		const pHref = `${productPathPrefix}/${line.productId}`;
		const thumb = cartLineThumbPictureHtml(line.image, line.name);
		return `
					<li class="flex items-start gap-4" data-line-id="${line.id}">
						<a href="${pHref}" class="block size-20 shrink-0 overflow-hidden bg-[#F5F5F5]">
							${thumb}
						</a>
						<div class="flex flex-1 flex-col gap-2">
							<div class="flex items-start justify-between gap-2">
								<div class="flex flex-col gap-1">
									<a href="${pHref}" class="font-roboto-flex text-[16px] font-light leading-normal text-[rgb(var(--color-text,0_0_0))] hover:opacity-80">${line.name}</a>
									${variant ? `<span class="font-roboto-flex text-[14px] font-light leading-normal text-[rgb(var(--color-muted,153_153_153))]">${variant}</span>` : ""}
								</div>
								<button type="button" data-cart-remove data-id="${line.id}" class="font-roboto-flex text-[14px] font-light leading-normal text-[rgb(var(--color-muted,153_153_153))] transition-opacity hover:text-[rgb(var(--color-text,0_0_0))]" aria-label="Удалить">Удалить</button>
							</div>
							<div class="flex items-center justify-between">
								<div class="inline-flex h-9 items-center rounded-[4px] border border-[rgb(var(--color-muted,204_204_204)/0.3)]">
									<button type="button" data-cart-dec data-id="${line.id}" class="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text,0_0_0))]" aria-label="Уменьшить">−</button>
									<span class="min-w-[28px] text-center font-roboto-flex text-[14px] font-light text-[rgb(var(--color-text,0_0_0))]">${line.quantity}</span>
									<button type="button" data-cart-inc data-id="${line.id}" class="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text,0_0_0))]" aria-label="Увеличить">+</button>
								</div>
								<div class="flex items-baseline gap-2">
									<span class="font-roboto-flex text-[16px] font-light leading-normal text-[rgb(var(--color-text,0_0_0))]">${formatPrice(line.price * line.quantity)}</span>
									${
										typeof line.oldPrice === "number" && line.oldPrice > line.price
											? `<span class="font-roboto-flex text-[13px] font-light leading-normal text-[rgb(var(--color-text,0_0_0)/0.75)] line-through">${formatPrice(line.oldPrice * line.quantity)}</span>`
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
