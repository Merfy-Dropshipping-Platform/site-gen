/**
 * Option within a variant group (e.g. one colour or one size).
 * Mirrors `astroProducts[].variantGroups[].options[]` written by
 * `src/generator/build.service.ts` (stageFetchData → products.json).
 */
export interface ProductVariantOption {
	id: string | null;
	value: string;
	position: number;
	images: string[];
	swatchHex?: string | null;
}

/**
 * A group of variant options (e.g. "Цвет", "Размер").
 * Mirrors `astroProducts[].variantGroups[]`.
 */
export interface ProductVariantGroup {
	id: string | null;
	name: string; // "Цвет", "Размер"
	position: number;
	options: ProductVariantOption[];
}

/**
 * A concrete purchasable variant (combination of options).
 * Mirrors `astroProducts[].variants[]` (from variantCombinations).
 */
export interface ProductVariantCombination {
	id: string; // variantCombinationId
	title: string;
	price: string; // formatted like the demo, e.g. "5 990 ₽"
	compareAtPrice?: string;
	available: boolean;
	quantity: number;
	options: Record<string, string>; // { "Цвет": "Коричневый", "Размер": "M" }
}

/**
 * Convenience flat colour swatch — derived from the colour variant group.
 * Mirrors `astroProducts[].variantSwatches[]`.
 */
export interface ProductVariantSwatch {
	value: string;
	color: string | null;
	available: boolean;
}

export interface Product {
	name: string;
	price: string;
	oldPrice?: string;
	image: string;
	id?: string;
	discount?: boolean;
	// Real data (products.json from build.service.ts); optional → demo compiles without them
	description?: string;
	images?: string[];
	href?: string;
	slug?: string;
	quantity?: number | null;
	sku?: string | null;
	metaTitle?: string | null;
	metaDescription?: string | null;
	hasVariants?: boolean;
	variants?: ProductVariantCombination[];
	variantGroups?: ProductVariantGroup[];
	variantSwatches?: ProductVariantSwatch[];
}
