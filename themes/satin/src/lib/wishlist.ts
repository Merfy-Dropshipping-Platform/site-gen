/**
 * Избранное (wishlist) Satin — порт пилот-эталона rose
 * ({@link ../../../rose/src/lib/wishlist.ts}), адаптированный под айдентику satin:
 * монохром, ОСТРЫЕ углы (radius 0), сердце-акцент = кнопочный токен (чёрный в
 * светлых схемах / белый в тёмных). Хранит список productId в localStorage, шлёт
 * CustomEvent при изменении и экспортирует {@link initWishlistUI} — глобальный
 * document-делегат (зеркало `initCartUI` корзины satin), который перерисовывает
 * состояние всех кнопок-сердец и бейджей.
 *
 * Контракт data-атрибутов общий с rose (`[data-wishlist-toggle][data-product-id]`,
 * `[data-wishlist-count]`); per-theme меняется ТОЛЬКО префикс хранения/события и
 * имя глобала. Это заменяет прежний satin-механизм `[data-fav-toggle]` /
 * `satin-favourites` (один механизм вместо двух).
 *
 * Дизайн под satin: сердце берёт геометрию из public/icons/favourite.svg
 * (viewBox 0 0 32 32, тот же path), но рендерится ИНЛАЙН-SVG (а не <img> как
 * NtIcon) — иначе нельзя переключать fill (пусто ↔ залито) и красить в токен темы.
 */

// ── Контракт хранения (per-theme; для портов меняется только префикс) ──
const STORAGE_KEY = "satin:wishlist:v1";
const EVT_UPDATED = "satin:wishlist:updated";

// Глобал для inline-скриптов (renderCardHtml каталога / гидрация PDP не могут
// импортировать этот модуль — читают состояние синхронно через window). Зеркалит
// то, как каталог satin читает window.cartStore.
declare global {
	interface Window {
		__satinWishlist?: SatinWishlistApi;
		__satinWishlistBound?: boolean;
	}
}

export interface SatinWishlistApi {
	getAll(): string[];
	has(id: string): boolean;
	add(id: string): void;
	remove(id: string): void;
	toggle(id: string): boolean;
	clear(): void;
	count(): number;
	/** Инлайн-SVG сердца (filled/outline) — для использования в inline-строках
	 *  карточки/PDP, чтобы вид сердца был единым источником. */
	heartSvg(filled: boolean): string;
	readonly events: { updated: string };
}

const safeParse = (raw: string | null): string[] => {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
	} catch {
		return [];
	}
};

const getAll = (): string[] => {
	if (typeof window === "undefined") return [];
	return safeParse(window.localStorage.getItem(STORAGE_KEY));
};

const save = (ids: string[]) => {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
	window.dispatchEvent(new CustomEvent(EVT_UPDATED, { detail: ids }));
};

const has = (id: string): boolean => (id ? getAll().includes(id) : false);

const add = (id: string) => {
	if (!id) return;
	const ids = getAll();
	if (!ids.includes(id)) {
		ids.push(id);
		save(ids);
	}
};

const remove = (id: string) => {
	if (!id) return;
	save(getAll().filter((x) => x !== id));
};

/** toggle → возвращает НОВОЕ состояние (true = теперь в избранном). */
const toggle = (id: string): boolean => {
	if (!id) return false;
	const ids = getAll();
	if (ids.includes(id)) {
		save(ids.filter((x) => x !== id));
		return false;
	}
	ids.push(id);
	save(ids);
	return true;
};

const clear = () => save([]);

const count = (): number => getAll().length;

/**
 * Инлайн-SVG сердца satin. Геометрия = public/icons/favourite.svg (viewBox
 * 0 0 32 32, та же группа translate(4.22 5.867) + path, stroke-width 1.6).
 * filled → залито кнопочным токеном (чёрный в светлых схемах, белый в тёмных);
 * outline → только обводка (currentColor наследуется от кнопки). aria-hidden —
 * декоративная, подпись несёт сама кнопка (aria-label / aria-pressed).
 */
const heartSvg = (filled: boolean): string => {
	const fill = filled ? "rgb(var(--color-button-bg,0 0 0))" : "none";
	const stroke = filled ? "rgb(var(--color-button-bg,0 0 0))" : "currentColor";
	return (
		'<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">' +
		'<g transform="translate(4.22 5.867)">' +
		'<path d="M10.0342 18.882C6.93786 16.5652 0.8 11.2695 0.8 6.50305C0.8 3.35396 3.11131 0.8 6.29004 0.8C7.93705 0.8 9.58406 1.349 11.7801 3.54502C13.9761 1.349 15.6231 0.8 17.2701 0.8C20.4488 0.8 22.7601 3.35396 22.7601 6.50305C22.7601 11.2684 16.6223 16.5652 13.5259 18.882C12.4828 19.6616 11.0773 19.6616 10.0342 18.882Z" ' +
		'fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
		"</g></svg>"
	);
};

export const wishlist: SatinWishlistApi = {
	getAll,
	has,
	add,
	remove,
	toggle,
	clear,
	count,
	heartSvg,
	events: { updated: EVT_UPDATED },
};

// ── Реэкспорты (зеркалит cart.ts: тонкий публичный API над инстансом) ──
export { getAll as getWishlist, has as hasWishlist, toggle as toggleWishlist };
export const getWishlistCount = count;

/**
 * initWishlistUI — глобальный делегат избранного (зеркало initCartUI):
 *  • клик по [data-wishlist-toggle] → читает data-product-id → toggle →
 *    мгновенно перерисовывает САМ нажатый control (без ожидания ре-рендера грида);
 *  • на событие satin:wishlist:updated перерисовывает ВСЕ кнопки-сердца
 *    (aria-pressed + filled/outline) и ВСЕ бейджи [data-wishlist-count];
 *  • выставляет window.__satinWishlist для inline-скриптов карточки/PDP.
 *
 * Идемпотентен (флаг на window) — безопасно звать на каждой странице и после
 * View Transitions (astro:page-load).
 */
export const initWishlistUI = (): void => {
	if (typeof window === "undefined") return;
	window.__satinWishlist = wishlist;

	// Перерисовка одной кнопки-сердца: filled/outline + aria-pressed. Сердце
	// живёт в дочернем [data-wishlist-icon] (renderCardHtml/PDP создают его);
	// если контейнера нет — кладём SVG прямо в кнопку.
	const paintButton = (btn: HTMLElement, active: boolean) => {
		btn.setAttribute("aria-pressed", active ? "true" : "false");
		btn.dataset.active = active ? "true" : "false";
		const slot = btn.querySelector<HTMLElement>("[data-wishlist-icon]") ?? btn;
		slot.innerHTML = heartSvg(active);
	};

	const renderAll = () => {
		const active = new Set(getAll());
		// Кнопки-сердца: состояние из текущего набора.
		document.querySelectorAll<HTMLElement>("[data-wishlist-toggle]").forEach((btn) => {
			const id = btn.dataset.productId ?? "";
			paintButton(btn, id ? active.has(id) : false);
		});
		// Бейджи: число + скрытие при нуле (data-empty, как у [data-cart-count]).
		const n = active.size;
		document.querySelectorAll<HTMLElement>("[data-wishlist-count]").forEach((el) => {
			el.textContent = String(n);
			el.dataset.empty = n === 0 ? "true" : "false";
		});
	};

	// Делегат клика — один на документ (идемпотентно по флагу).
	if (!window.__satinWishlistBound) {
		window.__satinWishlistBound = true;

		document.addEventListener("click", (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			const btn = target?.closest<HTMLElement>("[data-wishlist-toggle]");
			if (!btn) return;
			// Кнопка-сердце часто лежит ВНУТРИ <a>-обёртки фото карточки — гасим
			// переход/всплытие, чтобы клик по сердцу не открывал товар (как quickAdd).
			event.preventDefault();
			event.stopPropagation();
			const id = btn.dataset.productId ?? "";
			if (!id) return;
			const nowActive = toggle(id); // событие satin:wishlist:updated → renderAll ниже
			paintButton(btn, nowActive); // мгновенный отклик именно этой кнопки
		});

		// Любое изменение набора (в т.ч. из другой вкладки/страницы) → перерисовать всё.
		window.addEventListener(EVT_UPDATED, renderAll);
		// Кросс-вкладочная синхронизация localStorage.
		window.addEventListener("storage", (e) => {
			if (e.key === STORAGE_KEY) renderAll();
		});
		// После навигации View Transitions DOM новый — перерисовать состояние.
		document.addEventListener("astro:page-load", renderAll);
	}

	renderAll();
};
