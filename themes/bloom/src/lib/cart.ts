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
	// Разметка строки дровера (вид bloom сохранён: шрифт inter, круглый степпер,
	// розовые акценты) — форма НЕ меняется, только краска.
	//
	// ЦВЕТ — только токенами схемы (жалоба владельца 15.09: «схема не
	// применяется в корзине bloom» — CartBody.astro починили, а строки ДРОВЕРА
	// рисует ЭТОТ файл, отдельная разметка, гард до него не доставал). Роли —
	// по эталону CartBody.astro (bloom) + смысл «розовых акцентов» дровера:
	// название/цена/счётчик → --color-text; приглушённое (вариант) →
	// --color-muted; розовый акцент (hover «Удалить», иконки степпера, рамка
	// степпера) → --color-accent (bloom: 227 142 159 = байт-в-байт #E38E9F,
	// бывшая рамка #FFD4E5 — тот же акцент на 30% альфы, светлее); белая
	// подложка степпера → --color-bg (секция и дровер делят один фон).
	// Плашка-плейсхолдер уже была токеном (--color-surface) — не трогаем.
	// Сторож: pnpm test:cart-drawer-items-scheme.
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
									<a href="${pHref}" class="font-inter text-[16px] font-light leading-normal text-[rgb(var(--color-text,0_0_0))] transition-opacity hover:opacity-70">${escapeHtml(line.name)}</a>
									${variant ? `<span class="font-inter text-[14px] font-light leading-normal text-[rgb(var(--color-muted,153_153_153))]">${escapeHtml(variant)}</span>` : ""}
								</div>
								<button type="button" data-cart-remove data-id="${escapeHtml(line.id)}" class="font-inter text-[14px] font-light leading-normal text-[rgb(var(--color-muted,153_153_153))] transition-colors hover:text-[rgb(var(--color-accent,227_142_159))]" aria-label="Удалить">Удалить</button>
							</div>
							<div class="flex items-center justify-between gap-3">
								<div class="inline-flex h-9 items-center rounded-full border border-[rgb(var(--color-accent,227_142_159)/0.3)] bg-[rgb(var(--color-bg,255_255_255))]">
									<button type="button" data-cart-dec data-id="${escapeHtml(line.id)}" class="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-accent,227_142_159))] transition-opacity hover:opacity-70" aria-label="Уменьшить">−</button>
									<span class="min-w-[28px] text-center font-inter text-[14px] font-light text-[rgb(var(--color-text,0_0_0))]">${line.quantity}</span>
									<button type="button" data-cart-inc data-id="${escapeHtml(line.id)}" class="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-accent,227_142_159))] transition-opacity hover:opacity-70" aria-label="Увеличить">+</button>
								</div>
								<div class="flex items-baseline gap-2">
									<span class="font-inter text-[16px] font-light leading-none text-[rgb(var(--color-text,0_0_0))]">${formatPrice(line.price * line.quantity)}</span>
									${
										typeof line.oldPrice === "number" && line.oldPrice > line.price
											? `<span class="font-inter text-[13px] font-light leading-none text-[rgb(var(--color-muted,153_153_153))] line-through">${formatPrice(line.oldPrice * line.quantity)}</span>`
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
