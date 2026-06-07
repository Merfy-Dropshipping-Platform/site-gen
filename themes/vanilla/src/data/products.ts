import type { Product } from "../types/product";
import { V_IMG, vanillaDemoGallery, vanillaDemoImage } from "./imageAssets";

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
		name: "Подушки декоративные комплект 2 шт.",
		brand: "Vanilla",
		price: "1 940₽",
		oldPrice: "2 290₽",
		discount: true,
		image: V_IMG.popularProduct(1),
		gallery: [V_IMG.popularProduct(1)],
		colors: ["olive"],
		collection: "Текстиль",
		inStock: true,
		description:
			"Мягкий комплект декоративных подушек в глубоком зелёном оттенке. Подходит для дивана, кресла или спальни и легко добавляет интерьеру спокойный акцент.",
	},
	{
		id: "bag-2",
		name: "Ваза Vanilla",
		brand: "Vanilla",
		price: "1 490₽",
		image: V_IMG.popularProduct(2),
		gallery: [V_IMG.popularProduct(2)],
		colors: ["olive"],
		collection: "Декор",
		inStock: true,
		description: "Керамическая ваза спокойного зелёного оттенка для живых веток, сухоцветов или самостоятельного декоративного акцента.",
	},
	{
		id: "bag-3",
		name: "Покрывало шерстяное",
		brand: "Vanilla",
		price: "2 940₽",
		image: V_IMG.catalogTextile(2),
		gallery: [V_IMG.catalogTextile(2)],
		colors: ["olive"],
		collection: "Текстиль",
		inStock: true,
		description: "Плотное шерстяное покрывало с мягкой фактурой. Согревает, красиво драпируется и делает комнату визуально теплее.",
	},
	{
		id: "bag-4",
		name: "Мягкий плед",
		brand: "Vanilla",
		price: "2 940₽",
		image: V_IMG.catalogTextile(3),
		gallery: [V_IMG.catalogTextile(3)],
		colors: ["gray"],
		collection: "Текстиль",
		inStock: true,
		description: "Лёгкий плед приглушённого шалфейного оттенка для спальни, гостиной или тихих вечеров с книгой.",
	},
	{
		id: "bag-5",
		name: "Комплект постельного белья",
		brand: "Vanilla",
		price: "2 940₽",
		image: V_IMG.catalogTextile(4),
		gallery: [
			V_IMG.catalogTextile(4),
			V_IMG.popularProduct(5),
			V_IMG.popularProduct(4),
			V_IMG.catalogTextile(1),
			V_IMG.catalogTextile(2),
		],
		colors: ["olive", "white"],
		collection: "Текстиль",
		inStock: true,
		description:
			"Комплект постельного белья из приятной ткани с глубоким зелёным акцентом. Создаёт ощущение собранной и спокойной спальни — мягкая фактура, спокойная палитра и аккуратная посадка по размеру.",
	},
	{
		id: "bag-6",
		name: "Кашпо для растений",
		brand: "Vanilla",
		price: "1 290₽",
		image: V_IMG.catalogDecor(2),
		gallery: [V_IMG.catalogDecor(2)],
		colors: ["white"],
		collection: "Декор",
		inStock: true,
		description: "Минималистичное кашпо для комнатных растений. Нейтральный оттенок подчёркивает зелень и подходит к светлым интерьерам.",
	},
	{
		id: "bag-7",
		name: "Покрывало шерстяное",
		brand: "Vanilla",
		price: "2 590₽",
		image: vanillaDemoImage(6),
		gallery: vanillaDemoGallery(6),
		colors: ["olive"],
		collection: "Текстиль",
		inStock: true,
		description: "Покрывало из мягкой шерстяной смеси для гостиной или спальни.",
	},
	{
		id: "bag-8",
		name: "Мягкий плед",
		brand: "Vanilla",
		price: "2 990₽",
		image: vanillaDemoImage(7),
		gallery: vanillaDemoGallery(7),
		colors: ["gray"],
		collection: "Текстиль",
		inStock: true,
		description: "Нежный плед с ворсом и бахромой в спокойной природной гамме.",
	},
];

export const getProductById = (id: string) => catalogProducts.find((p) => p.id === id);
