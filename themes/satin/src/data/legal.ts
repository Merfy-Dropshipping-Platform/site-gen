export interface LegalPage {
	title: string;
}

export const legalPages = {
	delivery: { title: "Политика доставки" },
	return: { title: "Политика возврата" },
	terms: { title: "Условия обслуживания" },
	privacy: { title: "Политика конфиденциальности" },
} satisfies Record<string, LegalPage>;

export type LegalSlug = keyof typeof legalPages;
