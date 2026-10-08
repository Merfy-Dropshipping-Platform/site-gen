import type { StorefrontConfig } from "../../../../packages/storefront-config/src/index";
import { readStorefrontConfig } from "../../../../packages/storefront-config/src/read";

// Раздел «Конфиг магазина» на стенде (design.md блока 3, 5.6): читает тег #merfy-config так же, как будет читать
// каркас, и печатает четыре поля. Ошибка — текстом в разделе и в консоли: её видят и человек, и паспорт стенда.
// Читатель берётся отдельным входом src/read.ts — так в скрипт страницы не попадает zod.
const FIELDS: Record<string, (config: StorefrontConfig) => string> = {
	"shop.name": (config) => config.shop.name,
	mode: (config) => config.mode,
	"theme.version": (config) => config.theme.version,
	"page.id": (config) => config.page.id,
};

function showConfig(section: Element, config: StorefrontConfig): void {
	for (const field of section.querySelectorAll<HTMLElement>("[data-config-field]")) {
		const read = FIELDS[field.dataset.configField ?? ""];
		field.textContent = read === undefined ? "" : read(config);
	}
}

function showError(section: Element, error: unknown): void {
	const text = error instanceof Error ? error.message : String(error);
	const box = section.querySelector<HTMLElement>("[data-config-error]");
	if (box !== null) {
		box.textContent = text;
		box.hidden = false;
	}
	console.error(`Конфиг магазина: ${text}`);
}

export function renderConfigSection(section: Element): void {
	try {
		showConfig(section, readStorefrontConfig());
	} catch (error) {
		showError(section, error);
	}
}
