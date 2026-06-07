import type { Product } from "../types/product";

/** Единое описание для всех сумок Rose — текст из PDP в Figma. */
export const ROSE_BAG_PRODUCT_DESCRIPTION =
	"Ощути уверенность и свободу в каждом движении — выбери сумку, которая станет вашим акцентом и заявит о стиле без слов. Закажите сейчас, чтобы дополнить образ элегантной деталью, которая подчеркнёт вашу индивидуальность и придаст уверенности в любой ситуации. Не откладывайте: ваш идеальный аксессуар уже ждёт вас!";

/** Только для подстраницы товара — три PNG в `public/images/Tovar_<n>/`. Витрина использует поле `image`. */
export const tovarGallery = (n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): string[] => {
	const base = `/images/Tovar_${n}`;
	return [`${base}/1.png`, `${base}/2.png`, `${base}/3.png`];
};

export interface CatalogProduct extends Product {
	colors: string[];
	collection?: string;
	inStock: boolean;
	description: string;
	gallery: string[];
	sizes?: string[];
	brand?: string;
}

export const catalogProducts: CatalogProduct[] = [
	{
		id: "bag-1",
		name: "Сумка",
		brand: "Rosaline",
		price: "5 990 ₽",
		oldPrice: "7 990 ₽",
		discount: true,
		image: "/images/Товар_1.png",
		gallery: tovarGallery(1),
		colors: ["brown"],
		collection: "RIVIERA",
		inStock: true,
		description: ROSE_BAG_PRODUCT_DESCRIPTION,
	},
	{
		id: "bag-2",
		name: "Сумка",
		brand: "Rosaline",
		price: "5 990 ₽",
		oldPrice: "7 990 ₽",
		discount: true,
		image: "/images/Товар_2.png",
		gallery: tovarGallery(2),
		colors: ["brown"],
		collection: "URBAN",
		inStock: true,
		description: ROSE_BAG_PRODUCT_DESCRIPTION,
	},
	{
		id: "bag-3",
		name: "Сумка",
		brand: "Rosaline",
		price: "5 990 ₽",
		oldPrice: "7 990 ₽",
		discount: true,
		image: "/images/Товар_3.png",
		gallery: tovarGallery(3),
		colors: ["white"],
		collection: "FUTURISM",
		inStock: true,
		description: ROSE_BAG_PRODUCT_DESCRIPTION,
	},
	{
		id: "bag-4",
		name: "Сумка",
		brand: "Rosaline",
		price: "5 990 ₽",
		oldPrice: "7 990 ₽",
		discount: true,
		image: "/images/Товар_4.png",
		gallery: tovarGallery(4),
		colors: ["brown"],
		collection: "RIVIERA",
		inStock: true,
		description: ROSE_BAG_PRODUCT_DESCRIPTION,
	},
	{
		id: "bag-5",
		name: "Сумка",
		brand: "Rosaline",
		price: "5 990 ₽",
		oldPrice: "7 990 ₽",
		discount: true,
		image: "/images/Товар_5.png",
		gallery: tovarGallery(5),
		colors: ["brown"],
		collection: "URBAN",
		inStock: true,
		description: ROSE_BAG_PRODUCT_DESCRIPTION,
	},
	{
		id: "bag-6",
		name: "Сумка",
		brand: "Rosaline",
		price: "5 990 ₽",
		oldPrice: "7 990 ₽",
		discount: true,
		image: "/images/Товар_6.png",
		gallery: tovarGallery(6),
		colors: ["brown"],
		collection: "RIVIERA",
		inStock: true,
		description: ROSE_BAG_PRODUCT_DESCRIPTION,
	},
	{
		id: "bag-7",
		name: "Сумка",
		brand: "Rosaline",
		price: "5 990 ₽",
		oldPrice: "7 990 ₽",
		discount: true,
		image: "/images/Товар_7.png",
		gallery: tovarGallery(7),
		colors: ["olive"],
		collection: "FUTURISM",
		inStock: true,
		description: ROSE_BAG_PRODUCT_DESCRIPTION,
	},
	{
		id: "bag-8",
		name: "Сумка",
		brand: "Rosaline",
		price: "5 990 ₽",
		oldPrice: "7 990 ₽",
		discount: true,
		image: "/images/Товар_8.png",
		gallery: tovarGallery(8),
		colors: ["black"],
		collection: "URBAN",
		inStock: true,
		description: ROSE_BAG_PRODUCT_DESCRIPTION,
	},
];

export const getProductById = (id: string) => catalogProducts.find((p) => p.id === id);
