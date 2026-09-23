/**
 * «Продолжить покупки» в пустой корзине — на «общую» коллекцию магазина.
 *
 * Владелец 23.09: «при пустой корзине кнопка ведёт на страницу хз какую, а
 * должна вести на страницу коллекции общей». Было: bloom — `/skin-care`
 * (заглушка вёрстки «Уход за кожей»), vanilla — `/catalog/textile` (заглушка
 * «Текстиль»), остальные темы — `/catalog`.
 *
 * «Общая» коллекция — коллекция магазина по умолчанию (product:
 * ensureDefaultCollection — `isDefault: true`, «Общая», slug `general`).
 * Мерчант может её переименовать: у тестировщика это «Товары», slug `tovary`,
 * и `/collections/general` там 404. Поэтому адрес ищется на странице по
 * `isDefault`: темы собираются один раз на все магазины, вшить его при сборке
 * темы нельзя.
 *
 * Откуда: `/data/collections.json` сайта (его кладёт публикация, с
 * `isDefault`; статичный файл того же адреса — выдвижная корзина есть на
 * каждой странице, лишнего запроса к API не будет), иначе витринное API
 * (превью конструктора, сайт ещё не переопубликован). Ни там, ни там —
 * остаётся адрес из разметки, `/catalog` (все товары).
 */
import { resolveSearchEndpoint } from "./header-search";

/** Кнопка «Продолжить покупки» пустой корзины. */
export const CONTINUE_SHOPPING = "[data-continue-shopping]";

/** Коллекция в ответе витрины / в `/data/collections.json`. */
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

async function readJson(url: string): Promise<unknown> {
	try {
		const res = await fetch(url);
		return res.ok ? await res.json() : null;
	} catch {
		return null;
	}
}

/** Сначала файл сайта, потом API (тот же адрес магазина, что у поиска шапки). */
async function findDefaultCollectionHref(win: Window): Promise<string | null> {
	const fromSite = defaultCollectionHref(await readJson("/data/collections.json"));
	if (fromSite) return fromSite;
	const endpoint = resolveSearchEndpoint(win);
	if (!endpoint) return null;
	const api = (await readJson(
		`${endpoint.apiBase}/api/store/collections?store_id=${encodeURIComponent(endpoint.storeId)}&limit=100`,
	)) as { collections?: unknown } | null;
	return defaultCollectionHref(api?.collections);
}

let found: Promise<string | null> | null = null;

/**
 * Поставить кнопкам «Продолжить покупки» адрес «общей» коллекции. Один поиск на
 * страницу; нет кнопок — нет и запросов.
 */
export async function bindContinueShopping(win: Window = window): Promise<void> {
	const links = Array.from(win.document.querySelectorAll<HTMLAnchorElement>(CONTINUE_SHOPPING));
	if (links.length === 0) return;
	found = found ?? findDefaultCollectionHref(win);
	const href = await found;
	if (!href) return;
	for (const link of links) link.setAttribute("href", href);
}
