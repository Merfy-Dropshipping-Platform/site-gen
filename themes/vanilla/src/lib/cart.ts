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

let cartUiInitialized = false;

/** Бейджи и «Добавить в корзину» без выдвижной панели — переход на `/cart`. */
export const initCartUI = () => {
	if (typeof window === "undefined" || cartUiInitialized) return;
	cartUiInitialized = true;

	const renderBadges = () => {
		const count = getCartCount();
		document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
			el.textContent = String(count);
			el.dataset.empty = count === 0 ? "true" : "false";
		});
	};

	const onClick = (event: MouseEvent) => {
		const target = event.target as HTMLElement;

		const addBtn = target.closest<HTMLButtonElement>("[data-add-to-cart]");
		if (addBtn) {
			event.preventDefault();
			addToCart({
				productId: addBtn.dataset.productId ?? "",
				name: addBtn.dataset.name ?? "",
				price: addBtn.dataset.price ?? "0",
				oldPrice: addBtn.dataset.oldPrice,
				image: addBtn.dataset.image ?? "",
				quantity: Number(addBtn.dataset.quantity ?? "1"),
				variant: {
					color: addBtn.dataset.variantColor || undefined,
					size: addBtn.dataset.variantSize || undefined,
					variantCombinationId: addBtn.dataset.variantCombinationId || undefined,
				},
			});
			return;
		}

		const inc = target.closest<HTMLButtonElement>("[data-cart-inc]");
		if (inc) {
			const id = inc.dataset.id ?? "";
			const line = getCart().find((l) => l.id === id);
			if (line) updateQuantity(id, line.quantity + 1);
			return;
		}
		const dec = target.closest<HTMLButtonElement>("[data-cart-dec]");
		if (dec) {
			const id = dec.dataset.id ?? "";
			const line = getCart().find((l) => l.id === id);
			if (line) updateQuantity(id, Math.max(1, line.quantity - 1));
			return;
		}
		const remove = target.closest<HTMLButtonElement>("[data-cart-remove]");
		if (remove) removeFromCart(remove.dataset.id ?? "");
	};

	document.addEventListener("click", onClick);
	window.addEventListener(api.events.updated, renderBadges);
	renderBadges();
};
