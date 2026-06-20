/**
 * Клиентская гидрация реальных товаров (Option B, спек 098).
 *
 * Темы rose собираются в `dist/theme-live/rose` на деплое СЕРВИСА — тогда
 * per-site `products.json` ещё нет, поэтому `getProducts()` (products-source.ts)
 * запекает demo-фолбэк (`catalogProducts`, bag-1…8). На публикации конкретного
 * сайта build.service инжектит реальный `/data/products.json`, но статичный SSG
 * HTML уже demo. Этот модуль на рантайме читает `/data/products.json` и
 * подменяет demo реальными товарами (каталог + главная + PDP).
 *
 * Чистый фолбэк: если файла нет / он пуст / это demo-сборка — ничего не
 * трогаем, остаётся SSG-разметка.
 */

export interface RealProduct {
	id: string;
	name: string;
	/** Число (2800) на реальных сборках или уже отформатированная строка ("5 990 ₽") в demo. */
	price: number | string;
	slug?: string;
	images?: string[];
	oldPrice?: number | string | null;
	compareAtPrice?: number | string | null;
	description?: string;
	hasVariants?: boolean;
	variantCombinations?: VariantCombination[];
}

/** Конкретная покупаемая комбинация вариантов (из products.json). */
export interface VariantCombination {
	id: string; // variantCombinationId — уходит в backend cart → order_items
	title?: string;
	price: number | string;
	compareAtPrice?: number | string | null;
	available?: boolean;
	quantity?: number;
	/** Группа → значение, напр. { "Цвет": "Белый", "Размер": "S" }. */
	options: Record<string, string>;
}

/** Группа вариантов, выведенная из комбинаций (variantGroups в products.json часто null). */
export interface VariantGroup {
	name: string; // "Цвет"
	values: string[]; // ["Белый", "Чёрный"] — уникальные, в порядке появления
}

const PRODUCTS_URL = "/data/products.json";
/**
 * Плейсхолдер-URL для мест, где нужен именно src (cart-thumb data-image,
 * Gallery cover, PDP) когда у реального товара нет фото. Демо-картинка ТЕМЫ,
 * а не дженерик-фигма из /placeholders/ (тестер M$rkul: «не фигма-заглушки, а
 * медиа темы»). /images/Товар_1.webp гарантированно едет в rose-дист —
 * карточки товаров его уже используют.
 */
const PLACEHOLDER_IMAGE = "/images/Товар_1.webp";

/** Кэш на страницу: undefined — не загружали, null — demo/пусто/ошибка. */
let cached: RealProduct[] | null | undefined;

/**
 * Грузит реальные товары. Возвращает null, когда товаров нет (demo-сборка) —
 * вызывающий код в этом случае оставляет SSG-разметку нетронутой.
 */
export async function loadRealProducts(): Promise<RealProduct[] | null> {
	if (cached !== undefined) return cached;

	// 1. Статический per-site файл — опубликованный сайт (build.service инжектит).
	try {
		const res = await fetch(PRODUCTS_URL);
		if (res.ok) {
			const data: unknown = await res.json();
			if (Array.isArray(data) && data.length > 0) {
				cached = data as RealProduct[];
				return cached;
			}
		}
	} catch {
		/* файла нет — пробуем preview-фолбэк ниже */
	}

	// 2. Preview-фолбэк: конструктор-превью отдаёт built-theme БЕЗ products.json
	// (это build-артефакт). preview.controller инжектит window.__MERFY_SITE_ID__ —
	// берём товары из того же storefront-data, которым блоки конструктора грузят
	// товары → паритет live ↔ preview.
	const siteId =
		typeof window !== "undefined"
			? (window as unknown as { __MERFY_SITE_ID__?: string }).__MERFY_SITE_ID__
			: undefined;
	if (siteId) {
		try {
			const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/storefront-data`);
			if (res.ok) {
				const payload = (await res.json()) as { products?: unknown };
				const products = payload?.products;
				if (Array.isArray(products) && products.length > 0) {
					cached = products as RealProduct[];
					return cached;
				}
			}
		} catch {
			/* preview-фолбэк не удался */
		}
	}

	cached = null;
	return cached;
}

/** Коллекция магазина (из /data/collections.json или storefront-data). */
export interface RealCollection {
	id: string;
	name?: string;
	slug?: string;
	image?: string | null;
	images?: string[];
	productIds?: string[];
}

const COLLECTIONS_URL = "/data/collections.json";
let cachedCollections: RealCollection[] | null | undefined;

/**
 * Грузит коллекции магазина тем же двухступенчатым путём, что loadRealProducts:
 * live — статический per-site `/data/collections.json` (инжектит build.service),
 * превью — storefront-data по window.__MERFY_SITE_ID__. null — данных нет,
 * вызывающий код оставляет SSG-разметку.
 */
export async function loadRealCollections(): Promise<RealCollection[] | null> {
	if (cachedCollections !== undefined) return cachedCollections;
	try {
		const res = await fetch(COLLECTIONS_URL);
		if (res.ok) {
			const data: unknown = await res.json();
			if (Array.isArray(data) && data.length > 0) {
				cachedCollections = data as RealCollection[];
				return cachedCollections;
			}
		}
	} catch {
		/* файла нет — preview-фолбэк ниже */
	}
	const siteId =
		typeof window !== "undefined"
			? (window as unknown as { __MERFY_SITE_ID__?: string }).__MERFY_SITE_ID__
			: undefined;
	if (siteId) {
		try {
			const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/storefront-data`);
			if (res.ok) {
				const payload = (await res.json()) as { collections?: unknown };
				const collections = payload?.collections;
				if (Array.isArray(collections) && collections.length > 0) {
					cachedCollections = collections as RealCollection[];
					return cachedCollections;
				}
			}
		} catch {
			/* preview-фолбэк не удался */
		}
	}
	cachedCollections = null;
	return cachedCollections;
}

/** Найти коллекцию по id/slug/имени (пикер пишет id, ссылки несут slug). */
export function findCollection(
	collections: RealCollection[] | null,
	ref: string | null | undefined,
): RealCollection | null {
	if (!ref || !collections) return null;
	return (
		collections.find((c) => c && (c.id === ref || c.slug === ref || c.name === ref)) ?? null
	);
}

/**
 * Фильтр товаров по коллекции: сперва по productIds коллекции, затем по
 * membership товара (p.collections). Пустой результат → исходный список
 * (паритет с theme-base: «выбрал пустую коллекцию» не делает блок пустым).
 */
export function filterByCollection(
	products: RealProduct[],
	collections: RealCollection[] | null,
	ref: string | null | undefined,
): RealProduct[] {
	if (!ref) return products;
	const col = findCollection(collections, ref);
	let filtered: RealProduct[] = [];
	if (col && Array.isArray(col.productIds) && col.productIds.length > 0) {
		const ids = new Set(col.productIds);
		filtered = products.filter((p) => p.id && ids.has(p.id));
	}
	if (filtered.length === 0) {
		filtered = products.filter((p) => {
			const memb = (p as unknown as { collections?: Array<{ id?: string; slug?: string }> }).collections;
			return (
				Array.isArray(memb) &&
				memb.some((m) => m && (m.id === ref || m.slug === ref || (col?.slug && m.slug === col.slug)))
			);
		});
	}
	return filtered.length > 0 ? filtered : products;
}

/**
 * Строгий резолв товаров выбранной коллекции. В отличие от filterByCollection
 * НЕ откатывается на весь каталог: пустой результат = «коллекция пуста / не
 * найдена», и вызывающий трактует это как «оставить моки» (Shopify-модель —
 * без явного выбора секция не подтягивает весь магазин).
 */
export function resolveCollectionProducts(
	products: RealProduct[],
	collections: RealCollection[] | null,
	ref: string | null | undefined,
): RealProduct[] {
	if (!ref) return [];
	const col = findCollection(collections, ref);
	if (col && Array.isArray(col.productIds) && col.productIds.length > 0) {
		const ids = new Set(col.productIds);
		const byIds = products.filter((p) => p.id && ids.has(p.id));
		if (byIds.length > 0) return byIds;
	}
	return products.filter((p) => {
		const memb = (p as unknown as { collections?: Array<{ id?: string; slug?: string }> }).collections;
		return (
			Array.isArray(memb) &&
			memb.some((m) => m && (m.id === ref || m.slug === ref || (col?.slug && m.slug === col.slug)))
		);
	});
}

/** Число → "2 800 ₽". Готовую строку возвращает как есть. Пусто → "". */
export function formatPrice(value: number | string | null | undefined): string {
	if (value === null || value === undefined || value === "") return "";
	if (typeof value === "string") return value;
	return `${value.toLocaleString("ru-RU")} ₽`;
}

/** Ссылка на PDP реального товара. Реальные товары не имеют статических
 * `/products/{id}` страниц (только demo bag-N), поэтому единая страница
 * `/product?id=` с клиентским рендером. */
export function productHref(p: RealProduct): string {
	return `/product?id=${encodeURIComponent(p.id)}`;
}

/** Сырой URL первой картинки товара или "" (товар без фото). */
export function productImageRaw(p: RealProduct): string {
	return (Array.isArray(p.images) && typeof p.images[0] === "string" && p.images[0]) || "";
}

export function productImage(p: RealProduct): string {
	return productImageRaw(p) || PLACEHOLDER_IMAGE;
}

/** Экранирование для вставки в HTML-разметку (имена/описания товаров). */
export function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Surface-плейсхолдер медиа карточки (товар без фото / битый URL): фон
 * --color-surface + muted-иконка фото. Цвета ТОЛЬКО через токены; inline
 * style, т.к. src/lib не сканируется Tailwind (@source темы) — произвольные
 * bg-/text-утилиты отсюда в CSS не попали бы. Layout-классы (absolute,
 * inset-0, flex, items-center, justify-center, size-10) уже генерятся из
 * src/components/**. Разметка зеркалит SSR-ветку RoseProductCard.astro.
 */
const CARD_MEDIA_FALLBACK_HTML =
	'<div class="absolute inset-0 flex items-center justify-center" style="background:rgb(var(--color-surface,245 245 245))" aria-hidden="true">' +
	'<svg class="size-10" style="color:rgb(var(--color-muted,153 153 153))" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
	'<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>' +
	"</svg></div>";

/**
 * onerror-фоллбек: битая картинка заменяет себя плейсхолдером. Кавычки
 * разметки → &quot;, чтобы не порвать onerror-атрибут; браузер декодирует
 * entities до выполнения JS (одинарных кавычек/бэкслэшей в разметке нет).
 */
const CARD_IMG_ONERROR_ATTR = ` onerror="this.onerror=null;this.outerHTML='${CARD_MEDIA_FALLBACK_HTML.replace(/"/g, "&quot;")}'"`;

/**
 * Разметка карточки товара — зеркалит `RoseProductCard.astro` (article →
 * картинка-ссылка + name + price). Плоский `<img>` вместо `<RosePicture>`
 * (визуально идентично; webp-конвейер для MinIO-картинок не применяется).
 * Товар без фото → surface-плейсхолдер вместо <img>; битый URL → onerror.
 */
/** Outline heart (rose geometry) — fallback пока wishlist-глобал не готов. */
const WISHLIST_OUTLINE_SVG =
	'<svg viewBox="0 0 17.4 15.4" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">' +
	'<path d="M7.428 14.2615C5.172 12.5239 0.7 8.55212 0.7 4.97729C0.7 2.61547 2.384 0.7 4.7 0.7C5.9 0.7 7.1 1.11175 8.7 2.75876C10.3 1.11175 11.5 0.7 12.7 0.7C15.016 0.7 16.7 2.61547 16.7 4.97729C16.7 8.5513 12.228 12.5239 9.972 14.2615C9.212 14.8462 8.188 14.8462 7.428 14.2615Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
	"</svg>";

/**
 * Wishlist toggle heart overlay для карточки листинга — зеркалит wishlist.astro.
 * Начальное состояние красится сразу из window.__roseWishlist (гидрация идёт
 * после load, отдельный renderAll не нужен); клик и перекраска всех сердец —
 * глобальный делегат initWishlistUI (wishlist.ts). SSR-гард на window.
 */
function wishlistHeartHtml(id: string): string {
	const w =
		typeof window !== "undefined"
			? (window as unknown as {
					__roseWishlist?: { has?(x: string): boolean; heartSvg?(f: boolean): string };
			  }).__roseWishlist
			: undefined;
	const fav = !!w?.has?.(id);
	const inner = w?.heartSvg ? w.heartSvg(fav) : WISHLIST_OUTLINE_SVG;
	return (
		`<button type="button" data-wishlist-toggle data-product-id="${escapeHtml(id)}" aria-pressed="${fav}" aria-label="В избранное" ` +
		'class="absolute right-3 top-3 z-20 flex size-9 items-center justify-center rounded-full bg-white/90 text-[#000000] shadow-[0_2px_8px_rgba(0,0,0,0.10)] backdrop-blur-sm transition-opacity hover:opacity-80">' +
		`<span data-wishlist-icon class="block size-[18px]">${inner}</span></button>`
	);
}

export function renderCardHtml(p: RealProduct): string {
	const href = escapeHtml(productHref(p));
	const name = escapeHtml(p.name);
	const rawImage = productImageRaw(p);
	const media = rawImage
		? `<img src="${escapeHtml(rawImage)}" alt="${name}" width="318" height="444" loading="eager" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"${CARD_IMG_ONERROR_ATTR} />`
		: CARD_MEDIA_FALLBACK_HTML;
	const price = escapeHtml(formatPrice(p.price));
	const oldRaw = formatPrice(p.oldPrice || p.compareAtPrice || null);
	const oldPrice = oldRaw
		? `<span class="rose-product-oldprice font-manrope !text-[14px] font-normal !leading-none text-[#999999] line-through">${escapeHtml(oldRaw)}</span>`
		: "";
	return `<article class="group flex w-full flex-col gap-5" data-nt="rose-product-card" aria-label="${name}">
	<div class="relative w-full">
		<a href="${href}" class="relative block aspect-[318/444] w-full overflow-hidden rounded-[8px] bg-white" aria-label="${name}">
			${media}
		</a>
		${wishlistHeartHtml(p.id)}
	</div>
	<div class="flex w-full flex-col gap-1 text-left">
		<a href="${href}" class="rose-product-name block w-full font-manrope text-[14px] font-normal leading-none tracking-normal text-[#000000] transition-opacity hover:opacity-70">${name}</a>
		<div class="flex w-full flex-wrap items-baseline gap-2">
			<span class="rose-product-price font-manrope !text-[16px] font-normal !leading-none text-[#000000]">${price}</span>
			${oldPrice}
		</div>
	</div>
</article>`;
}

/**
 * Перерисовывает grid реальными товарами. Сохраняет `<li data-product-id>`
 * обёртку (как в catalog.astro/Popular.astro). Demo-сборка → no-op.
 */
export async function hydrateGrid(gridSelector: string, limit?: number): Promise<RealProduct[] | null> {
	const grids = Array.from(document.querySelectorAll<HTMLElement>(gridSelector));
	if (grids.length === 0) return null;
	const products = await loadRealProducts();
	if (!products) return null;
	const items = typeof limit === "number" ? products.slice(0, limit) : products;
	const html = items
		.map((p) => `<li data-product-id="${escapeHtml(p.id)}">${renderCardHtml(p)}</li>`)
		.join("");
	for (const grid of grids) grid.innerHTML = html;
	return items;
}

/** Обновляет текстовый счётчик "N товаров" (по data-hook). */
export function updateCount(countSelector: string, n: number): void {
	for (const el of Array.from(document.querySelectorAll<HTMLElement>(countSelector))) {
		el.textContent = `${n} товаров`;
	}
}

// ─────────────────────────── Варианты (Phase 2) ───────────────────────────

/** Выводит группы вариантов из `combos[].options` (variantGroups в products.json часто null). */
export function deriveVariantGroups(combos: VariantCombination[]): VariantGroup[] {
	const order: string[] = [];
	const byGroup = new Map<string, string[]>();
	for (const c of combos) {
		for (const [group, value] of Object.entries(c.options ?? {})) {
			if (!byGroup.has(group)) {
				byGroup.set(group, []);
				order.push(group);
			}
			const values = byGroup.get(group)!;
			if (!values.includes(value)) values.push(value);
		}
	}
	return order.map((name) => ({ name, values: byGroup.get(name)! }));
}

/** Находит комбинацию, у которой ВСЕ выбранные значения групп совпали. */
export function findCombination(
	combos: VariantCombination[],
	selected: Record<string, string>,
): VariantCombination | null {
	return (
		combos.find((c) =>
			Object.entries(selected).every(([group, value]) => c.options?.[group] === value),
		) ?? null
	);
}

const VARIANT_BTN_BASE =
	"inline-flex h-10 shrink-0 items-center justify-center rounded-[6px] px-3 py-2.5 text-[14px] font-normal leading-normal outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-[#000000] focus-visible:ring-offset-2";
const VARIANT_BTN_SEL = "border-0 !bg-[#000000] !text-white hover:opacity-95";
const VARIANT_BTN_UNSEL =
	"border border-solid border-[#000000] !bg-white !text-[#000000] hover:opacity-90";

/**
 * HTML-разметка групп вариантов — стиль 1:1 с `RosePdpColorVariantRow`
 * (выбран: чёрный фон/белый текст; невыбран: белый фон/чёрный border).
 * Маркер `data-pdp-variant-group` (НЕ `data-nt="variant-text-row"`), чтобы
 * не конфликтовать с demo-обработчиком в RoseProductDetail.
 */
export function renderVariantGroupsHtml(
	groups: VariantGroup[],
	selected: Record<string, string>,
): string {
	return groups
		.map((g) => {
			const buttons = g.values
				.map((v) => {
					const isSel = selected[g.name] === v;
					const cls = `${VARIANT_BTN_BASE} ${isSel ? VARIANT_BTN_SEL : VARIANT_BTN_UNSEL}`;
					return `<button type="button" class="${cls}" role="radio" aria-checked="${isSel}" data-variant-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`;
				})
				.join("");
			return `<div class="flex w-full flex-col gap-2 font-manrope" data-pdp-variant-group="${escapeHtml(g.name)}">
	<span class="font-manrope text-[14px] font-normal leading-none text-[#000000]">${escapeHtml(g.name)}</span>
	<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="${escapeHtml(g.name)}">${buttons}</div>
</div>`;
		})
		.join("");
}
