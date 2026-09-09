/**
 * Корзина Vanilla — обёртка над {@link createNtCart}.
 *
 * Используем ЛОКАЛЬНУЮ копию `nt-cart-vanilla` (не пакет DS): нужен
 * `variantCombinationId` в линии корзины (Phase 2, спек 098), которого нет в
 * пакетной версии. Остальное поведение идентично.
 */
import {
	createNtCart,
	type NtCartLine,
	type NtCartLineVariant,
} from "./nt-cart-vanilla";

const api = createNtCart({
	storageKey: "vanilla:cart:v1",
	eventPrefix: "vanilla:cart",
	// Само-лечение корзины из каталога: пере-резолв цен/имён/фото и выкидывание
	// удалённых товаров (reconcileNtLines) → корзина == оформлению, без стейл-снапшота.
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
export const cartEvents = api.events;

/**
 * initCartUI vanilla = делегат фабрики `nt-cart-vanilla`.
 *
 * Раньше vanilla переопределял initCartUI «без выдвижной панели» (только бейджи).
 * Теперь у vanilla ЕСТЬ drawer (VanillaCartDrawer в Layout, как у rose/bloom/…),
 * поэтому используем фабричный initCartUI: он рендерит бейджи + строки drawer
 * (в [data-cart-items]/[data-cart-empty]/[data-cart-summary]/[data-cart-total])
 * и при [data-add-to-cart] диспатчит `vanilla:cart:open` → drawer выезжает.
 *
 * Фабричный renderDrawer безопасен и БЕЗ drawer в DOM (early-return по отсутствию
 * хуков) — но drawer теперь всегда монтируется в Layout. Бейджи/страница /cart
 * (getCart/getCartTotal) работают как прежде. Делегат корзины — на document/window
 * (переживают View Transitions), поэтому Layout зовёт initCartUI ОДИН раз (как
 * rose nt-cart-rose), без повторов на astro:page-load.
 */
export const initCartUI = api.initCartUI;
