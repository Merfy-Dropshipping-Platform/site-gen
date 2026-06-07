export interface Collection {
	id: string;
	name: string;
	image: string;
}

export const collections: Collection[] = [
	{ id: "outerwear", name: "Верхняя одежда", image: "/images/4x/Коллекция_1.png" },
	{ id: "knitwear", name: "Джемперы и кардиганы", image: "/images/4x/Коллекция_2.png" },
	{ id: "tops", name: "Футболки и топы", image: "/images/4x/Коллекция_3.png" },
];

// Second collections block on the home page (Figma node 905:16221) — same
// layout, slightly different labels (3rd item is «Футболки и поло»).
export const collectionsSecondary: Collection[] = [
	{ id: "outerwear-2", name: "Верхняя одежда", image: "/images/4x/Коллекция_4.png" },
	{ id: "knitwear-2", name: "Джемперы и кардиганы", image: "/images/4x/Коллекция_5.png" },
	{ id: "polo-2", name: "Футболки и поло", image: "/images/4x/Коллекция_6.png" },
];
