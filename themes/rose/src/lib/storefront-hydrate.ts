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
const PLACEHOLDER_IMAGE = "/images/placeholder.png";

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
 * Разметка карточки товара — зеркалит `RoseProductCard.astro` (article →
 * картинка-ссылка + name + price). Плоский `<img>` вместо `<RosePicture>`
 * (визуально идентично; webp-конвейер для MinIO-картинок не применяется).
 */
export function renderCardHtml(p: RealProduct): string {
	const href = escapeHtml(productHref(p));
	const name = escapeHtml(p.name);
	const image = escapeHtml(productImage(p));
	const price = escapeHtml(formatPrice(p.price));
	const oldRaw = formatPrice(p.oldPrice || p.compareAtPrice || null);
	const oldPrice = oldRaw
		? `<span class="rose-product-oldprice font-manrope !text-[14px] font-normal !leading-none text-[#999999] line-through">${escapeHtml(oldRaw)}</span>`
		: "";
	return `<article class="group flex w-full flex-col gap-5" data-nt="rose-product-card" aria-label="${name}">
	<a href="${href}" class="relative block aspect-[318/444] w-full overflow-hidden rounded-[8px] bg-white" aria-label="${name}">
		<img src="${image}" alt="${name}" width="318" height="444" loading="eager" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
	</a>
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
