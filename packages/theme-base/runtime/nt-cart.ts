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

import { createCartAddedModal } from "./cart-added-modal";
// Тот же разбор «название → цвет», что рисует образцы на странице товара
// (ProductVariants.astro). Модуль без зависимостей.
import { resolveVariantColor } from "../blocks/Product/variantColor";
import type { VariantSwatchShape } from "./variant-display";

export interface NtCartLineVariant {
	color?: string;
	size?: string;
	/**
	 * ВСЕ выбранные опции комбинации: «Оттенок» → «Cold Brew», «Объём» → «50 мл».
	 * До 19.09.2026 позиция знала только `color`/`size` — страница товара
	 * распознавала ровно имена групп «Цвет»/«Размер», и любой другой вариант
	 * доезжал до корзины без подписи: две одинаковые строки на два разных
	 * оттенка (баг тестера #7). Старые позиции из localStorage живут дальше на
	 * `color`/`size` — `variantLabel` понимает обе формы.
	 */
	options?: Record<string, string>;
	/** combinationId реальной комбинации — уходит в backend cart → order_items. */
	variantCombinationId?: string;
	/**
	 * Цвет образца опции: «Цвет» → «#9CA3AF». Заполняет сверка с каталогом
	 * (`labelNtLinesFromCatalog`): цвет мерчанта из платформы, иначе цвет по
	 * названию. Рисовать ли его образцом и какой формы, решает страница товара
	 * сайта (см. `variantParts`).
	 */
	swatches?: Record<string, string>;
}

/**
 * Подпись варианта в строке корзины — ОДНА на дровер, страницу корзины и
 * сводку. Порядок значений — как объявлены опции комбинации; устаревшие
 * `color`/`size` добавляются, только если их ещё нет среди опций.
 */
export function variantLabel(variant: NtCartLineVariant | undefined): string {
	if (!variant) return "";
	const values: string[] = [];
	const push = (raw: unknown) => {
		const v = typeof raw === "string" ? raw.trim() : "";
		if (v && !values.includes(v)) values.push(v);
	};
	if (variant.options && typeof variant.options === "object") {
		for (const key of Object.keys(variant.options)) push(variant.options[key]);
	}
	push(variant.color);
	push(variant.size);
	return values.join(", ");
}

/**
 * Пары «Имя: Значение» выбранного варианта — для тем, которые подписывают
 * характеристики (flux: «Цвет: Красный», «Размер: M»). Старые позиции без
 * `options` подписываются прежними именами, чтобы корзины, сохранённые до
 * 20.09, не потеряли подпись.
 */
export function variantPairs(
	variant: NtCartLineVariant | undefined,
): Array<{ name: string; value: string }> {
	if (!variant) return [];
	const pairs: Array<{ name: string; value: string }> = [];
	const push = (name: string, raw: unknown) => {
		const value = typeof raw === "string" ? raw.trim() : "";
		if (!value) return;
		if (pairs.some((p) => p.value === value)) return;
		pairs.push({ name, value });
	};
	if (variant.options && typeof variant.options === "object") {
		for (const key of Object.keys(variant.options)) push(key, variant.options[key]);
	}
	push("Цвет", variant.color);
	push("Размер", variant.size);
	return pairs;
}

/**
 * Форма образца на странице товара ЭТОГО сайта («Вариации» секции «Товар»).
 * Сборка витрины и превью кладут её глобалом на каждую страницу
 * (`runtime/variant-display.ts`). Нет глобала — форма по умолчанию секции,
 * круг.
 */
const pageSwatchShape = (): VariantSwatchShape => {
	const raw = typeof window === "undefined" ? undefined : (window as { __MERFY_VARIANT_SWATCH__?: unknown }).__MERFY_VARIANT_SWATCH__;
	return raw === "square" || raw === "none" ? raw : "circle";
};

/** Скругление образца по форме: как у чипа страницы товара (`rounded-full` / `rounded-none`). */
const SWATCH_RADIUS: Record<Exclude<VariantSwatchShape, "none">, string> = {
	circle: "9999px",
	square: "0",
};
/**
 * В `style` уходит только цвет в строгой форме. Подсказка мерчанта (swatchHex)
 * приходит из данных, и проверка «начинается с rgb(» пропустила бы
 * «rgb(0,0,0);background:url(…)».
 */
const SAFE_COLOR_RE = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\))$/i;

const safeSwatchColor = (raw: unknown): string | null => {
	const v = typeof raw === "string" ? raw.trim() : "";
	return v && SAFE_COLOR_RE.test(v) ? v : null;
};

export const escapeCartHtml = (raw: string): string =>
	raw
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

/**
 * Опция варианта в строке корзины. `swatch` — CSS-цвет, если опцию надо
 * нарисовать образцом формы `shape`; null — словом.
 */
export interface NtVariantPart {
	name: string;
	value: string;
	swatch: string | null;
	shape: Exclude<VariantSwatchShape, "none">;
}

/**
 * Пары варианта — так, как их показывает страница товара этого сайта.
 * Владелец, 23.09: «если там кружок — то кружок, если квадратик — то
 * квадратик… как карточка товара». Правило страницы (ProductVariants): при
 * «Вариациях» круг/квадрат опция, у которой есть цвет, — образец этой формы,
 * остальное словом; при «Нет» всё словами. Цвет — из `variant.swatches` (цвет
 * мерчанта после сверки с каталогом), иначе по названию тем же разбором.
 */
export function variantParts(
	variant: NtCartLineVariant | undefined,
	shape: VariantSwatchShape = pageSwatchShape(),
): NtVariantPart[] {
	const form = shape === "square" ? "square" : "circle";
	return variantPairs(variant).map(({ name, value }) => {
		const color =
			shape === "none"
				? null
				: (safeSwatchColor(variant?.swatches?.[name]) ?? safeSwatchColor(resolveVariantColor(value)));
		return { name, value, swatch: color, shape: form };
	});
}

/**
 * Образец цвета для строки корзины — кружок или квадратик, как на странице
 * товара. Стили инлайном: ядро рисует его во всех темах, а Tailwind каждой
 * темы этот файл не сканирует. Название — в подсказке и для чтения с экрана,
 * глазами видно цвет.
 */
export function variantSwatchHtml(
	color: string,
	label: string,
	shape: Exclude<VariantSwatchShape, "none"> = "circle",
): string {
	const c = safeSwatchColor(color);
	const text = escapeCartHtml(label);
	if (!c) return text;
	return (
		`<span data-cart-variant-swatch="${shape}" role="img" aria-label="${text}" title="${text}"` +
		` style="display:inline-block;width:1em;height:1em;border-radius:${SWATCH_RADIUS[shape]};` +
		`background:${c};box-shadow:inset 0 0 0 1px rgb(0 0 0 / 0.15);vertical-align:-0.15em"></span>`
	);
}

/**
 * Подпись варианта строки корзины — готовой БЕЗОПАСНОЙ разметкой, одна на
 * дровер, страницу корзины и окно «Товар добавлен» во всех темах. Текст
 * экранирован, цвет — кружок. `names: true` — «Оттенок: Sugar Plum» (flux),
 * иначе значения через запятую, как `variantLabel`.
 */
export function variantHtml(
	variant: NtCartLineVariant | undefined,
	opts: { names?: boolean } = {},
): string {
	const parts = variantParts(variant);
	return parts
		.map((part, i) => {
			const value = part.swatch ? variantSwatchHtml(part.swatch, part.value, part.shape) : escapeCartHtml(part.value);
			const piece = opts.names ? `${escapeCartHtml(part.name)}: ${value}` : value;
			if (i === 0) return piece;
			// Запятая — между словами. Рядом с кружком она висит: «M, ●».
			const sep = opts.names || part.swatch || parts[i - 1].swatch ? " " : ", ";
			return sep + piece;
		})
		.join("");
}

/** Разбор `data-variant-options` (JSON от страницы товара) в опции позиции. */
export function parseVariantOptions(
	raw: string | undefined,
): Record<string, string> | undefined {
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			const k = String(key).trim();
			const v = typeof value === "string" ? value.trim() : "";
			if (k && v) out[k] = v;
		}
		return Object.keys(out).length > 0 ? out : undefined;
	} catch {
		return undefined;
	}
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

/** Каталог, который сборка кладёт каждой витрине (build.service, themes-v2). */
const DEFAULT_CATALOG_URL = "/data/products.json";

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
		options?: Array<{ value?: string; images?: string[]; swatchHex?: string | null }>;
	}>;
	/** Образцы группы-цвета от платформы: `[{ value: "Серый", color: "#9CA3AF" }]`. */
	variantSwatches?: Array<{ value?: string; color?: string | null }>;
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
 * Экспортируется для юнит-теста.
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

/** Опции комбинации без пустых ключей/значений; пусто → undefined. */
const cleanOptions = (raw: unknown): Record<string, string> | undefined => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		const k = String(key).trim();
		const v = typeof value === "string" ? value.trim() : "";
		if (k && v) out[k] = v;
	}
	return Object.keys(out).length > 0 ? out : undefined;
};

/** Цвета образцов опций товара (см. `NtCartLineVariant.swatches`). */
function catalogSwatches(
	product: NtCatalogProduct,
	options: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (!options) return undefined;
	const groups = Array.isArray(product.variantGroups) ? product.variantGroups : [];
	const platform = Array.isArray(product.variantSwatches) ? product.variantSwatches : [];
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(options)) {
		const group = groups.find((g) => String(g?.name ?? "").trim() === name);
		const option = (Array.isArray(group?.options) ? group!.options! : []).find(
			(o) => String(o?.value ?? "").trim() === value,
		);
		const fromPlatform = platform.find((sw) => String(sw?.value ?? "").trim() === value);
		const hint = safeSwatchColor(option?.swatchHex) ?? safeSwatchColor(fromPlatform?.color);
		// Цвет мерчанта, иначе по названию — как у образцов страницы товара (она
		// не смотрит на имя группы). Рисовать ли образцом, решает форма страницы.
		const color = safeSwatchColor(resolveVariantColor(value, hint));
		if (color) out[name] = color;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

const sameRecord = (a?: Record<string, string>, b?: Record<string, string>): boolean =>
	JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Те же пары «группа → значение» без учёта порядка ключей. */
const sameEntries = (a?: Record<string, string>, b?: Record<string, string>): boolean => {
	if (!a || !b) return !a && !b;
	const ka = Object.keys(a);
	return ka.length === Object.keys(b).length && ka.every((k) => b[k] === a[k]);
};

/**
 * Опции в порядке групп товара — так их видит покупатель на странице товара.
 * Порядок ключей в самой комбинации задаёт сервис товаров, и он другой:
 * у худи на витрине тестировщика «Размер, Цвет» при показе «Цвет, Размер».
 */
function orderByGroups(
	options: Record<string, string>,
	groups: NtCatalogProduct["variantGroups"],
): Record<string, string> {
	const names = (Array.isArray(groups) ? groups : []).map((g) => String(g?.name ?? "").trim());
	const rank = (k: string) => {
		const i = names.indexOf(k);
		return i === -1 ? names.length : i;
	};
	const keys = Object.keys(options);
	const sorted = keys.slice().sort((a, b) => rank(a) - rank(b) || keys.indexOf(a) - keys.indexOf(b));
	const out: Record<string, string> = {};
	for (const k of sorted) out[k] = options[k];
	return out;
}

/**
 * Подпись варианта строки — ИЗ КОМБИНАЦИИ, которая уйдёт в заказ.
 *
 * Пункт 26 тестера (22.09, повтор 23.09: «ничего не поменялось»). Замер на
 * живом сайте владельца: страница товара показывала выделенным Sugar Plum, а
 * в корзину клала комбинацию Berry Glaze и без названия — строка выходила
 * пустой. Мест, которые кладут товар в корзину, больше десятка (страница
 * товара, карточки каталога, «Популярное», поиск), и половина из них пишет
 * только номер комбинации. Чинить каждое — значит ждать, когда забудет
 * следующее. Поэтому подпись выводится здесь, одна на все темы: если
 * комбинация есть в каталоге, её опции и есть подпись (и цвета образцов).
 *
 * Строк не выкидывает и цен не трогает: это делает `reconcileNtLines` при
 * загрузке страницы. Каталог `products.json` запекается при публикации, а
 * страница товара досвечивает данные из живого API. Если номер комбинации в
 * каталоге не найден, строка остаётся как есть.
 * Экспортируется для юнит-теста.
 */
export function labelNtLinesFromCatalog(
	lines: NtCartLine[],
	products: NtCatalogProduct[],
): { lines: NtCartLine[]; changed: boolean } {
	if (!Array.isArray(lines) || lines.length === 0) return { lines: lines || [], changed: false };
	if (!Array.isArray(products) || products.length === 0) return { lines, changed: false };
	const byId = new Map<string, NtCatalogProduct>();
	for (const p of products) if (p && p.id != null) byId.set(String(p.id), p);
	let changed = false;
	const next = lines.map((line) => {
		const p = byId.get(String(line.productId));
		if (!p || !line.variant) return line;
		const vcId = line.variant.variantCombinationId;
		const combos = Array.isArray(p.variantCombinations) ? p.variantCombinations : [];
		const combo = vcId ? combos.find((c) => String(c.id) === String(vcId)) : undefined;
		const current = cleanOptions(line.variant.options);
		const fromCombo = cleanOptions(combo?.options);
		// Разошлись с комбинацией или названий нет — берём комбинацию. Порядок
		// всегда по группам товара, как на экране.
		const base = fromCombo && !sameEntries(fromCombo, current) ? fromCombo : (current ?? fromCombo);
		const options = base ? orderByGroups(base, p.variantGroups) : undefined;
		const swatches = catalogSwatches(p, options);
		if (sameRecord(options, line.variant.options) && sameRecord(swatches, line.variant.swatches)) return line;
		changed = true;
		const variant: NtCartLineVariant = { ...line.variant };
		if (options) variant.options = options;
		else delete variant.options;
		if (swatches) variant.swatches = swatches;
		else delete variant.swatches;
		return { ...line, variant };
	});
	return { lines: next, changed };
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
		// Каскад, а не «или»: у варианта своей цены до скидки может не быть
		// (каталог витрины отдаёт `compareAtPrice: null` на комбинации, а на
		// товаре — 999). Раньше стояло `combo ? combo.compareAtPrice : ...`, и для
		// ЛЮБОГО вариантного товара примирение затирало цену, пришедшую с кнопки:
		// она была видна миг после добавления и пропадала из дровера, корзины и
		// плавающей карточки. У товаров без вариантов всё работало — потому баг и
		// выглядел плавающим. Тот же каскад описан в flux/storefront-hydrate.ts.
		const rawOld =
			combo && combo.compareAtPrice != null
				? combo.compareAtPrice
				: p.compareAtPrice;
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
	// Подпись варианта — из найденной комбинации (см. labelNtLinesFromCatalog).
	const labelled = labelNtLinesFromCatalog(next, products);
	return { lines: labelled.lines, changed: changed || labelled.changed, dropped };
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
	// Preview-фолбэк: в конструктор-превью (iframe на gateway) /data/products.json
	// = 404. Берём каталог из storefront-data (тот же источник, что у продукт-блоков
	// превью — storefront-hydrate.ts) → reconcile лечит стейл-корзину и в превью.
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

	/**
	 * Подписать варианты строк по каталогу (labelNtLinesFromCatalog) — без
	 * выкидывания и без цен, поэтому безопасно у ЛЮБОЙ темы, в том числе без
	 * `catalogUrl` (flux): каталог по умолчанию — тот же `/data/products.json`,
	 * который сборка кладёт каждой витрине. Корзину перечитываем ПОСЛЕ загрузки
	 * каталога: за это время покупатель мог изменить количество.
	 */
	const labelCart = async (): Promise<void> => {
		if (typeof window === "undefined") return;
		if (!getCart().some((line) => line.variant?.variantCombinationId || line.variant?.options)) return;
		const products = await loadCatalog(catalogUrl || DEFAULT_CATALOG_URL);
		const result = labelNtLinesFromCatalog(getCart(), products);
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
		// Подпись варианта — сразу, а не с перезагрузкой страницы: кнопка могла
		// не передать название (только номер комбинации).
		void labelCart();
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

	/**
	 * Строка корзины, отвечающая карточке списка. У SSR-карточки нет
	 * combinationId (демо-разметка их не несёт), поэтому сопоставляем по
	 * productId + цвет + размер, игнорируя combinationId. Перенесено из bloom
	 * вместе с toggle-кнопками карточек.
	 */
	const findCardLine = (productId: string, variant?: NtCartLineVariant) =>
		getCart().find(
			(line) =>
				line.productId === productId &&
				(line.variant?.color ?? "") === (variant?.color ?? "") &&
				(line.variant?.size ?? "") === (variant?.size ?? ""),
		);

	/** Префикс темы из eventPrefix (`bloom:cart` → `bloom`) — ключ `<тема>:buynow`. */
	const themeKey = eventPrefix.split(":")[0] ?? "";

	const initCartUI = () => {
		if (typeof window === "undefined") return;

		const addedModal = createCartAddedModal({
			formatPrice,
			getCartCount: () => getCartCount(),
			productPathPrefix,
			themeKey,
		});

		const renderBadges = () => {
			const count = getCartCount();
			document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
				el.textContent = String(count);
				el.dataset.empty = count === 0 ? "true" : "false";
			});
		};

		const renderDrawer = () => {
			const lines = getCart();
			// Узлы ШТОРКИ, а не одноимённые узлы секций страницы корзины: «Промежуточный
			// итог» и др. несут те же data-cart-* атрибуты и стоят в DOM раньше шторки,
			// поэтому первый querySelector по странице находил секцию, и при пустой
			// корзине шторка прятала её (тестер 24.09: схема «Промежуточного итога»
			// «не применяется» — секция невидима в конструкторе). Секции страницы
			// всегда внутри [data-puck-component-id], шторка — вне их.
			const drawerNode = (sel: string) =>
				Array.from(document.querySelectorAll<HTMLElement>(sel)).find((el) => !el.closest("[data-puck-component-id]")) ?? null;
			const empty = drawerNode("[data-cart-empty]");
			const items = drawerNode("[data-cart-items]");
			const summary = drawerNode("[data-cart-summary]");
			const total = drawerNode("[data-cart-total]");
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

		/**
		 * Toggle-состояние карточек списка (перенесено из bloom вместе с флоу):
		 * кнопка отражает, лежит ли выбранный вариант в корзине. Работает только
		 * у кнопок с data-cart-toggle — у остальных тем это no-op.
		 */
		const syncProductCards = () => {
			document
				.querySelectorAll<HTMLButtonElement>("[data-add-to-cart][data-cart-toggle]")
				.forEach((btn) => {
					const inCart = Boolean(
						findCardLine(btn.dataset.productId ?? "", {
							color: btn.dataset.variantColor || undefined,
							size: btn.dataset.variantSize || undefined,
						}),
					);
					btn.dataset.inCart = inCart ? "true" : "false";
					btn.setAttribute("aria-pressed", inCart ? "true" : "false");
					const label = inCart ? btn.dataset.labelInCart : btn.dataset.labelDefault;
					if (label) btn.textContent = label;
				});
		};

		const onClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement;

			// Клик внутри окна «Товар добавлен» разбирает его собственный рантайм.
			if (addedModal.handleClick(target)) return;

			// Свотч цвета на карточке списка (перенесено из bloom): выбирает вариант
			// для кнопки «В корзину». Корень карточки ищем суффиксным селектором —
			// тем же приёмом, что tokens.css красит `[data-nt$="-product-card"]`,
			// поэтому работает у любой темы, а не только у bloom.
			const swatch = target.closest<HTMLButtonElement>("[data-card-color]");
			if (swatch) {
				const card = swatch.closest<HTMLElement>('[data-nt$="-product-card"]');
				if (!card) return;
				card.querySelectorAll<HTMLButtonElement>("[data-card-color]").forEach((b) => {
					b.setAttribute("aria-checked", b === swatch ? "true" : "false");
				});
				card
					.querySelector<HTMLButtonElement>("[data-add-to-cart]")
					?.setAttribute("data-variant-color", swatch.dataset.cardColor ?? "");
				syncProductCards();
				return;
			}

			const addBtn = target.closest<HTMLButtonElement>("[data-add-to-cart]");
			if (addBtn) {
				event.preventDefault();
				const variant = {
					color: addBtn.dataset.variantColor || undefined,
					size: addBtn.dataset.variantSize || undefined,
					// Произвольные группы вариантов («Оттенок», «Объём», «Вкус»):
					// страница товара кладёт их сюда JSON-ом, иначе подпись строки
					// собиралась бы из пустых color/size (баг тестера #7).
					options: parseVariantOptions(addBtn.dataset.variantOptions),
					variantCombinationId: addBtn.dataset.variantCombinationId || undefined,
				};
				const productId = addBtn.dataset.productId ?? "";

				// Toggle-кнопки карточек (перенесено из bloom): повторный клик по товару,
				// который уже в корзине, удаляет его — и окно тогда не показываем.
				// Кнопки без data-cart-toggle (PDP, гидрация) всегда добавляют.
				if (addBtn.hasAttribute("data-cart-toggle")) {
					const existing = findCardLine(productId, variant);
					if (existing) {
						removeFromCart(existing.id);
						return;
					}
				}

				addToCart({
					productId,
					name: addBtn.dataset.name ?? "",
					price: addBtn.dataset.price ?? "0",
					oldPrice: addBtn.dataset.oldPrice,
					image: addBtn.dataset.image ?? "",
					quantity: Number(addBtn.dataset.quantity ?? "1"),
					variant,
				});

				// Флоу bloom, теперь общий (владелец, 15.09 — «да, везде окно»): после
				// добавления показываем окно «Товар добавлен в корзину», а сайдбар сам
				// НЕ открывается. Он остаётся доступен по иконке корзины в шапке.
				// Прежний in-button фидбек «Добавлено ✓» убран: под оверлеем окна его
				// не видно (решение владельца там же).
				if (addedModal.exists()) {
					const line = getCart().find((l) => l.id === makeLineId(productId, variant));
					addedModal.open({
						productId,
						name: addBtn.dataset.name ?? "",
						price: addBtn.dataset.price ?? "0",
						image: addBtn.dataset.image ?? "",
						volume: addBtn.dataset.volume || undefined,
						variantHtml: variantHtml(line?.variant ?? variant) || undefined,
						lineTotal: line ? line.price * line.quantity : undefined,
						oldLineTotal:
							line && typeof line.oldPrice === "number"
								? line.oldPrice * line.quantity
								: undefined,
						quantity: line?.quantity ?? 1,
						origin: addBtn,
					});
					return;
				}

				// Фолбэк для страниц БЕЗ разметки окна (тема ещё не подключила
				// компонент, одиночный preview/block): прежнее поведение — сайдбар,
				// кроме вида корзины «Страница».
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
		// Окно закрывается по Escape и при уходе со страницы (View Transitions):
		// иначе оверлей переживал бы навигацию и блокировал витрину.
		document.addEventListener("keydown", (event) => {
			if ((event as KeyboardEvent).key === "Escape") addedModal.close();
		});
		document.addEventListener("astro:before-swap", () => addedModal.close());
		window.addEventListener(evUpdated, () => {
			renderBadges();
			renderDrawer();
			syncProductCards();
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
			syncProductCards();
			// Само-лечение при client-side навигации (VT не перезапускает init-модуль).
			if (catalogUrl) void reconcileCart(catalogUrl);
			else void labelCart();
		});

		renderBadges();
		renderDrawer();
		syncProductCards();
		// Само-лечение цен/наличия из каталога → корзина всегда актуальна (= оформлению).
		// Без catalogUrl — только подпись вариантов (строки и цены не трогаем).
		if (catalogUrl) void reconcileCart(catalogUrl);
		else void labelCart();
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

// Выбор комбинации по умолчанию вынесен в модуль без зависимостей — его
// импортирует и серверный блок «Товар» (см. шапку variant-default.ts).
export { pickDefaultCombination } from "./variant-default";
export type { NtVariantCombinationLike, NtVariantGroupLike } from "./variant-default";

/**
 * То же правило выбора, но строкой — для `is:inline` скриптов.
 *
 * Каталожные порты тем (`packages/theme-<t>/blocks/Catalog/Catalog.astro`)
 * компилируются как `is:inline`: модульный `<script>` там НЕ собирается и даёт
 * 404 (об этом прямо сказано в самих портах). Импортировать `pickDefaultCombination`
 * туда нельзя, а копировать логику в четыре файла — ровно та «вторая
 * реализация», из-за которой баг и возвращался. Поэтому один исходник.
 */
export const PICK_DEFAULT_COMBINATION_SOURCE = `
(function () {
  if (window.__merfyPickDefaultCombination) return;
  window.__merfyPickDefaultCombination = function (combinations, groups) {
    var list = Array.isArray(combinations) ? combinations.filter(Boolean) : [];
    if (list.length === 0) return null;
    var first = {};
    var hasFirst = false;
    var gs = Array.isArray(groups) ? groups : [];
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i] || {};
      var name = typeof g.name === 'string' ? g.name.trim() : '';
      var values = g.options || g.values || [];
      var value = '';
      for (var j = 0; j < values.length; j++) {
        var v = typeof values[j] === 'string' ? values[j] : (values[j] && values[j].value);
        if (typeof v === 'string' && v.trim()) { value = v.trim(); break; }
      }
      if (name && value) { first[name] = value; hasFirst = true; }
    }
    if (hasFirst) {
      var fits = function (c) {
        var opts = (c && c.options) || {};
        for (var k in first) {
          if (!Object.prototype.hasOwnProperty.call(first, k)) continue;
          if (String(opts[k] || '').trim() !== first[k]) return false;
        }
        return true;
      };
      for (var a = 0; a < list.length; a++) if (fits(list[a]) && list[a].available !== false) return list[a];
      for (var b = 0; b < list.length; b++) if (fits(list[b])) return list[b];
    }
    for (var d = 0; d < list.length; d++) if (list[d].available !== false) return list[d];
    return list[0] || null;
  };
})();
`;
