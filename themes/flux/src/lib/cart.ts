/**
 * Корзина Flux — обёртка над локальной копией {@link createNtCart}
 * (`nt-cart-flux.ts`): WebP-превью в drawer + `variantCombinationId` в линии
 * (нужен для backend cart → order_items, спек 098). Пакетный DS `nt-cart`
 * этого поля не имеет, поэтому используем локальную копию.
 */
import {
	createNtCart,
	type NtCartLine,
	type NtCartLineVariant,
} from "./nt-cart-flux";

const api = createNtCart({
	storageKey: "flux:cart:v1",
	eventPrefix: "flux:cart",
	// Само-лечение: цены/наличие/фото варианта пере-резолвятся из актуального
	// каталога на загрузке → корзина всегда совпадает с оформлением (не «зависает»
	// на старой цене/удалённом товаре). Тот же источник, что у продукт-блоков flux.
	catalogUrl: "/data/products.json",
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
