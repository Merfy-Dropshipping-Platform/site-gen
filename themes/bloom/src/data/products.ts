import type { Product } from "../types/product";
import type { CategorySlug } from "./categories";

export interface CatalogProduct extends Product {
	colors: string[];
	collection?: string;
	category: CategorySlug;
	volume?: string;
	inStock: boolean;
	description: string;
	gallery: string[];
	sizes?: string[];
	brand?: string;
}

const trendImage = (n: 1 | 2 | 3 | 4 | 5 | 6) => `/images/trend-${n}.webp`;

export const catalogProducts: CatalogProduct[] = [
	{
		id: "bag-1",
		name: "Крем-флюид с гелевой текстурой",
		brand: "Bloom",
		price: "3 990 ₽",
		oldPrice: "4 440 ₽",
		discount: true,
		image: trendImage(1),
		gallery: [trendImage(1)],
		colors: ["pink"],
		collection: "HYDRO",
		category: "skin-care",
		volume: "50 мл",
		inStock: true,
		description:
			"Лёгкий крем-флюид с гелевой текстурой быстро впитывается и дарит коже увлажнение без липкости.",
	},
	{
		id: "bag-2",
		name: "Маска для волос",
		brand: "Bloom",
		price: "2 490 ₽",
		image: trendImage(2),
		gallery: [trendImage(2)],
		colors: ["pink"],
		collection: "DAILY",
		category: "hair-care",
		volume: "200 мл",
		inStock: true,
		description: "Питательная маска восстанавливает структуру волос и придаёт им мягкость.",
	},
	{
		id: "bag-3",
		name: "Крем для лица",
		brand: "Bloom",
		price: "2 690 ₽",
		image: trendImage(3),
		gallery: [trendImage(3)],
		colors: ["pink"],
		collection: "LIFT",
		category: "skin-care",
		volume: "50 мл",
		inStock: true,
		description: "Бережный крем для ежедневного ухода и комфорта кожи.",
	},
	{
		id: "bag-4",
		name: "Увлажняющее молочко",
		brand: "Bloom",
		price: "2 190 ₽",
		image: trendImage(4),
		gallery: [trendImage(4)],
		colors: ["pink"],
		collection: "HYDRO",
		category: "skin-care",
		volume: "150 мл",
		inStock: false,
		description: "Нежное молочко для интенсивного увлажнения.",
	},
	{
		id: "bag-5",
		name: "Блеск для губ",
		brand: "Bloom",
		price: "1 190 ₽",
		image: trendImage(5),
		gallery: [trendImage(5)],
		colors: ["pink", "light-pink", "white"],
		collection: "DAILY",
		category: "cosmetics",
		volume: "7 мл",
		inStock: true,
		description: "Компактный блеск с комфортной текстурой и лёгким сиянием.",
	},
	{
		id: "bag-6",
		name: "Сыворотка для лица",
		brand: "Bloom",
		price: "3 490 ₽",
		oldPrice: "3 990 ₽",
		discount: true,
		image: trendImage(6),
		gallery: [trendImage(6)],
		colors: ["pink"],
		collection: "HYDRO",
		category: "skin-care",
		volume: "30 мл",
		inStock: true,
		description: "Концентрированная сыворотка для сияния и упругости кожи.",
	},
	{
		id: "bag-7",
		name: "Тоник для лица",
		brand: "Bloom",
		price: "1 890 ₽",
		image: trendImage(1),
		gallery: [trendImage(1)],
		colors: ["pink"],
		collection: "LIFT",
		category: "skin-care",
		volume: "120 мл",
		inStock: true,
		description: "Освежающий тоник для ежедневного ухода.",
	},
	{
		id: "bag-8",
		name: "Ночной крем",
		brand: "Bloom",
		price: "3 290 ₽",
		oldPrice: "3 790 ₽",
		discount: true,
		image: trendImage(2),
		gallery: [trendImage(2)],
		colors: ["pink"],
		collection: "DAILY",
		category: "skin-care",
		volume: "50 мл",
		inStock: true,
		description: "Ночной уход для восстановления и мягкости кожи.",
	},
];

export const getProductById = (id: string) => catalogProducts.find((p) => p.id === id);
