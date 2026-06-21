/**
 * nt-cart — ЕДИНАЯ бизнес-логика корзины витрины для ВСЕХ тем.
 *
 * Ядро (localStorage get/save, addToCart с variantCombinationId, remove, qty,
 * count, total) + делегат кликов `initCartUI` ([data-add-to-cart] → addToCart,
 * +/−/remove строки, бейдж, открытие дровера) — полностью theme-agnostic.
 *
 * Per-theme — ТОЛЬКО разметка строки дровера (`renderDrawerItem`): темы выглядят
 * по-разному, но контракт делегата общий.
 *
 * Контракт делегата (что секции/дровер темы обязаны эмитить):
 *   [data-add-to-cart] + data-product-id / -name / -price / -old-price / -image /
 *     -quantity / -variant-color / -variant-size / -variant-combination-id
 *       — кнопка «В корзину» в любой секции
 *   [data-cart-count]                                — бейдж счётчика
 *   [data-cart-empty] [data-cart-items] [data-cart-summary] [data-cart-total]
 *       — контейнеры дровера/страницы корзины
 *   [data-cart-remove] [data-cart-inc] [data-cart-dec] (+ data-id)
 *       — управление строкой; их обязан нести renderDrawerItem темы
 *
 * Новая тема = свой renderDrawerItem + `createNtCart({prefix, renderDrawerItem})`.
 */

export interface NtCartLineVariant {
	color?: string;
	size?: string;
	/** combinationId реальной комбинации — уходит в backend cart → order_items. */
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

export interface NtAddToCartOptions {
	productId: string;
	name: string;
	price: string | number;
	oldPrice?: string | number;
	image: string;
	quantity?: number;
	variant?: NtCartLineVariant;
}

/** Хелперы для per-theme разметки строки дровера. */
export interface NtDrawerItemContext {
	/** «1 234 ₽» */
	formatPrice: (value: number) => string;
	/** Базовый путь карточки товара (для ссылки в строке дровера). */
	productPathPrefix: string;
}

export interface NtCartCreateOptions {
	/** localStorage-ключ корзины, напр. `rose:cart:v1`. */
	storageKey: string;
	/** Префикс событий: `${eventPrefix}:updated` | `:open` | `:close` | `:toggle`. */
	eventPrefix: string;
	/** Базовый путь к карточке товара в ссылках дровера (дефолт `/products`). */
	productPathPrefix?: string;
	/**
	 * Per-theme разметка `<li>` строки дровера. ОБЯЗАНА нести data-line-id и
	 * кнопки [data-cart-remove] / [data-cart-inc] / [data-cart-dec] с data-id —
	 * иначе делегат не сможет управлять строкой.
	 */
	renderDrawerItem: (line: NtCartLine, ctx: NtDrawerItemContext) => string;
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
	const { storageKey, eventPrefix, productPathPrefix = "/products", renderDrawerItem } = opts;
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
				.map((line) => renderDrawerItem(line, { formatPrice, productPathPrefix }))
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
				// Корзина «Страница» (--cart-type=page): не открывать дровер — товар просто
				// кладётся (бейдж обновится), на /cart уходим по клику на иконку. drawer
				// (дефолт) — открываем панель как раньше.
				if (
					getComputedStyle(document.documentElement)
						.getPropertyValue("--cart-type")
						.trim()
						.replace(/['"]/g, "") !== "page"
				) {
					window.dispatchEvent(new CustomEvent(evOpen));
				}
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
