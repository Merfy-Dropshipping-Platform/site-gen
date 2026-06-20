/**
 * Клиентская гидрация реальных товаров (Option B, спек 098).
 *
 * Темы vanilla собираются в `dist/theme-live/vanilla` на деплое СЕРВИСА — тогда
 * per-site `products.json` ещё нет, поэтому каталог/Popular запекают demo-фолбэк
 * (`catalogProducts`, bag-1…8). На публикации конкретного сайта build.service
 * инжектит реальный `/data/products.json`, но статичный SSG HTML уже demo. Этот
 * модуль на рантайме читает `/data/products.json` и подменяет demo реальными
 * товарами (каталог + главная + PDP).
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
const PLACEHOLDER_IMAGE = "/placeholders/sweater-blue.png";

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

export function productImage(p: RealProduct): string {
	return (Array.isArray(p.images) && p.images[0]) || PLACEHOLDER_IMAGE;
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
 * Разметка карточки товара — зеркалит `VanillaProductCard.astro` (article →
 * картинка-ссылка + name + price). Плоский `<img>` вместо `<VanillaPicture>`
 * (визуально идентично; webp-конвейер для MinIO-картинок не применяется).
 * Классы/структура 1:1 с темой vanilla: aspect-square, bg var(--vanilla-card),
 * font-vanilla-arsenal uppercase, старая цена #444444 line-through.
 */
// Товар без фото / битый URL (MinIO 404): surface-плейсхолдер вместо битого
// <img>. Зеркалит VanillaProductCard.astro (ветка !hasPhoto).
const CARD_MEDIA_FALLBACK_HTML =
	'<div class="absolute inset-0 flex items-center justify-center" aria-hidden="true">' +
	'<svg class="size-10" style="color:rgb(var(--color-muted,153 153 153))" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
	'<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>' +
	"</svg></div>";
const CARD_IMG_ONERROR_ATTR = ` onerror="this.onerror=null;this.outerHTML='${CARD_MEDIA_FALLBACK_HTML.replace(/"/g, "&quot;")}'"`;

// Outline-сердце vanilla (геометрия favourite.svg, viewBox 0 0 17.4 15.4) —
// автономная копия для inline-строк карточки (как в wishlist.astro): глобал
// window.__vanillaWishlist может быть ещё не готов на момент гидрации. Когда он
// готов — берём его heartSvg() (единый источник filled/outline вида).
const WISHLIST_OUTLINE_SVG =
	'<svg viewBox="0 0 17.4 15.4" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">' +
	'<path d="M7.428 14.2615C5.172 12.5239 0.7 8.55212 0.7 4.97729C0.7 2.61547 2.384 0.7 4.7 0.7C5.9 0.7 7.1 1.11175 8.7 2.75876C10.3 1.11175 11.5 0.7 12.7 0.7C15.016 0.7 16.7 2.61547 16.7 4.97729C16.7 8.5513 12.228 12.5239 9.972 14.2615C9.212 14.8462 8.188 14.8462 7.428 14.2615Z" ' +
	'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
	"</svg>";

/**
 * Overlay-кнопка «в избранное» для карточки каталога/главной. Зеркалит heartBtn
 * из wishlist.astro (квадратная плашка vanilla: острые углы, bg-white, тень), но
 * начальное состояние читается из глобала window.__vanillaWishlist (SSR-гард на
 * typeof window). Делегат initWishlistUI (Layout) перевешивает клики и перерисует
 * все сердца на vanilla:wishlist:updated/astro:page-load — здесь только стартовый
 * рендер. Кнопка СНАРУЖИ <a> фото (button-in-anchor невалиден).
 */
function wishlistHeartHtml(id: string): string {
	const w = typeof window !== "undefined" ? window.__vanillaWishlist : undefined;
	const fav = !!w?.has?.(id);
	const inner = w?.heartSvg ? w.heartSvg(fav) : WISHLIST_OUTLINE_SVG;
	return (
		`<button type="button" data-wishlist-toggle data-product-id="${escapeHtml(id)}" aria-pressed="${fav ? "true" : "false"}" aria-label="В избранное" ` +
		'class="absolute right-2 top-2 z-20 flex size-9 items-center justify-center bg-white text-[var(--vanilla-dark)] shadow-[0_2px_8px_rgba(0,0,0,0.10)] transition-opacity hover:opacity-80">' +
		`<span data-wishlist-icon class="block size-[18px]">${inner}</span></button>`
	);
}

export function renderCardHtml(p: RealProduct): string {
	const href = escapeHtml(productHref(p));
	const name = escapeHtml(p.name);
	const image = escapeHtml(productImage(p));
	const price = escapeHtml(formatPrice(p.price));
	const oldRaw = formatPrice(p.oldPrice || p.compareAtPrice || null);
	const oldPrice = oldRaw
		? `<span class="font-vanilla-arsenal text-[14px] font-normal leading-none text-[#444444] line-through">${escapeHtml(oldRaw)}</span>`
		: "";
	return `<article class="group flex flex-col gap-3" data-nt="vanilla-product-card" aria-label="${name}">
	<div class="relative w-full">
	<a href="${href}" class="relative block aspect-square w-full overflow-hidden bg-[var(--vanilla-card)]" aria-label="${name}">
		${image ? `<img src="${image}" alt="${name}" width="429" height="429" loading="eager" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"${CARD_IMG_ONERROR_ATTR} />` : CARD_MEDIA_FALLBACK_HTML}
	</a>
	${wishlistHeartHtml(p.id)}
	</div>
	<div class="flex flex-col gap-1">
		<a href="${href}" class="font-vanilla-arsenal text-base font-normal uppercase leading-none text-black transition-opacity hover:opacity-70">${name}</a>
		<div class="flex flex-wrap items-baseline gap-2">
			<span class="font-vanilla-arsenal text-base font-normal leading-none text-black">${price}</span>
			${oldPrice}
		</div>
	</div>
</article>`;
}

/**
 * Перерисовывает grid реальными товарами. Сохраняет `<li data-product-id>`
 * обёртку (как в catalog/Popular). Demo-сборка → no-op.
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

/** Обновляет текстовый счётчик "N товаров" (по data-hook).
 * Vanilla каталог склоняет слово "товар" — повторяем ту же логику. */
export function updateCount(countSelector: string, n: number): void {
	const label = pluralizeProducts(n);
	for (const el of Array.from(document.querySelectorAll<HTMLElement>(countSelector))) {
		el.textContent = label;
	}
}

/** Склонение «N товар/товара/товаров» — паритет с VanillaCatalogSection.astro. */
function pluralizeProducts(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod100 >= 11 && mod100 <= 14) return `${count} товаров`;
	if (mod10 === 1) return `${count} товар`;
	if (mod10 >= 2 && mod10 <= 4) return `${count} товара`;
	return `${count} товаров`;
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
	"inline-flex h-10 shrink-0 items-center justify-center px-3 py-2.5 font-vanilla-arsenal text-[14px] font-normal uppercase leading-none outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2";
const VARIANT_BTN_SEL = "border border-solid border-[var(--vanilla-header-bg)] !bg-[var(--vanilla-header-bg)] !text-white hover:opacity-90";
const VARIANT_BTN_UNSEL =
	"border border-solid border-black !bg-white !text-black hover:opacity-80";

/**
 * HTML-разметка групп вариантов — стиль под тему vanilla (выбран: фон
 * var(--vanilla-header-bg)/белый текст; невыбран: белый фон/чёрный border).
 * Маркер `data-pdp-variant-group`, чтобы не конфликтовать с demo-разметкой PDP.
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
			return `<div class="flex w-full flex-col gap-2" data-pdp-variant-group="${escapeHtml(g.name)}">
	<span class="font-vanilla-arsenal text-[14px] font-normal uppercase leading-none text-black">${escapeHtml(g.name)}</span>
	<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="${escapeHtml(g.name)}">${buttons}</div>
</div>`;
		})
		.join("");
}
