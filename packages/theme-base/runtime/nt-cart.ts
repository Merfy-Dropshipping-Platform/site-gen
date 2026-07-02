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
	 * URL каталога (products.json) для само-лечения корзины: если задан, initCartUI
	 * на загрузке (и astro:page-load) пере-резолвит цены/наличие из каталога
	 * (см. reconcileNtLines). Не задан → пере-резолва нет (обратная совместимость).
	 */
	catalogUrl?: string;
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

/** Товар каталога (products.json) для пере-резолва позиций корзины. */
export interface NtCatalogProduct {
	id: string;
	name?: string;
	price?: number;
	compareAtPrice?: number | null;
	images?: string[];
	variantCombinations?: Array<{
		id: string;
		price?: number;
		compareAtPrice?: number | null;
		options?: Record<string, string>;
	}>;
}

/**
 * Чистый пере-резолв строк nt-cart из АКТУАЛЬНОГО каталога (products.json).
 * Корзина хранит снапшот (price/name/image на момент добавления) и устаревает,
 * когда мерчант меняет цену/удаляет товар → страница корзины и оформление
 * показывают разное. Пере-резолв: цена/имя/картинка → текущие; удалённый товар
 * или вариант → строка ВЫКИДЫВАЕТСЯ; мёртвый variantCombinationId → ре-матч по
 * options (Цвет/Размер). Цены nt-cart и products.json — в РУБЛЯХ (без *100).
 * Экспортируется для юнит-теста.
 */
export function reconcileNtLines(
	lines: NtCartLine[],
	products: NtCatalogProduct[],
): { lines: NtCartLine[]; changed: boolean; dropped: number } {
	if (!Array.isArray(lines) || lines.length === 0) return { lines: lines || [], changed: false, dropped: 0 };
	if (!Array.isArray(products) || products.length === 0) return { lines, changed: false, dropped: 0 };
	const byId = new Map<string, NtCatalogProduct>();
	for (const p of products) if (p && p.id != null) byId.set(String(p.id), p);
	let changed = false;
	let dropped = 0;
	const next: NtCartLine[] = [];
	for (const line of lines) {
		const p = byId.get(String(line.productId));
		if (!p) { changed = true; dropped++; continue; } // товар удалён → выкинуть
		const combos = Array.isArray(p.variantCombinations) ? p.variantCombinations : [];
		let combo: NonNullable<NtCatalogProduct["variantCombinations"]>[number] | null = null;
		if (combos.length > 0) {
			const vcId = line.variant?.variantCombinationId;
			if (vcId) combo = combos.find((c) => String(c.id) === String(vcId)) || null;
			if (!combo && (line.variant?.color || line.variant?.size)) {
				combo = combos.find((c) => {
					const o = c.options || {};
					const colorOk = !line.variant?.color || String(o["Цвет"]) === String(line.variant.color);
					const sizeOk = !line.variant?.size || String(o["Размер"]) === String(line.variant.size);
					return colorOk && sizeOk;
				}) || null;
			}
			if (!combo) { changed = true; dropped++; continue; } // вариант удалён → выкинуть
		}
		const price = combo ? Number(combo.price) : Number(p.price);
		const rawOld = combo ? combo.compareAtPrice : p.compareAtPrice;
		const oldPrice = rawOld != null && Number.isFinite(Number(rawOld)) ? Number(rawOld) : undefined;
		const name = p.name || line.name;
		const image = Array.isArray(p.images) && p.images[0] ? p.images[0] : line.image;
		const newVcId = combo ? String(combo.id) : line.variant?.variantCombinationId;
		const nl: NtCartLine = {
			...line,
			name,
			image,
			price: Number.isFinite(price) ? price : line.price,
			oldPrice,
			variant: line.variant ? { ...line.variant, variantCombinationId: newVcId } : line.variant,
		};
		if (
			nl.price !== line.price ||
			nl.oldPrice !== line.oldPrice ||
			nl.name !== line.name ||
			nl.image !== line.image ||
			nl.variant?.variantCombinationId !== line.variant?.variantCombinationId
		) {
			changed = true;
		}
		next.push(nl);
	}
	return { lines: next, changed, dropped };
}

export const createNtCart = (opts: NtCartCreateOptions) => {
	const { storageKey, eventPrefix, productPathPrefix = "/products", catalogUrl, renderDrawerItem } = opts;
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

	// Само-лечение корзины из каталога. Кэш на сессию (одна сетевая загрузка);
	// ошибка/пустой → [], тогда reconcile НЕ трогает корзину (оффлайн-защита).
	let catalogPromise: Promise<NtCatalogProduct[]> | null = null;
	const loadCatalog = (url: string): Promise<NtCatalogProduct[]> => {
		if (typeof window === "undefined") return Promise.resolve([]);
		if (!catalogPromise) {
			catalogPromise = fetch(url, { cache: "default" })
				.then((r) => (r.ok ? r.json() : null))
				.then((j) => {
					const arr = Array.isArray(j) ? j : (j && (j.products || j.data)) || [];
					return Array.isArray(arr) ? (arr as NtCatalogProduct[]) : [];
				})
				.catch(() => []);
		}
		return catalogPromise;
	};

	/**
	 * Пере-резолвить корзину (rose:cart:v1) из products.json и, если что-то
	 * поменялось (цена/имя/картинка/выкинутый товар), сохранить + отправить
	 * `${eventPrefix}:updated` → бейдж/дровер/страница корзины перерисуются
	 * текущими данными. Так корзина всегда = оформлению.
	 */
	const reconcileCart = async (url = catalogUrl): Promise<void> => {
		if (typeof window === "undefined" || !url) return;
		const lines = getCart();
		if (lines.length === 0) return;
		const products = await loadCatalog(url);
		const result = reconcileNtLines(lines, products);
		if (result.changed) saveCart(result.lines);
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
		// Залочено [1..N]: количество НЕ уходит ниже 1 — «−» при 1 не удаляет товар
		// и не чистит корзину. Удаление — только через «Удалить» (removeFromCart).
		line.quantity = Math.max(1, quantity);
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
				// In-button фидбек («показывайся прямо в кнопке»): кнопка кратко
				// показывает «Добавлено ✓», затем возвращает исходный текст. Работает в
				// любом режиме корзины и на всех add-кнопках (Product, PopularProducts, каталог).
				if (addBtn.dataset.ntFeedback !== "1") {
					const originalHtml = addBtn.innerHTML;
					addBtn.dataset.ntFeedback = "1";
					addBtn.innerHTML =
						'<span style="display:inline-flex;align-items:center;gap:8px;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Добавлено</span>';
					window.setTimeout(() => {
						addBtn.innerHTML = originalHtml;
						addBtn.removeAttribute("data-nt-feedback");
					}, 1600);
				}
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
		// View Transitions: модульный init-скрипт НЕ перезапускается после client-side
		// навигации, а DOM шапки/дровера на новой странице — другой. Без перерисовки на
		// astro:page-load бейдж корзины сбрасывается к SSR-дефолту (0 → data-empty="true",
		// скрыт) на КАЖДОЙ не-перезагруженной странице, и счётчик «живёт» лишь на той
		// странице, что грузилась полностью. Бейдж избранного переживает навигацию именно
		// потому, что initWishlistUI слушает astro:page-load — зеркалим это здесь.
		document.addEventListener("astro:page-load", () => {
			renderBadges();
			renderDrawer();
			// Само-лечение при client-side навигации (VT не перезапускает init-модуль).
			if (catalogUrl) void reconcileCart(catalogUrl);
		});

		renderBadges();
		renderDrawer();
		// Само-лечение цен/наличия из каталога → корзина всегда актуальна (= оформлению).
		if (catalogUrl) void reconcileCart(catalogUrl);
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
		reconcileCart,
		events: { updated: evUpdated, open: evOpen, close: `${eventPrefix}:close`, toggle: `${eventPrefix}:toggle` },
	};
};
