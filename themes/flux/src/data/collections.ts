export interface Collection {
	id: string;
	name: string;
	image: string;
}

export const collections: Collection[] = [
	{ id: "phones", name: "Смартфоны", image: "/images/4x/Коллекция_1.png" },
	{ id: "headphones", name: "Наушники", image: "/images/4x/Коллекция_2.png" },
	{ id: "laptops", name: "Ноутбуки", image: "/images/4x/Коллекция_3.png" },
];
