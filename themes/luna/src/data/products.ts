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
		brand: "Luna",
		price: "6 990 ₽",
		oldPrice: "9 990 ₽",
		discount: true,
		image: "/images/4x/Товар_1.png",
		gallery: ["/images/4x/Товар_1.png", "/images/4x/Товар_5__2_.png", "/images/4x/Товар_5__3_.png", "/images/4x/Товар_5__4_.png"],
		colors: ["blue", "black", "gray"],
		collection: "Женское",
		inStock: true,
		description: "Базовые джинсы с прямым кроем из плотного денима. Легко комбинируются с повседневными и вечерними образами.",
	},
	{
		id: "sport-suit-w",
		name: "Женский спортивный костюм",
		brand: "Luna",
		price: "8 990 ₽",
		image: "/images/4x/Товар_2.png",
		gallery: ["/images/4x/Товар_2.png", "/images/4x/Товар_6.png", "/images/4x/Товар_7.png", "/images/4x/Товар_8.png"],
		colors: ["brown", "black", "gray"],
		collection: "Женское",
		inStock: true,
		sizes: ["XS", "S", "M"],
		description: "Мягкий хлопковый комплект из худи и брюк. Комфортная посадка и лаконичный силуэт на каждый день.",
	},
	{
		id: "jumper-w",
		name: "Джемпер женский",
		brand: "Luna",
		price: "3 490 ₽",
		oldPrice: "4 990 ₽",
		discount: true,
		image: "/images/4x/Товар_3.png",
		gallery: ["/images/4x/Товар_3.png"],
		colors: ["white", "gray"],
		collection: "Женское",
		inStock: true,
		description: "Легкий джемпер из смесовой пряжи. Универсальная модель для межсезонья.",
	},
	{
		id: "jumper-w-2",
		name: "Джемпер женский",
		brand: "Luna",
		price: "3 490 ₽",
		oldPrice: "4 990 ₽",
		image: "/images/4x/Товар_4.png",
		gallery: ["/images/4x/Товар_4.png"],
		colors: ["gray"],
		collection: "Женское",
		inStock: true,
		description: "Минималистичный силуэт и нейтральный цвет для базового гардероба.",
	},
	{
		id: "jacket-m",
		name: "Куртка мужская",
		brand: "Luna",
		price: "12 990 ₽",
		image: "/images/4x/Товар_5.png",
		gallery: ["/images/4x/Товар_5.png"],
		colors: ["black"],
		collection: "Мужское",
		inStock: true,
		description: "Легкая куртка с ветрозащитной тканью и аккуратной фурнитурой.",
	},
	{
		id: "hoodie-m",
		name: "Худи мужское",
		brand: "Luna",
		price: "5 990 ₽",
		image: "/images/4x/Товар_6.png",
		gallery: ["/images/4x/Товар_6.png"],
		colors: ["black", "white"],
		collection: "Мужское",
		inStock: true,
		description: "Худи свободного кроя из плотного футера для комфортного ежедневного образа.",
	},
	{
		id: "tee-m",
		name: "Футболка мужская",
		brand: "Luna",
		price: "2 490 ₽",
		image: "/images/4x/Товар_7.png",
		gallery: ["/images/4x/Товар_7.png"],
		colors: ["black", "white"],
		collection: "Мужское",
		inStock: true,
		description: "Базовая футболка из хлопка с мягкой фактурой и прямым силуэтом.",
	},
	{
		id: "cardigan-w",
		name: "Кардиган женский",
		brand: "Luna",
		price: "4 990 ₽",
		image: "/images/4x/Товар_8.png",
		gallery: ["/images/4x/Товар_8.png"],
		colors: ["gray", "beige"],
		collection: "Женское",
		inStock: true,
		description: "Мягкий кардиган для многослойных образов в прохладный сезон.",
	},
];

export const getProductById = (id: string) => catalogProducts.find((p) => p.id === id);
