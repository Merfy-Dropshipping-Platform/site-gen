/**
 * Корзина Rose — локальная реализация {@link createNtCart} (`nt-cart-rose.ts`),
 * превью строк с WebP в drawer и совместимость API с DS.
 */
import {
	createNtCart,
	type NtCartLine,
	type NtCartLineVariant,
} from "./nt-cart-rose";

const api = createNtCart({
	storageKey: "rose:cart:v1",
	eventPrefix: "rose:cart",
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
