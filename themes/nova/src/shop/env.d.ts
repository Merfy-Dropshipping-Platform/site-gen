// Данные страницы магазина от рисовальщика (блок 4): сборщик кладёт их в Astro.locals.merfy.
declare namespace App {
	interface Locals {
		merfy?: import("../../../../packages/storefront-build/src/locals").ShopPageLocals;
	}
}
