/**
 * Клиентская гидрация реальных товаров (Option B, спек 098).
 *
 * Темы flux собираются в `dist/theme-live/flux` на деплое СЕРВИСА — тогда
 * per-site `products.json` ещё нет, поэтому каталог/главная запекают demo-фолбэк
 * (`catalogProducts`). На публикации конкретного сайта build.service инжектит
 * реальный `/data/products.json`, но статичный SSG HTML уже demo. Этот модуль на
 * рантайме читает `/data/products.json` и подменяет demo реальными товарами
 * (каталог + главная + PDP).
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
	/**
	 * Плоский массив свотчей цвета — build.service/fetchProducts эмитят его из
	 * группы «Цвет»/«Color» (Figma 1:26389 rich-карточка). `color` — `#RRGGBB`
	 * (swatchHex). Карточка рисует цветные квадраты прямо из этого поля.
	 */
	variantSwatches?: VariantSwatch[];
	/** Полное дерево групп вариаций (фолбэк для свотчей/памяти). */
	variantGroups?: VariantGroupTree[];
}

/** Свотч цвета из products.json/storefront-data (группа «Цвет»). */
export interface VariantSwatch {
	value: string; // имя цвета, напр. «Белый»
	color: string | null; // `#RRGGBB` (swatchHex) либо null
	available?: boolean;
}

/** Группа вариаций с опциями (несёт swatchHex на опциях группы цвета). */
export interface VariantGroupTree {
	name: string;
	options?: Array<{ value: string; swatchHex?: string | null }>;
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
const PLACEHOLDER_IMAGE = "/placeholders/sweater-blue.svg";

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
 * `/products/{id}` страниц (только demo), поэтому единая страница
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
 * Outline-сердце flux (фолбэк, если глобал `__fluxWishlist` ещё не готов на
 * момент рендера карточки). Геометрия зеркалит `wishlist.ts` heartSvg(false)
 * + FluxProductCard wishlistOutlineSvg (единый вид сердца темы). После любого
 * toggle/load делегат `initWishlistUI` перерисует `[data-wishlist-icon]` через
 * heartSvg(active), так что filled-состояние приходит из глобала.
 */
const WISHLIST_OUTLINE_SVG =
	'<svg viewBox="0 0 17.4 15.4" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">' +
	'<path d="M7.428 14.2615C5.172 12.5239 0.7 8.55212 0.7 4.97729C0.7 2.61547 2.384 0.7 4.7 0.7C5.9 0.7 7.1 1.11175 8.7 2.75876C10.3 1.11175 11.5 0.7 12.7 0.7C15.016 0.7 16.7 2.61547 16.7 4.97729C16.7 8.5513 12.228 12.5239 9.972 14.2615C9.212 14.8462 8.188 14.8462 7.428 14.2615Z" ' +
	'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
	"</svg>";

/**
 * Overlay-сердце избранного для карточки-листинга. Зеркалит кнопку из
 * `wishlist.astro` flux: контракт `[data-wishlist-toggle][data-product-id]` +
 * дочерний `[data-wishlist-icon]`, по которому делегат `initWishlistUI`
 * перекрашивает состояние. Начальное состояние читаем синхронно из глобала
 * `window.__fluxWishlist` (SSR-guard `typeof window`); если он ещё не готов —
 * outline-фолбэк (делегат поправит на load).
 */
interface WishlistGlobal {
	has?(id: string): boolean;
	heartSvg?(filled: boolean): string;
}
function wishlistHeartHtml(id: string): string {
	const w =
		typeof window !== "undefined"
			? (window as unknown as { __fluxWishlist?: WishlistGlobal }).__fluxWishlist
			: undefined;
	const fav = !!w?.has?.(id);
	const inner = w?.heartSvg ? w.heartSvg(fav) : WISHLIST_OUTLINE_SVG;
	return (
		'<button type="button" data-wishlist-toggle data-product-id="' +
		escapeHtml(id) +
		'" aria-pressed="' +
		(fav ? "true" : "false") +
		'" aria-label="В избранное" ' +
		'class="absolute right-2 top-2 z-20 flex size-9 items-center justify-center rounded-full bg-white/90 text-[#000000] shadow-[0_2px_8px_rgba(0,0,0,0.10)] backdrop-blur-sm transition-opacity hover:opacity-80">' +
		'<span data-wishlist-icon class="block size-[18px]">' +
		inner +
		"</span></button>"
	);
}

// ───────────────────────── Свотчи цвета / память ─────────────────────────

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const COLOR_GROUP_RE = /^(цвет|color)$/i;
// Чипы памяти/объёма (эталон «128 ГБ»): ловим ТОЛЬКО значения с единицей памяти,
// чтобы не выводить чипами размеры одежды (S/M/L) — те остаются только в свотчах
// /выборе на PDP. Покрывает ГБ/GB/ТБ/TB/МБ/MB.
// `\b` НЕ годится: после кириллических «ГБ» границы слова нет (кириллица — не
// \w), и «128 ГБ» бы не матчился. Негативный lookahead на букву (лат/кир)
// отсекает «gb» внутри длинного слова, но пропускает «ГБ» в конце/перед пробелом.
const MEMORY_VALUE_RE = /\d+\s*(гб|gb|тб|tb|мб|mb)(?![a-zа-яё])/i;

/** Имя цвета → `#RRGGBB` (фолбэк, когда swatchHex не задан мерчантом). */
const COLOR_NAME_HEX: Record<string, string> = {
	белый: "#FFFFFF",
	white: "#FFFFFF",
	чёрный: "#000000",
	черный: "#000000",
	black: "#000000",
	красный: "#E02D2D",
	red: "#E02D2D",
	синий: "#2D4BE0",
	blue: "#2D4BE0",
	голубой: "#6FB7E0",
	"зелёный": "#2DA84F",
	зеленый: "#2DA84F",
	green: "#2DA84F",
	"жёлтый": "#F2C53D",
	желтый: "#F2C53D",
	yellow: "#F2C53D",
	оранжевый: "#FA5109",
	orange: "#FA5109",
	серый: "#9A9A9A",
	gray: "#9A9A9A",
	grey: "#9A9A9A",
	серебро: "#C0C0C0",
	серебряный: "#C0C0C0",
	silver: "#C0C0C0",
	графит: "#3A3A3A",
	graphite: "#3A3A3A",
	"бежевый": "#E8D9C0",
	beige: "#E8D9C0",
	коричневый: "#7A5230",
	brown: "#7A5230",
	розовый: "#F2A0C0",
	pink: "#F2A0C0",
	фиолетовый: "#7A3FB0",
	purple: "#7A3FB0",
	violet: "#7A3FB0",
	бордовый: "#6E1423",
	золотой: "#D4AF37",
	gold: "#D4AF37",
	бирюзовый: "#2DBFB0",
	teal: "#2DBFB0",
};

/**
 * Преобразует значение/подсказку цвета в `#RRGGBB`. Приоритет: hex-подсказка
 * (swatchHex) → hex прямо в значении → имя цвета по таблице. Не распознали —
 * null (свотч пропускается, как требует задача «не hex → пропусти/маппинг»).
 */
function colorToHex(value?: string | null, hint?: string | null): string | null {
	const h = (hint ?? "").trim();
	if (HEX_RE.test(h)) return h;
	const v = (value ?? "").trim();
	if (HEX_RE.test(v)) return v;
	return COLOR_NAME_HEX[v.toLowerCase()] ?? null;
}

/**
 * Уникальные hex-свотчи цвета товара + флаг «есть недоступный цвет». Источники
 * по приоритету: variantSwatches (плоский, эмитит пайплайн) → группа «Цвет» из
 * variantGroups (swatchHex) → имена цветов из variantCombinations (по таблице).
 * Недоступный цвет в filled-список не идёт — вместо него один перечёркнутый
 * серый квадрат (swatchDisabled), как в эталоне.
 */
export function deriveSwatches(p: RealProduct): { swatches: string[]; swatchDisabled: boolean } {
	const out: string[] = [];
	const seen = new Set<string>();
	let swatchDisabled = false;
	const push = (hex: string | null, available?: boolean): void => {
		if (!hex) return;
		if (available === false) {
			swatchDisabled = true;
			return;
		}
		const key = hex.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		out.push(hex);
	};

	if (Array.isArray(p.variantSwatches) && p.variantSwatches.length > 0) {
		for (const s of p.variantSwatches) push(colorToHex(s?.value, s?.color), s?.available);
	}
	if (out.length === 0 && Array.isArray(p.variantGroups)) {
		const group = p.variantGroups.find((g) => COLOR_GROUP_RE.test(String(g?.name ?? "").trim()));
		if (group && Array.isArray(group.options)) {
			for (const o of group.options) push(colorToHex(o?.value, o?.swatchHex));
		}
	}
	if (out.length === 0 && Array.isArray(p.variantCombinations)) {
		for (const c of p.variantCombinations) {
			const name = c?.options?.["Цвет"] ?? c?.options?.["Color"];
			push(colorToHex(name), c?.available);
		}
	}
	return { swatches: out.slice(0, 6), swatchDisabled };
}

/**
 * Чипы памяти/объёма (эталон) из не-цветовой группы вариаций. Только значения с
 * единицей памяти (ГБ/GB/…) — размеры одежды чипами не выводим. Источники:
 * variantGroups → variantCombinations.
 */
export function deriveMemory(p: RealProduct): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const add = (value?: string | null): void => {
		const s = (value ?? "").trim();
		if (!s || seen.has(s.toLowerCase()) || !MEMORY_VALUE_RE.test(s)) return;
		seen.add(s.toLowerCase());
		out.push(s);
	};

	if (Array.isArray(p.variantGroups)) {
		for (const g of p.variantGroups) {
			if (COLOR_GROUP_RE.test(String(g?.name ?? "").trim())) continue;
			for (const o of g?.options ?? []) add(o?.value);
		}
	}
	if (out.length === 0 && Array.isArray(p.variantCombinations)) {
		for (const c of p.variantCombinations) {
			for (const [key, val] of Object.entries(c?.options ?? {})) {
				if (!COLOR_GROUP_RE.test(key)) add(val);
			}
		}
	}
	return out.slice(0, 4);
}

/** Цена-в-число: число как есть, строка «54 990 ₽» → 54990, иначе null. */
function parsePriceNum(v: number | string | null | undefined): number | null {
	if (v === null || v === undefined || v === "") return null;
	if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
	const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
	return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Sale-бейдж эталона (Figma): уценённый товар (oldPrice/compareAtPrice > price)
 * → `-NN%` в оранжевом квадрате, иначе «Скидка». Нет уценки → пусто. Стиль 1:1
 * с FluxProductCard (white, 12px, font-light, px-1.5 py-1).
 */
function saleBadgeHtml(p: RealProduct): string {
	const old = parsePriceNum(p.oldPrice ?? p.compareAtPrice ?? null);
	const cur = parsePriceNum(p.price);
	if (!old || !cur || old <= cur) return "";
	const pct = Math.round(((old - cur) / old) * 100);
	const label = pct > 0 ? `-${pct}%` : "Скидка";
	return (
		`<div class="absolute left-2 top-2 flex flex-col items-start gap-1">` +
		`<span class="inline-flex items-center justify-center rounded-[4px] bg-[#FA5109] px-1.5 py-1 font-roboto-flex text-[12px] font-light leading-none text-white md:text-[14px]">${escapeHtml(label)}</span>` +
		`</div>`
	);
}

// Чёрная CTA эталона (literal — карточка верстальщиков светлая независимо от
// схемы; data-btn-style на гриде Popular перекрывает её через <style is:global>).
const CARD_BTN_CLS =
	"mt-auto inline-flex h-11 w-full items-center justify-center rounded-[4px] bg-[#000000] px-3 font-roboto-flex text-[14px] font-normal uppercase leading-none text-white transition-opacity hover:opacity-90";

/**
 * Кнопка «В корзину» карточки. Вариативный товар → добавляет ПЕРВУЮ доступную
 * комбинацию (combo.id + цвет/размер в data-*, контракт nt-cart-flux initCartUI);
 * битый вариативный без комбинаций → ссылка на PDP; простой товар → продуктовые
 * data-* (решение владельца, прежняя логика Popular гидрации).
 */
function cardButtonHtml(p: RealProduct): string {
	const hasVariants =
		p.hasVariants === true ||
		(Array.isArray(p.variantCombinations) && p.variantCombinations.length > 0);
	if (hasVariants) {
		const combos = p.variantCombinations ?? [];
		const firstCombo = combos.find((c) => c && c.available !== false) ?? combos[0];
		if (!firstCombo) {
			return `<a href="${escapeHtml(productHref(p))}" data-qa-link class="${CARD_BTN_CLS}">В корзину</a>`;
		}
		const opt = (firstCombo.options ?? {}) as Record<string, string>;
		const color = opt["Цвет"] || opt["Color"] || "";
		const size = opt["Размер"] || opt["Size"] || "";
		return (
			`<button type="button" data-add-to-cart data-product-id="${escapeHtml(p.id)}"` +
			` data-name="${escapeHtml(p.name)}" data-price="${escapeHtml(String(firstCombo.price))}"` +
			` data-variant-combination-id="${escapeHtml(String(firstCombo.id))}"` +
			(color ? ` data-variant-color="${escapeHtml(color)}"` : "") +
			(size ? ` data-variant-size="${escapeHtml(size)}"` : "") +
			` data-image="${escapeHtml(productImage(p))}" data-quantity="1" class="${CARD_BTN_CLS}">В корзину</button>`
		);
	}
	const old = formatPrice(p.oldPrice || p.compareAtPrice || null);
	return (
		`<button type="button" data-add-to-cart data-product-id="${escapeHtml(p.id)}"` +
		` data-name="${escapeHtml(p.name)}" data-price="${escapeHtml(String(p.price))}"` +
		(old ? ` data-old-price="${escapeHtml(old)}"` : "") +
		` data-image="${escapeHtml(productImage(p))}" data-quantity="1" class="${CARD_BTN_CLS}">В корзину</button>`
	);
}

/**
 * Rich-разметка карточки товара — зеркалит эталон `FluxProductCard.astro`
 * (article rounded/bg → медиа + бейджи + оверлей-сердце → свотчи + name + price
 * + memory-чипы + чёрная CTA). Плоский `<img>` вместо `<FluxPicture>` (визуально
 * идентично; webp-конвейер для MinIO-картинок не применяется). Сердце избранного
 * и fallback-svg пустого фото — фичи Merfy, сохранены поверх эталона.
 */
export function renderCardHtml(p: RealProduct): string {
	const href = escapeHtml(productHref(p));
	const name = escapeHtml(p.name);
	const image = escapeHtml(productImage(p));
	const price = escapeHtml(formatPrice(p.price));
	const oldRaw = formatPrice(p.oldPrice || p.compareAtPrice || null);
	const oldPrice = oldRaw
		? `<span class="font-roboto-flex text-[12px] font-light leading-normal text-[#CCCCCC] line-through md:text-[14px]">${escapeHtml(oldRaw)}</span>`
		: "";
	const imageHtml = image
		? `<img src="${image}" alt="${name}" width="600" height="600" loading="eager" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />`
		: `<span class="flex h-full w-full items-center justify-center text-[rgb(var(--color-muted,153_153_153))]"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>`;

	const { swatches, swatchDisabled } = deriveSwatches(p);
	const swatchesHtml =
		swatches.length > 0
			? `<div class="flex items-center gap-1">${swatches
					.map((c) => `<span class="size-5 rounded-[2px]" style="background:${c}" aria-hidden="true"></span>`)
					.join("")}${
					swatchDisabled
						? `<span class="relative size-5 rounded-[2px] bg-[#F5F5F5]" aria-hidden="true"><span class="absolute inset-0 m-auto h-[1px] w-[26px] origin-center -rotate-45 bg-[#999999]"></span></span>`
						: ""
				}</div>`
			: "";

	const memory = deriveMemory(p);
	const memoryHtml =
		memory.length > 0
			? `<div class="flex flex-wrap items-start gap-1">${memory
					.map(
						(m) =>
							`<span class="inline-flex items-center rounded-[2px] border border-solid border-[#F5F5F5] p-1 font-roboto-flex text-[12px] font-light leading-none text-[#000000]">${escapeHtml(m)}</span>`,
					)
					.join("")}</div>`
			: "";

	return `<article class="group flex h-full w-full flex-col gap-4 rounded-[12px] bg-[#FBFBFB] p-3 transition-transform duration-300 hover:-translate-y-1" data-nt="flux-product-card" aria-label="${name}">
	<div class="relative w-full">
		<a href="${href}" data-nt="flux-card-media" class="relative block aspect-square w-full overflow-hidden rounded-[12px] bg-[#FBFBFB]" aria-label="${name}">
			${imageHtml}
			${saleBadgeHtml(p)}
		</a>
		${wishlistHeartHtml(p.id)}
	</div>
	<div class="flex flex-1 flex-col gap-4">
		<div class="flex flex-col gap-4">
			${swatchesHtml}
			<div class="flex flex-col gap-1">
				<a href="${href}" class="truncate font-roboto-flex text-[14px] font-light leading-normal text-[#000000] hover:opacity-80 md:text-[16px]">${name}</a>
				<div class="flex items-center gap-2">
					<span class="font-roboto-flex text-[14px] font-light leading-normal text-[#000000] md:text-[16px]">${price}</span>
					${oldPrice}
				</div>
			</div>
		</div>
		${memoryHtml}
		${cardButtonHtml(p)}
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
 * HTML-разметка групп вариантов (выбран: чёрный фон/белый текст; невыбран:
 * белый фон/чёрный border) — стиль ровный с demo вариант-строкой Flux.
 * Маркер `data-pdp-variant-group` (НЕ `data-nt="variant-text-row"`), чтобы
 * не конфликтовать с demo-обработчиком в FluxProductDetail.
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
