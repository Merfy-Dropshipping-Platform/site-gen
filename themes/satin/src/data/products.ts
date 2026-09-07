import type { Product } from "../types/product";

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
		id: "jeans-w",
		name: "Джинсы женские",
		brand: "Satin",
		price: "6 990 ₽",
		oldPrice: "9 990 ₽",
		discount: true,
		image: "/placeholders/sweater-blue.svg",
		gallery: ["/placeholders/sweater-blue.svg", "/placeholders/sweater-yellow.svg", "/placeholders/sweater-red.svg", "/placeholders/sweater-green.svg"],
		colors: ["blue", "black", "gray"],
		collection: "Женское",
		inStock: true,
		description: "Базовые джинсы с прямым кроем из плотного денима. Легко комбинируются с повседневными и вечерними образами.",
	},
	{
		id: "sport-suit-w",
		name: "Женский спортивный костюм",
		brand: "Satin",
		price: "8 990 ₽",
		image: "/placeholders/sweater-yellow.svg",
		gallery: ["/placeholders/sweater-yellow.svg", "/placeholders/sweater-blue.svg"],
		colors: ["brown", "black", "gray"],
		collection: "Женское",
		inStock: true,
		sizes: ["XS", "S", "M"],
		description: "Мягкий хлопковый комплект из худи и брюк. Комфортная посадка и лаконичный силуэт на каждый день.",
	},
	{
		id: "jumper-w",
		name: "Джемпер женский",
		brand: "Satin",
		price: "3 490 ₽",
		oldPrice: "4 990 ₽",
		discount: true,
		image: "/placeholders/sweater-red.svg",
		gallery: ["/placeholders/sweater-red.svg"],
		colors: ["white", "gray"],
		collection: "Женское",
		inStock: true,
		description: "Легкий джемпер из смесовой пряжи. Универсальная модель для межсезонья.",
	},
	{
		id: "jumper-m",
		name: "Джемпер мужской",
		brand: "Satin",
		price: "14 990 ₽",
		oldPrice: "16 490 ₽",
		discount: true,
		image: "/placeholders/sweater-green.svg",
		gallery: ["/placeholders/sweater-green.svg"],
		colors: ["gray"],
		collection: "Мужское",
		inStock: true,
		description: "Тёплый джемпер на молнии из мягкой смесовой пряжи. Воротник-стойка и плотная вязка держат форму.",
	},
	{
		id: "jeans-ripped-m",
		name: "Рваные джинсы мужские",
		brand: "Satin",
		price: "3 490 ₽",
		oldPrice: "4 990 ₽",
		discount: true,
		image: "/placeholders/sweater-blue.svg",
		gallery: ["/placeholders/sweater-blue.svg"],
		colors: ["blue", "black"],
		collection: "Мужское",
		inStock: true,
		description: "Прямые джинсы из плотного денима с потёртостями. Универсальная база для повседневных образов.",
	},
	{
		id: "sport-suit-m",
		name: "Мужской спортивный костюм",
		brand: "Satin",
		price: "8 990 ₽",
		image: "/placeholders/sweater-yellow.svg",
		gallery: ["/placeholders/sweater-yellow.svg"],
		colors: ["black"],
		collection: "Мужское",
		inStock: true,
		description: "Комплект из худи и брюк из плотного футера. Свободный крой и лаконичный чёрный цвет.",
	},
	{
		id: "tee-m",
		name: "Футболка мужская",
		brand: "Satin",
		price: "2 490 ₽",
		image: "/placeholders/sweater-red.svg",
		gallery: ["/placeholders/sweater-red.svg"],
		colors: ["black", "white"],
		collection: "Мужское",
		inStock: true,
		description: "Базовая футболка из хлопка с мягкой фактурой и прямым силуэтом.",
	},
	{
		id: "cardigan-w",
		name: "Кардиган женский",
		brand: "Satin",
		price: "4 990 ₽",
		image: "/placeholders/sweater-red.svg",
		gallery: ["/placeholders/sweater-red.svg"],
		colors: ["gray", "beige"],
		collection: "Женское",
		inStock: true,
		description: "Мягкий кардиган для многослойных образов в прохладный сезон.",
	},
];

export const getProductById = (id: string) => catalogProducts.find((p) => p.id === id);
