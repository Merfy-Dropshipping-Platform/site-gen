export interface Collection {
	id: string;
	name: string;
	image: string;
}

export const collections: Collection[] = [
	{ id: "outerwear", name: "Верхняя одежда", image: "/placeholders/landscape-iwt.png" },
	{ id: "knitwear", name: "Джемперы и кардиганы", image: "/placeholders/landscape-gallery.png" },
	{ id: "tops", name: "Футболки и топы", image: "/placeholders/landscape-image.png" },
];

// Second collections block on the home page (Figma node 905:16221) — same
// layout, slightly different labels (3rd item is «Футболки и поло»).
export const collectionsSecondary: Collection[] = [
	{ id: "outerwear-2", name: "Верхняя одежда", image: "/placeholders/landscape-multirows-image.png" },
	{ id: "knitwear-2", name: "Джемперы и кардиганы", image: "/placeholders/landscape-slideshow.png" },
	{ id: "polo-2", name: "Футболки и поло", image: "/placeholders/landscape-iwt.png" },
];
