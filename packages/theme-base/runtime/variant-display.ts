/**
 * Как секция «Товар» показывает варианты: «Стиль» (кнопки или список) и
 * «Вариации» (форма образца: круг, квадрат или без образца — словом).
 *
 * Одно правило для всех, кто обязан выглядеть как страница товара:
 *   • сама страница — theme-base `Product.astro` и порт flux `FeaturedProduct`;
 *   • сборка витрины и превью конструктора — они кладут форму глобалом
 *     `window.__MERFY_VARIANT_SWATCH__` на КАЖДУЮ страницу, и по нему корзина
 *     рисует цвет варианта кружком, квадратиком или словом.
 * Владелец, 23.09: «если там кружок — то кружок, если квадратик — то
 * квадратик… как карточка товара».
 *
 * Поля независимы и разрешаются независимо (Figma 1:21431). Старые ревизии
 * держат одно поле `style` (button/circle/square/list) без `displayStyle` и
 * `shape` — его раскладываем на те же две оси.
 *
 * Модуль без зависимостей: его импортирует и серверный фронтматтер блока, и
 * сервис sites (сборка, превью).
 */
export type VariantDisplayStyle = "button" | "list";
export type VariantSwatchShape = "circle" | "square" | "none";

export interface VariantDisplay {
	displayStyle: VariantDisplayStyle;
	shape: VariantSwatchShape;
}

const DISPLAY_STYLES: readonly VariantDisplayStyle[] = ["button", "list"];
const SWATCH_SHAPES: readonly VariantSwatchShape[] = ["circle", "square", "none"];

/** Legacy `style` → ось «Стиль». Остальные значения стиля не задают. */
const LEGACY_DISPLAY = new Map<string, VariantDisplayStyle>([["list", "list"]]);
/** Legacy `style` → ось «Вариации». */
const LEGACY_SHAPE = new Map<string, VariantSwatchShape>([
	["circle", "circle"],
	["square", "square"],
]);

const DEFAULTS: VariantDisplay = { displayStyle: "button", shape: "none" };

const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
	allowed.find((a) => a === value);

/** Пропы `variants` секции «Товар» → как страница товара рисует варианты. */
export function resolveVariantDisplay(variants: unknown): VariantDisplay {
	const v = (variants && typeof variants === "object" ? variants : {}) as {
		displayStyle?: unknown;
		style?: unknown;
		shape?: unknown;
	};
	const legacy = typeof v.style === "string" ? v.style : "";
	return {
		displayStyle: pick(v.displayStyle, DISPLAY_STYLES) ?? LEGACY_DISPLAY.get(legacy) ?? DEFAULTS.displayStyle,
		shape: pick(v.shape, SWATCH_SHAPES) ?? LEGACY_SHAPE.get(legacy) ?? DEFAULTS.shape,
	};
}

/** Секция «Товар» страницы товара в ревизии сайта (`pagesData.page-product`). */
function productSection(revisionData: unknown): { props?: { variants?: unknown } } | undefined {
	const pages = (revisionData as { pagesData?: Record<string, { content?: unknown }> } | null)?.pagesData;
	const content = pages?.["page-product"]?.content;
	if (!Array.isArray(content)) return undefined;
	return content.find((b) => (b as { type?: unknown } | null)?.type === "Product") as
		| { props?: { variants?: unknown } }
		| undefined;
}

/**
 * Форма образца на странице товара этого сайта — значение глобала
 * `__MERFY_VARIANT_SWATCH__`. null, если в ревизии нет секции «Товар»:
 * тогда глобал не ставится и корзина берёт форму по умолчанию.
 */
export function variantSwatchShapeFromRevision(revisionData: unknown): VariantSwatchShape | null {
	const section = productSection(revisionData);
	return section ? resolveVariantDisplay(section.props?.variants).shape : null;
}
