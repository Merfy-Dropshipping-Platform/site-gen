export interface Collection {
	id: string;
	name: string;
	image: string;
}

export const collections: Collection[] = [
	{ id: "women", name: "Женское", image: "/images/4x/Коллекция_1.png" },
	{ id: "men", name: "Мужское", image: "/images/4x/Коллекция_2.png" },
	{ id: "summer", name: "Лето 25", image: "/images/4x/Коллекция_3.png" },
];
