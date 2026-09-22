import { initSectionReveals } from "./sections";
import { initCartDrawer } from "./cart-drawer";
import { initFaq } from "./faq";

// Подсказки поиска отсюда ушли (22.09): их строил ./search из демо-товаров,
// зашитых в сборку темы, и у настоящего магазина они показывали чужой
// ассортимент. Живой поиск шапки — общий модуль
// packages/theme-base/runtime/header-search (подключается в Header.astro).
const start = (): void => {
	initSectionReveals();
	initCartDrawer();
	initFaq();
};

if (document.readyState !== "loading") start();
else document.addEventListener("DOMContentLoaded", start);
