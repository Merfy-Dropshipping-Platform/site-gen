/**
 * Локальная копия DS `nt-cart.ts` с превью через WebP (`cartLineThumbPictureHtml`)
 * и поддержкой `variantCombinationId` (Phase 2, спек 098).
 *
 * Пакет `@merfy-dropshipping-platform/design-systems-theme` отдаёт drawer с голым
 * PNG и не несёт `variantCombinationId` в линии корзины — поэтому держим
 * локальную реализацию (как в rose `nt-cart-rose.ts`).
 */

import { cartLineThumbPictureHtml } from "./cart-thumb-html";

export interface NtCartLineVariant {
	color?: string;
	size?: string;
	/** combinationId реальной комбинации — уходит в backend cart → order_items (Phase 2). */
	variantCombinationId?: string;
}

export interface NtCartLine {
	id: string;
	productId: string;
	name: string;
	price: number;
	oldPrice?: number;
	image: string;
	quantity: number;
	variant?: NtCartLineVariant;
}

export interface NtCartCreateOptions {
	storageKey: string;
	eventPrefix: string;
	productPathPrefix?: string;
}

export interface NtAddToCartOptions {
	productId: string;
	name: string;
	price: string | number;
	oldPrice?: string | number;
	image: string;
	quantity?: number;
	variant?: NtCartLineVariant;
}

const parsePrice = (raw: string): number => {
	const digits = raw.replace(/[^\d]/g, "");
	return digits ? Number(digits) : 0;
};

const formatPrice = (value: number): string => `${value.toLocaleString("ru-RU")} ₽`;

const safeParse = (raw: string | null): NtCartLine[] => {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

const makeLineId = (productId: string, variant?: NtCartLineVariant) => {
	const parts = [productId, variant?.variantCombinationId, variant?.color, variant?.size].filter(Boolean);
	return parts.join("|");
};

export const createNtCart = (opts: NtCartCreateOptions) => {
	const { storageKey, eventPrefix, productPathPrefix = "/products" } = opts;
	const evUpdated = `${eventPrefix}:updated`;
	const evOpen = `${eventPrefix}:open`;

	const getCart = (): NtCartLine[] => {
		if (typeof window === "undefined") return [];
		return safeParse(window.localStorage.getItem(storageKey));
	};

	const saveCart = (lines: NtCartLine[]) => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(storageKey, JSON.stringify(lines));
		window.dispatchEvent(new CustomEvent(evUpdated, { detail: lines }));
	};

	const addToCart = (options: NtAddToCartOptions) => {
		const lines = getCart();
		const id = makeLineId(options.productId, options.variant);
		const quantity = Math.max(1, options.quantity ?? 1);
		const price = typeof options.price === "string" ? parsePrice(options.price) : options.price;
		const oldPrice =
			options.oldPrice !== undefined
				? typeof options.oldPrice === "string"
					? parsePrice(options.oldPrice)
					: options.oldPrice
				: undefined;

		const existing = lines.find((line) => line.id === id);
		if (existing) {
			existing.quantity += quantity;
		} else {
			lines.push({
				id,
				productId: options.productId,
				name: options.name,
				price,
				oldPrice,
				image: options.image,
				quantity,
				variant: options.variant,
			});
		}
		saveCart(lines);
	};

	const updateQuantity = (id: string, quantity: number) => {
		const lines = getCart();
		const line = lines.find((l) => l.id === id);
		if (!line) return;
		if (quantity <= 0) {
			saveCart(lines.filter((l) => l.id !== id));
			return;
		}
		line.quantity = quantity;
		saveCart(lines);
	};

	const removeFromCart = (id: string) => {
		saveCart(getCart().filter((line) => line.id !== id));
	};

	const clearCart = () => saveCart([]);

	const getCartCount = (lines: NtCartLine[] = getCart()) =>
		lines.reduce((sum, line) => sum + line.quantity, 0);

	const getCartTotal = (lines: NtCartLine[] = getCart()) =>
		lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

	const formatCartPrice = formatPrice;

	const initCartUI = () => {
		if (typeof window === "undefined") return;

		const renderBadges = () => {
			const count = getCartCount();
			document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
				el.textContent = String(count);
				el.dataset.empty = count === 0 ? "true" : "false";
			});
		};

		const renderDrawer = () => {
			const lines = getCart();
			const empty = document.querySelector<HTMLElement>("[data-cart-empty]");
			const items = document.querySelector<HTMLElement>("[data-cart-items]");
			const summary = document.querySelector<HTMLElement>("[data-cart-summary]");
			const total = document.querySelector<HTMLElement>("[data-cart-total]");
			if (!empty || !items || !summary || !total) return;

			if (lines.length === 0) {
				empty.classList.remove("hidden");
				items.classList.add("hidden");
				summary.classList.add("hidden");
				items.innerHTML = "";
				items.classList.remove("flex");
				summary.classList.remove("flex");
				return;
			}

			empty.classList.add("hidden");
			items.classList.remove("hidden");
			summary.classList.remove("hidden");
			items.classList.add("flex");
			summary.classList.add("flex");

			items.innerHTML = lines
				.map((line) => {
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
									<a href="${pHref}" class="font-manrope text-[16px] font-normal leading-normal text-[#000000] hover:opacity-80">${line.name}</a>
									${variant ? `<span class="font-manrope text-[14px] font-light leading-normal text-[#999999]">${variant}</span>` : ""}
								</div>
								<button type="button" data-cart-remove data-id="${line.id}" class="font-manrope text-[14px] font-normal leading-normal text-[#999999] transition-opacity hover:text-[#000000]" aria-label="Удалить">Удалить</button>
							</div>
							<div class="flex items-center justify-between">
								<div class="inline-flex h-9 items-center rounded-[4px] border border-[#F5F5F5]">
									<button type="button" data-cart-dec data-id="${line.id}" class="flex h-9 w-9 items-center justify-center" aria-label="Уменьшить">−</button>
									<span class="min-w-[28px] text-center font-manrope text-[14px]">${line.quantity}</span>
									<button type="button" data-cart-inc data-id="${line.id}" class="flex h-9 w-9 items-center justify-center" aria-label="Увеличить">+</button>
								</div>
								<span class="font-manrope text-[16px] font-normal leading-normal text-[#000000]">${formatPrice(line.price * line.quantity)}</span>
							</div>
						</div>
					</li>
				`;
				})
				.join("");

			total.textContent = formatPrice(getCartTotal(lines));
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
				window.dispatchEvent(new CustomEvent(evOpen));
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
				if (line) updateQuantity(id, line.quantity - 1);
				return;
			}
			const remove = target.closest<HTMLButtonElement>("[data-cart-remove]");
			if (remove) removeFromCart(remove.dataset.id ?? "");
		};

		document.addEventListener("click", onClick);
		window.addEventListener(evUpdated, () => {
			renderBadges();
			renderDrawer();
		});

		renderBadges();
		renderDrawer();
	};

	return {
		getCart,
		addToCart,
		updateQuantity,
		removeFromCart,
		clearCart,
		getCartCount,
		getCartTotal,
		formatCartPrice,
		initCartUI,
		events: { updated: evUpdated, open: evOpen, close: `${eventPrefix}:close`, toggle: `${eventPrefix}:toggle` },
	};
};
