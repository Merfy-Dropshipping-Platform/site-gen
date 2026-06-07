import { initSectionReveals } from "./sections";
import { initSearch } from "./search";
import { initCartDrawer } from "./cart-drawer";
import { initFaq } from "./faq";

const start = (): void => {
	initSectionReveals();
	initSearch();
	initCartDrawer();
	initFaq();
};

if (document.readyState !== "loading") start();
else document.addEventListener("DOMContentLoaded", start);
