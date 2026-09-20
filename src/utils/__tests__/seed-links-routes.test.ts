import { migrateVanillaHomePage } from '../revision-migrations';

/**
 * Баг тестера #2 (18.09): «Дефолтные пункты меню шапки 404-ят — „Мебель“ →
 * /c/mebel, „Декор“ → /c/dekor. Оба 404, маршрута /c/<slug> на витрине нет».
 *
 * Замер прода 19.09 (vanilla, 5c178ceecc1d): `/c/mebel` 404, `/c/dekor` 404,
 * `/collections/mebel` 200, `/collections/dekor` 200.
 *
 * Гард пишется на КЛАСС, а не на два адреса: любая ссылка, которую платформа
 * засевает сама, обязана попадать в маршрут, который витрина действительно
 * отдаёт. Мерчант свои ссылки ставит сам и отвечает за них, а стартовый контент
 * битых адресов содержать не может.
 */

/** Маршруты, которые витрина реально отдаёт (замер прода 19.09). */
const LIVE_ROUTES = [
	/^\/$/,
	/^\/catalog(\?|$)/,
	/^\/collections\/[^/]+$/,
	/^\/collections\/$/, // база ссылок карточек: cardLinkBase + slug
	/^\/products?\/[^/]*$/,
	/^\/cart$/,
	/^\/checkout$/,
	/^\/wishlist$/,
	/^\/account(\/|$)/,
	/^\/login$/,
	/^\/register$/,
	/^\/about$/,
	/^\/contacts$/,
	/^\/delivery$/,
	/^\/blog(\/|$)/,
	/^#/,
	/^https?:\/\//,
];

function collectLinks(node: unknown, out: string[] = []): string[] {
	if (Array.isArray(node)) {
		for (const item of node) collectLinks(item, out);
		return out;
	}
	if (node && typeof node === 'object') {
		for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
			if (
				typeof value === 'string' &&
				/^(href|link|url|cardLinkBase)$/.test(key) &&
				value.startsWith('/')
			) {
				out.push(value);
			}
			collectLinks(value, out);
		}
		return out;
	}
	return out;
}

describe('стартовый контент не содержит битых маршрутов', () => {
	it('vanilla: каждая засеянная ссылка попадает в живой маршрут витрины', () => {
		const seeded = migrateVanillaHomePage({}, 'vanilla');
		const links = collectLinks(seeded);

		expect(links.length).toBeGreaterThan(5); // сид действительно разобран
		const broken = links.filter((href) => !LIVE_ROUTES.some((re) => re.test(href)));
		expect(broken).toEqual([]);
	});

	it('vanilla: ссылок на несуществующий /c/<slug> не осталось ни одной', () => {
		const seeded = migrateVanillaHomePage({}, 'vanilla');
		const links = collectLinks(seeded);

		expect(links.filter((h) => h === '/c/' || h.startsWith('/c/'))).toEqual([]);
	});

	it('vanilla: карточки коллекций ведут на страницу коллекции', () => {
		const seeded = migrateVanillaHomePage({}, 'vanilla');
		const bases = collectLinks(seeded).filter((h) => h.endsWith('/'));

		expect(bases).toContain('/collections/');
	});
});
