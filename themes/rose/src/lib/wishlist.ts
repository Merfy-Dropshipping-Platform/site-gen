/**
 * Избранное (wishlist) Rose — локальная реализация по образцу корзины
 * ({@link ./nt-cart-rose}.ts + {@link ./cart}.ts), сведённая в один self-contained
 * файл. Хранит список productId в localStorage, шлёт CustomEvent при изменении и
 * экспортирует {@link initWishlistUI} — глобальный document-делегат (зеркало
 * `initCartUI`), который перерисовывает состояние всех кнопок-сердец и бейджей.
 *
 * ПИЛОТ-ЭТАЛОН для раскатки на bloom/flux/satin/vanilla: контракт data-атрибутов
 * (`[data-wishlist-toggle][data-product-id]`, `[data-wishlist-count]`), ключ
 * localStorage и имя события должны зеркалиться per-theme (с префиксом темы).
 *
 * Дизайн строго под rose: сердце берёт геометрию из public/icons/favourite.svg
 * (outline-сердце темы), но рендерится ИНЛАЙН-SVG (а не <img> как RoseNtIcon) —
 * иначе нельзя переключать fill (пусто ↔ залито) и красить в токен rose-primary.
 */

// ── Контракт хранения (per-theme; для портов меняется только префикс) ──
const STORAGE_KEY = "rose:wishlist:v1";
const EVT_UPDATED = "rose:wishlist:updated";

// Глобал для inline-скриптов (renderCardHtml каталога / гидрация PDP не могут
// импортировать этот модуль — читают состояние синхронно через window). Зеркалит
// то, как каталог читает window.cartStore.
declare global {
	interface Window {
		__roseWishlist?: RoseWishlistApi;
		__roseWishlistBound?: boolean;
	}
}

export interface RoseWishlistApi {
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
 * Инлайн-SVG сердца rose. Геометрия = public/icons/favourite.svg (viewBox
 * 0 0 17.4 15.4, тот же path). filled → залито rose-primary; outline → только
 * обводка (currentColor наследуется от кнопки). aria-hidden — декоративная,
 * подпись несёт сама кнопка (aria-label / aria-pressed).
 */
const heartSvg = (filled: boolean): string => {
	const fill = filled ? "rgb(var(--color-button-bg,0 0 0))" : "none";
	const stroke = filled ? "rgb(var(--color-button-bg,0 0 0))" : "currentColor";
	return (
		'<svg viewBox="0 0 17.4 15.4" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">' +
		'<path d="M7.428 14.2615C5.172 12.5239 0.7 8.55212 0.7 4.97729C0.7 2.61547 2.384 0.7 4.7 0.7C5.9 0.7 7.1 1.11175 8.7 2.75876C10.3 1.11175 11.5 0.7 12.7 0.7C15.016 0.7 16.7 2.61547 16.7 4.97729C16.7 8.5513 12.228 12.5239 9.972 14.2615C9.212 14.8462 8.188 14.8462 7.428 14.2615Z" ' +
		'fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
		"</svg>"
	);
};

export const wishlist: RoseWishlistApi = {
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
 *  • на событие rose:wishlist:updated перерисовывает ВСЕ кнопки-сердца
 *    (aria-pressed + filled/outline) и ВСЕ бейджи [data-wishlist-count];
 *  • выставляет window.__roseWishlist для inline-скриптов карточки/PDP.
 *
 * Идемпотентен (флаг на window) — безопасно звать на каждой странице и после
 * View Transitions (astro:page-load).
 */
export const initWishlistUI = (): void => {
	if (typeof window === "undefined") return;
	window.__roseWishlist = wishlist;

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
	if (!window.__roseWishlistBound) {
		window.__roseWishlistBound = true;

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
			const nowActive = toggle(id); // событие rose:wishlist:updated → renderAll ниже
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
