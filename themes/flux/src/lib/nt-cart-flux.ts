/**
 * Локальная копия DS `nt-cart.ts` с двумя отличиями от пакета:
 *   1. превью строки корзины через WebP (`cartLineThumbPictureHtml`) вместо голого PNG;
 *   2. `variantCombinationId` в variant-линии → уходит в backend cart → order_items
 *      (Phase 2 спека 098). Пакетный `nt-cart.ts` этого поля не знает.
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
	/**
	 * URL каталога (products.json) для само-лечения корзины: если задан, initCartUI
	 * на загрузке пере-резолвит цены/наличие/фото из каталога (см. reconcileNtLines).
	 * Не задан → пере-резолва нет (обратная совместимость). flux: single-source =
	 * backend, но локальный снапшот линии (price/name/image) устаревает так же, как
	 * у rose — reconcile выравнивает дисплей корзины с оформлением. ДОБАВОЧНЫЙ слой,
	 * не меняет поток add/display/checkout.
	 */
	catalogUrl?: string;
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

/** Товар каталога (products.json) для пере-резолва позиций корзины. */
export interface NtCatalogProduct {
	id: string;
	name?: string;
	price?: number;
	compareAtPrice?: number | null;
	images?: string[];
	/** Опции с фото варианта (Цвет=Чёрный→своё фото). Фото варианта живёт ЗДЕСЬ,
	 * не в product.images[0] (= первый вариант) и не в combination. */
	variantGroups?: Array<{
		name?: string;
		options?: Array<{ value?: string; images?: string[] }>;
	}>;
	variantCombinations?: Array<{
		id: string;
		price?: number;
		compareAtPrice?: number | null;
		options?: Record<string, string>;
	}>;
}

/**
 * Фото выбранного варианта из каталога по color/size строки. null если у выбранной
 * опции своего фото нет (тогда оставляем фото позиции / дефолт — НЕ первый вариант).
 * Порт из общего ядра nt-cart (packages/theme-base/runtime). Экспортируется для теста.
 */
export function variantImageFromNtCatalog(
	product: NtCatalogProduct | undefined,
	variant?: { color?: string; size?: string } | null,
): string | null {
	if (!product || !variant) return null;
	const groups = Array.isArray(product.variantGroups) ? product.variantGroups : [];
	const selected = [variant.color, variant.size].filter(Boolean).map((v) => String(v));
	for (const g of groups) {
		const opts = Array.isArray(g.options) ? g.options : [];
		for (const o of opts) {
			if (o.value != null && selected.indexOf(String(o.value)) !== -1 && Array.isArray(o.images) && o.images[0]) {
				return o.images[0];
			}
		}
	}
	return null;
}

/**
 * Чистый пере-резолв строк nt-cart из АКТУАЛЬНОГО каталога (products.json).
 * Корзина хранит снапшот (price/name/image на момент добавления) и устаревает,
 * когда мерчант меняет цену/удаляет товар. Пере-резолв: цена/имя/картинка →
 * текущие; удалённый товар или вариант → строка ВЫКИДЫВАЕТСЯ; мёртвый
 * variantCombinationId → ре-матч по options (Цвет/Размер). Цены nt-cart и
 * products.json — в РУБЛЯХ (без *100, см. project_price_convention_rubles).
 * Порт из общего ядра nt-cart. Экспортируется для юнит-теста.
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
		// Фото выбранного варианта (Цвет) → иначе фото позиции (add-time, верное) →
		// лишь в крайнем случае первое фото товара. НЕ клобберим на p.images[0]
		// (= первый вариант) — баг «встаёт фото другого варианта после подгрузки».
		const variantImg = variantImageFromNtCatalog(p, line.variant);
		const image = variantImg || line.image || (Array.isArray(p.images) && p.images[0] ? p.images[0] : "");
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
	const { storageKey, eventPrefix, productPathPrefix = "/products", catalogUrl } = opts;
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
	// Preview-фолбэк: в конструктор-превью (iframe на gateway) /data/products.json
	// = 404. Берём каталог из storefront-data (тот же источник, что у продукт-блоков
	// превью — Popular/FluxProductDetail) → reconcile лечит стейл-корзину и в превью.
	const fetchStorefrontDataProducts = (): Promise<NtCatalogProduct[]> => {
		const w = window as unknown as {
			__MERFY_SITE_ID__?: string;
			__MERFY_CONFIG__?: { shopId?: string };
		};
		const siteId = w.__MERFY_SITE_ID__ || w.__MERFY_CONFIG__?.shopId;
		if (!siteId) return Promise.resolve([]);
		return fetch(`/api/sites/${encodeURIComponent(siteId)}/storefront-data`)
			.then((r) => (r.ok ? r.json() : null))
			.then((p) => {
				const prods = (p as { products?: unknown } | null)?.products;
				return Array.isArray(prods) ? (prods as NtCatalogProduct[]) : [];
			})
			.catch(() => []);
	};
	const loadCatalog = (url: string): Promise<NtCatalogProduct[]> => {
		if (typeof window === "undefined") return Promise.resolve([]);
		if (!catalogPromise) {
			catalogPromise = fetch(url, { cache: "default" })
				.then((r) => (r.ok ? r.json() : null))
				.then((j) => {
					const arr = Array.isArray(j) ? j : (j && (j.products || j.data)) || [];
					return Array.isArray(arr) && arr.length
						? (arr as NtCatalogProduct[])
						: fetchStorefrontDataProducts();
				})
				.catch(() => fetchStorefrontDataProducts());
		}
		return catalogPromise;
	};

	/**
	 * Пере-резолвить корзину (flux:cart:v1) из products.json и, если что-то
	 * поменялось (цена/имя/картинка/выкинутый товар), сохранить + отправить
	 * `${eventPrefix}:updated` → бейдж/дровер/страница корзины перерисуются
	 * текущими данными. Так корзина всегда = оформлению. ДОБАВОЧНЫЙ слой поверх
	 * существующего потока — при недоступном каталоге корзина НЕ трогается.
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
		// Удаление — только через removeFromCart (явная кнопка «Удалить»);
		// «−» при qty=1 оставляет 1, не удаляет товар.
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
									<a href="${pHref}" class="font-roboto-flex text-[16px] font-light leading-normal text-[#000000] hover:opacity-80">${line.name}</a>
									${variant ? `<span class="font-roboto-flex text-[14px] font-light leading-normal text-[#999999]">${variant}</span>` : ""}
								</div>
								<button type="button" data-cart-remove data-id="${line.id}" class="font-roboto-flex text-[14px] font-light leading-normal text-[#999999] transition-opacity hover:text-[#000000]" aria-label="Удалить">Удалить</button>
							</div>
							<div class="flex items-center justify-between">
								<div class="inline-flex h-9 items-center rounded-[4px] border border-[#F5F5F5]">
									<button type="button" data-cart-dec data-id="${line.id}" class="flex h-9 w-9 items-center justify-center" aria-label="Уменьшить">−</button>
									<span class="min-w-[28px] text-center font-roboto-flex text-[14px] font-light">${line.quantity}</span>
									<button type="button" data-cart-inc data-id="${line.id}" class="flex h-9 w-9 items-center justify-center" aria-label="Увеличить">+</button>
								</div>
								<span class="font-roboto-flex text-[16px] font-light leading-normal text-[#000000]">${formatPrice(line.price * line.quantity)}</span>
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
				// Краткий фидбек «Добавлено ✓» в кнопке (паттерн общего nt-cart 07696c0e).
				if (!addBtn.dataset.ntFeedback) {
					addBtn.dataset.ntFeedback = "1";
					const originalHtml = addBtn.innerHTML;
					addBtn.innerHTML =
						'<span style="display:inline-flex;align-items:center;gap:8px;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Добавлено</span>';
					window.setTimeout(() => {
						addBtn.innerHTML = originalHtml;
						delete addBtn.dataset.ntFeedback;
					}, 1600);
				}
				if (getComputedStyle(document.documentElement).getPropertyValue("--cart-type").trim().replace(/['"]/g, "") !== "page") window.dispatchEvent(new CustomEvent(evOpen)); // page: не открывать drawer при добавлении
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
		// Само-лечение цен/наличия/фото из каталога → корзина всегда актуальна
		// (= оформлению). flux Layout БЕЗ ViewTransitions (полная перезагрузка на
		// навигации), поэтому НЕ вешаем astro:page-load-хук как rose — init-модуль
		// перезапускается на каждой странице, и этого прохода достаточно.
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
