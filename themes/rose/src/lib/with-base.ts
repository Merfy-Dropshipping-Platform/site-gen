/**
 * Префикс пути статики для Astro base (`import.meta.env.BASE_URL`).
 * При деплое в подкаталоге (`/rose/`) превращает `/icons/x.svg` → `/rose/icons/x.svg`.
 */
export function withBase(absolutePath: string): string {
	const p = absolutePath.startsWith("/") ? absolutePath : `/${absolutePath}`;
	// Баг-репорт владельца (16.09, п.3): «иконка корзины на странице Корзина
	// сломалась» — /icons/menu-close.svg (кнопка «Удалить») отдавала 404 В
	// ПРЕВЬЮ конструктора. `import.meta.env.BASE_URL` — Astro-константа,
	// запечённая в бандл на `build:theme-preview` ("/", не "/__theme/<тема>/").
	// Витрину она не задевает (сайт владеет корнем "/"), но эта функция
	// вызывается из КЛИЕНТСКОГО скрипта (cart-thumb-html.ts собирает <img src>
	// в браузере при каждой отрисовке строки корзины) — то есть УЖЕ ПОСЛЕ
	// того, как серверный rewriteHtmlAssets/rewriteRootUrlsToPrefix переписал
	// статичный HTML ответа под /__theme/<тема>/. Рантайм-глобал
	// (preview.controller.injectPreviewGlobals) даёт верный префикс ИМЕННО в
	// превью; на витрине его нет — раньше запечённый BASE_URL остаётся
	// единственным источником.
	if (typeof window !== "undefined") {
		const runtimeBase = (window as unknown as { __MERFY_ASSET_BASE__?: string }).__MERFY_ASSET_BASE__;
		if (typeof runtimeBase === "string" && runtimeBase) {
			const rb = runtimeBase.endsWith("/") ? runtimeBase.slice(0, -1) : runtimeBase;
			return `${rb}${p}`;
		}
	}
	const raw = import.meta.env.BASE_URL ?? "/";
	const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;
	if (!base) return p;
	return `${base}${p}`;
}
