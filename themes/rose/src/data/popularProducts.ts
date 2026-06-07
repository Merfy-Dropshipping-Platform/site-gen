import type { Product } from "../types/product";

export const popularProducts: Product[] = [
	{
		id: "bag-1",
		name: "Сумка",
		price: "5 990₽",
		oldPrice: "7 990₽",
		discount: true,
		image: "/images/Товар_1.png",
	},
	{
		id: "bag-2",
		name: "Сумка",
		price: "5 990₽",
		discount: false,
		image: "/images/Товар_2.png",
	},
	{
		id: "bag-3",
		name: "Сумка",
		price: "5 990₽",
		discount: false,
		image: "/images/Товар_3.png",
	},
	{
		id: "bag-4",
		name: "Сумка",
		price: "5 990₽",
		oldPrice: "7 990₽",
		discount: true,
		image: "/images/Товар_4.png",
	},
];
