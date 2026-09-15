/**
 * Корзина Rose — ЕДИНОЕ ядро nt-cart (`packages/theme-base/runtime/nt-cart`) +
 * только rose-разметка строки дровера (WebP-превью через cartLineThumbPictureHtml).
 *
 * Вся бизнес-логика корзины (стор, addToCart, делегат кликов, бейдж) общая для
 * всех тем и живёт в общем модуле. Здесь — лишь префикс темы + per-theme дровер.
 */
import {
	createNtCart,
	type NtCartLine,
	type NtCartLineVariant,
} from "../../../../packages/theme-base/runtime/nt-cart";
import { cartLineThumbPictureHtml } from "./cart-thumb-html";

const api = createNtCart({
	storageKey: "rose:cart:v1",
	eventPrefix: "rose:cart",
	// Само-лечение: цены/наличие пере-резолвятся из актуального каталога на загрузке
	// → корзина всегда совпадает с оформлением (не «зависает» на старой цене).
	catalogUrl: "/data/products.json",
	// ЦВЕТ — только токенами схемы (жалоба владельца 15.09: строки дровера
	// красились в рантайме литералами, ни один гард сторону скрипта не видел —
	// исправление CartBody.astro на цвет строк дровера не влияло: это ДВЕ
	// разные разметки). Роли — по эталону CartBody.astro (rose): название/цена/
	// счётчик → --color-text; приглушённое (вариант) → --color-muted.
	// Плашка-плейсхолдер (#F5F5F5) и рамка счётчика (#E5E5E5) — законные
	// исключения: тот же хвост, что и в CartBody.astro, эталон их не
	// токенизирует. Сторож: pnpm test:cart-scheme (секции CartBody/CartSummary),
	// на строки дровера смотрит новый test:cart-drawer-items-scheme.
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
									<a href="${pHref}" class="font-manrope text-[16px] font-normal leading-normal text-[rgb(var(--color-text,0_0_0))] hover:opacity-80">${line.name}</a>
									${variant ? `<span class="font-manrope text-[14px] font-light leading-normal text-[rgb(var(--color-muted,153_153_153))]">${variant}</span>` : ""}
								</div>
								<button type="button" data-cart-remove data-id="${line.id}" class="font-manrope text-[14px] font-normal leading-normal text-[rgb(var(--color-muted,153_153_153))] transition-opacity hover:text-[rgb(var(--color-text,0_0_0))]" aria-label="Удалить">Удалить</button>
							</div>
							<div class="flex items-center justify-between">
								<div class="inline-flex h-9 items-center rounded-[4px] border border-[#E5E5E5]">
									<button type="button" data-cart-dec data-id="${line.id}" class="flex h-9 w-9 items-center justify-center font-manrope text-[16px] text-[rgb(var(--color-text,0_0_0))]" aria-label="Уменьшить">−</button>
									<span class="min-w-[28px] text-center font-manrope text-[14px] text-[rgb(var(--color-text,0_0_0))]">${line.quantity}</span>
									<button type="button" data-cart-inc data-id="${line.id}" class="flex h-9 w-9 items-center justify-center font-manrope text-[16px] text-[rgb(var(--color-text,0_0_0))]" aria-label="Увеличить">+</button>
								</div>
								<span class="font-manrope text-[16px] font-normal leading-normal text-[rgb(var(--color-text,0_0_0))]">${formatPrice(line.price * line.quantity)}</span>
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
export const reconcileCart = api.reconcileCart;
