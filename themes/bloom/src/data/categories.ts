export type CategorySlug = "skin-care" | "hair-care" | "cosmetics";

export interface CategoryPage {
	slug: CategorySlug;
	label: string;
	title: string;
	subtitle: string;
	href: string;
	description: string;
}

// Владелец 25.09: «страницы только магазинные, без верстальщиков». slug/label/
// title/description верстальщика оставлены (используются для подписи и подбора
// категории товара), но href КАЖДОЙ категории и DEFAULT_CATEGORY_HREF ведут на
// /catalog — у /skin-care, /hair-care, /cosmetics своей страницы на витрине нет,
// у нового магазина это «не найдено».
export const categoryPages: CategoryPage[] = [
	{
		slug: "skin-care",
		label: "Уход за кожей",
		title: "УХОД ЗА КОЖЕЙ",
		subtitle: "Здесь начинается персональный стиль",
		href: "/catalog",
		description: "Уход за кожей Bloom: кремы, сыворотки и мягкие ежедневные ритуалы.",
	},
	{
		slug: "hair-care",
		label: "Уход за волосами",
		title: "УХОД ЗА ВОЛОСАМИ",
		subtitle: "Здесь начинается персональный стиль",
		href: "/catalog",
		description: "Уход за волосами Bloom: питание, восстановление и сияние.",
	},
	{
		slug: "cosmetics",
		label: "Косметика",
		title: "КОСМЕТИКА",
		subtitle: "Здесь начинается персональный стиль",
		href: "/catalog",
		description: "Косметика Bloom для лёгкого сияния и повседневного образа.",
	},
];

export const DEFAULT_CATEGORY_HREF = "/catalog";

export const getCategoryBySlug = (slug: CategorySlug) =>
	categoryPages.find((category) => category.slug === slug);
