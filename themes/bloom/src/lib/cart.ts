/**
 * Корзина Bloom — ЕДИНОЕ ядро nt-cart (`packages/theme-base/runtime/nt-cart`) +
 * только bloom-разметка строки дровера.
 *
 * Была локальная копия ядра (`nt-cart-bloom.ts`) с обоснованием «пакетный
 * nt-cart не имеет variantCombinationId» — оно УСТАРЕЛО ровно так же, как у
 * flux: общее ядро давно несёт variantCombinationId, плюс reconcile-самолечение
 * строк, variantImage и storefront-фолбэк, которых у копии не было (расхождение
 * копии с общим ядром на момент миграции — 319 строк).
 *
 * Здесь же жил СВОЙ `initCartUI` (200 строк) с окном «Товар добавлен в
 * корзину». Флоу владелец попросил во всех темах, поэтому и делегат, и окно
 * переехали в общий слой: механика — `runtime/cart-added-modal.ts`, разметка —
 * `primitives/CartAddedModal.astro`. Здесь не осталось ничего, кроме внешнего
 * вида строки дровера.
 *
 * storageKey/eventPrefix НЕ менялись — корзины покупателей живы.
 */
import {
	createNtCart,
	type NtCartLine,
	type NtCartLineVariant,
} from "../../../../packages/theme-base/runtime/nt-cart";
import { cartLineThumbPictureHtml } from "./cart-thumb-html";

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const api = createNtCart({
	storageKey: "bloom:cart:v1",
	eventPrefix: "bloom:cart",
	// Само-лечение корзины из каталога — как у rose (эталон): цены/наличие
	// пере-резолвятся на загрузке, поэтому корзина всегда совпадает с
	// оформлением. У локальной копии ядра этого не было вовсе.
	catalogUrl: "/data/products.json",
	// Разметка строки дровера — дословно из прежнего bloom-renderDrawer (вид
	// сохранён байт-в-байт): шрифт inter, круглый степпер, розовые акценты.
	renderDrawerItem: (line, { formatPrice, productPathPrefix }) => {
		const variant = [line.variant?.color, line.variant?.size].filter(Boolean).join(", ");
		const pHref = `${productPathPrefix}/${encodeURIComponent(line.productId)}`;
		const thumb = cartLineThumbPictureHtml(line.image, line.name);
		return `
					<li class="flex items-start gap-4" data-line-id="${escapeHtml(line.id)}">
						<a href="${pHref}" class="group block size-20 shrink-0 overflow-hidden rounded-[var(--radius-media,12px)] bg-[rgb(var(--color-surface,245_245_245))]">
							${thumb}
						</a>
						<div class="flex flex-1 flex-col gap-2">
							<div class="flex items-start justify-between gap-2">
								<div class="flex flex-col gap-1">
									<a href="${pHref}" class="font-inter text-[16px] font-light leading-normal text-[#000000] transition-opacity hover:opacity-70">${escapeHtml(line.name)}</a>
									${variant ? `<span class="font-inter text-[14px] font-light leading-normal text-[rgb(var(--color-muted,153_153_153))]">${escapeHtml(variant)}</span>` : ""}
								</div>
								<button type="button" data-cart-remove data-id="${escapeHtml(line.id)}" class="font-inter text-[14px] font-light leading-normal text-[rgb(var(--color-muted,153_153_153))] transition-colors hover:text-[#E38E9F]" aria-label="Удалить">Удалить</button>
							</div>
							<div class="flex items-center justify-between gap-3">
								<div class="inline-flex h-9 items-center rounded-full border border-[#FFD4E5] bg-white">
									<button type="button" data-cart-dec data-id="${escapeHtml(line.id)}" class="flex h-9 w-9 items-center justify-center text-[#E38E9F] transition-opacity hover:opacity-70" aria-label="Уменьшить">−</button>
									<span class="min-w-[28px] text-center font-inter text-[14px] font-light text-[#000000]">${line.quantity}</span>
									<button type="button" data-cart-inc data-id="${escapeHtml(line.id)}" class="flex h-9 w-9 items-center justify-center text-[#E38E9F] transition-opacity hover:opacity-70" aria-label="Увеличить">+</button>
								</div>
								<span class="font-inter text-[16px] font-light leading-none text-[#000000]">${formatPrice(line.price * line.quantity)}</span>
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
