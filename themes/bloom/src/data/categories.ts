export type CategorySlug = "skin-care" | "hair-care" | "cosmetics";

export interface CategoryPage {
	slug: CategorySlug;
	label: string;
	title: string;
	subtitle: string;
	href: string;
	description: string;
}

export const categoryPages: CategoryPage[] = [
	{
		slug: "skin-care",
		label: "Уход за кожей",
		title: "УХОД ЗА КОЖЕЙ",
		subtitle: "Здесь начинается персональный стиль",
		href: "/skin-care",
		description: "Уход за кожей Bloom: кремы, сыворотки и мягкие ежедневные ритуалы.",
	},
	{
		slug: "hair-care",
		label: "Уход за волосами",
		title: "УХОД ЗА ВОЛОСАМИ",
		subtitle: "Здесь начинается персональный стиль",
		href: "/hair-care",
		description: "Уход за волосами Bloom: питание, восстановление и сияние.",
	},
	{
		slug: "cosmetics",
		label: "Косметика",
		title: "КОСМЕТИКА",
		subtitle: "Здесь начинается персональный стиль",
		href: "/cosmetics",
		description: "Косметика Bloom для лёгкого сияния и повседневного образа.",
	},
];

export const DEFAULT_CATEGORY_HREF = "/skin-care";

export const getCategoryBySlug = (slug: CategorySlug) =>
	categoryPages.find((category) => category.slug === slug);
