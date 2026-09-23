/**
 * «Продолжить покупки» в пустой корзине — на «общую» коллекцию магазина.
 *
 * Владелец 23.09: «при пустой корзине кнопка ведёт на страницу хз какую, а
 * должна вести на страницу коллекции общей». Было: bloom — `/skin-care`
 * (заглушка вёрстки «Уход за кожей»), vanilla — `/catalog/textile` (заглушка
 * «Текстиль»), остальные темы и выдвижная корзина — `/catalog`.
 *
 * «Общая» коллекция — коллекция магазина по умолчанию (product:
 * ensureDefaultCollection — `isDefault: true`, «Общая», slug `general`).
 * Мерчант может её переименовать: у тестировщика это «Товары», slug `tovary`,
 * и `/collections/general` там 404. Поэтому адрес ищется на странице по
 * `isDefault` витринного API (сборка сайта признака не получает: RPC
 * product.collections.list его не отдаёт), а темы собираются один раз на все
 * магазины — вшить адрес при сборке темы нельзя.
 *
 * Когда: по намерению покупателя — навёл, сфокусировал, коснулся, нажал. Кнопка
 * есть в выдвижной корзине на каждой странице, и запрос к API на каждый
 * просмотр страницы был бы лишней нагрузкой. К нажатию адрес обычно уже
 * найден; нет — нажатие ждёт его недолго и уходит по найденному или по
 * запасному `/catalog` из разметки.
 */
import { resolveSearchEndpoint } from "./header-search";

/**
 * Кнопка «Продолжить покупки» пустой корзины. В разметке рядом с меткой —
 * data-astro-reload: роутер Astro такие ссылки не трогает, переход ведёт этот
 * модуль.
 */
export const CONTINUE_SHOPPING = "[data-continue-shopping]";

/** Сколько нажатие ждёт адрес, прежде чем уйти по запасному. */
const WAIT_MS = 1500;

/** Коллекция в ответе витринного API. */
interface StoreCollection {
	id?: unknown;
	slug?: unknown;
	handle?: unknown;
	isDefault?: unknown;
}

/** Адрес коллекции по умолчанию или null, если её нет в списке. */
export function defaultCollectionHref(collections: unknown): string | null {
	if (!Array.isArray(collections)) return null;
	const general = (collections as StoreCollection[]).find((c) => c?.isDefault === true);
	const slug = general && (general.slug || general.handle || general.id);
	return typeof slug === "string" && slug !== "" ? `/collections/${encodeURIComponent(slug)}` : null;
}

/** Адрес магазина — тот же, что у поиска шапки. */
async function findDefaultCollectionHref(win: Window): Promise<string | null> {
	const endpoint = resolveSearchEndpoint(win);
	if (!endpoint) return null;
	try {
		const res = await fetch(
			`${endpoint.apiBase}/api/store/collections?store_id=${encodeURIComponent(endpoint.storeId)}&limit=100`,
		);
		if (!res.ok) return null;
		const json = (await res.json()) as { collections?: unknown } | null;
		return defaultCollectionHref(json?.collections);
	} catch {
		return null;
	}
}

let found: Promise<string | null> | null = null;

/** Найти адрес (один раз на страницу) и поставить его всем кнопкам. */
function resolveHref(win: Window): Promise<string | null> {
	found = found ?? findDefaultCollectionHref(win);
	return found.then((href) => {
		if (href) {
			for (const link of Array.from(win.document.querySelectorAll(CONTINUE_SHOPPING)))
				link.setAttribute("href", href);
		}
		return href;
	});
}

const linkOf = (ev: Event) =>
	(ev.target instanceof Element ? ev.target.closest(CONTINUE_SHOPPING) : null) as HTMLAnchorElement | null;

/** Своя вкладка, левая кнопка, без модификаторов — остальное браузер делает сам. */
const plainClick = (ev: MouseEvent) =>
	!ev.defaultPrevented && ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey;

/** Подключить кнопки страницы; повторный вызов (astro:page-load) ничего не делает. */
export function bindContinueShopping(win: Window = window): void {
	const doc = win.document as Document & { __merfyContinueShopping?: boolean };
	if (doc.__merfyContinueShopping) return;
	doc.__merfyContinueShopping = true;
	const intent = (ev: Event) => {
		if (linkOf(ev)) void resolveHref(win);
	};
	for (const type of ["pointerover", "focusin", "touchstart"])
		doc.addEventListener(type, intent, { passive: true });
	// Всплытие, не захват: перехватчик превью конструктора ловит нажатие при
	// захвате, отменяет его и сам переключает страницу — тогда здесь ничего не
	// делается. Роутер Astro (ViewTransitions у bloom/rose/vanilla) слушает раньше
	// нас из <head> и ушёл бы по ещё не найденному адресу — его отводит
	// data-astro-reload на кнопке.
	doc.addEventListener("click", (ev) => {
		const link = linkOf(ev);
		if (!link || !plainClick(ev)) return;
		ev.preventDefault();
		const fallback = link.getAttribute("href") || "/catalog";
		const timeout = new Promise<null>((done) => win.setTimeout(() => done(null), WAIT_MS));
		void Promise.race([resolveHref(win), timeout]).then((href) => win.location.assign(href ?? fallback));
	});
}
