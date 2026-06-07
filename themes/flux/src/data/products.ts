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
		id: "m-phone-17",
		name: "M Phone 17",
		brand: "Flux",
		price: "140 990₽",
		oldPrice: "155 990₽",
		discount: true,
		image: "/images/4x/Товар_1.png",
		gallery: [
			"/images/4x/Товар_1.png",
			"/images/4x/Товар_5__2_.png",
			"/images/4x/Товар_5__3_.png",
			"/images/4x/Товар_5__4_.png",
		],
		colors: ["silver", "blue"],
		collection: "Смартфоны",
		inStock: true,
		description:
			"Флагманская камера, мощный чип и автономность на весь день. Корпус из металла и стекла с матовой текстурой.",
	},
	{
		id: "m-phone-17-pro",
		name: "M Phone 17 Pro",
		brand: "Flux",
		price: "120 490₽",
		oldPrice: "165 970₽",
		discount: true,
		image: "/images/4x/Товар_2.png",
		gallery: ["/images/4x/Товар_2.png"],
		colors: ["blue", "silver"],
		collection: "Смартфоны",
		inStock: true,
		description: "Профессиональная съёмка и плавный интерфейс 120 Гц для работы и развлечений без компромиссов.",
	},
	{
		id: "m-headphones-2s",
		name: "M Headphones 2s",
		brand: "Flux",
		price: "20 990₽",
		image: "/images/4x/Товар_3.png",
		gallery: ["/images/4x/Товар_3.png"],
		colors: ["white"],
		collection: "Наушники",
		inStock: true,
		description: "Активное шумоподавление и объёмный звук в компактном кейсе.",
	},
	{
		id: "m-phone-16",
		name: "M Phone 16",
		brand: "Flux",
		price: "104 990₽",
		oldPrice: "155 990₽",
		discount: true,
		image: "/images/4x/Товар_4.png",
		gallery: ["/images/4x/Товар_4.png"],
		colors: ["graphite"],
		collection: "Смартфоны",
		inStock: true,
		description: "Оптимальный баланс производительности и цены для повседневных задач.",
	},
	{
		id: "m-headphones-2",
		name: "M Headphones 2",
		brand: "Flux",
		price: "19 990₽",
		image: "/images/4x/Товар_5.png",
		gallery: ["/images/4x/Товар_5.png"],
		colors: ["white"],
		collection: "Наушники",
		inStock: true,
		description: "Лёгкая посадка и чистый звук для длительных звонков и музыки.",
	},
	{
		id: "m-phone-15",
		name: "M Phone 15",
		brand: "Flux",
		price: "89 990₽",
		image: "/images/4x/Товар_6.png",
		gallery: ["/images/4x/Товар_6.png"],
		colors: ["graphite"],
		collection: "Смартфоны",
		inStock: true,
		description: "Надёжный смартфон с качественной камерой и быстрым интерфейсом.",
	},
	{
		id: "m-laptop-air",
		name: "M Laptop Air",
		brand: "Flux",
		price: "159 990₽",
		image: "/images/4x/Товар_7.png",
		gallery: ["/images/4x/Товар_7.png"],
		colors: ["silver"],
		collection: "Ноутбуки",
		inStock: true,
		description: "Лёгкий ноутбук для работы в дороге, до 18 часов автономной работы.",
	},
	{
		id: "m-speaker-mini",
		name: "M Speaker Mini",
		brand: "Flux",
		price: "34 990₽",
		image: "/images/4x/Товар_8.png",
		gallery: ["/images/4x/Товар_8.png"],
		colors: ["black"],
		collection: "Аксессуары",
		inStock: true,
		description: "Компактная акустика с глубоким басом и голосовым управлением.",
	},
];

export const getProductById = (id: string) => catalogProducts.find((p) => p.id === id);
