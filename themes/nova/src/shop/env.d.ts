// Данные страницы магазина от рисовальщика (блок 4): сборщик кладёт их в Astro.locals.merfy.
declare namespace App {
	interface Locals {
		merfy?: import("../../../../packages/storefront-build/src/locals").ShopPageLocals;
		// Стенд темы в превью конструктора (блок 8): данные кладёт сборщик по запросу превью.
		merfyStand?: import("../../../../packages/storefront-build/src/locals").StandPageLocals;
	}
}
