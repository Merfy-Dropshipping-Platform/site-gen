/**
 * Корзина Luna — обёртка над {@link createNtCart} из New-Themes DS.
 */
import {
	createNtCart,
	type NtCartLine,
	type NtCartLineVariant,
} from "@merfy-dropshipping-platform/design-systems-theme/lib/nt-cart";

const api = createNtCart({
	storageKey: "luna:cart:v1",
	eventPrefix: "luna:cart",
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
