/**
 * header-search — живой поиск по товарам из лупы в шапке. Один модуль на пять тем.
 *
 * Поток тот же, что у корзины и избранного: сервис → gateway → витрина.
 *   product-service  `product.findAll` с `search` — ILIKE по названию, описанию
 *                    и артикулу, только активные товары (своего движка нет и не
 *                    нужно: просьба владельца 22.09 — «обычный поиск, query like»);
 *   gateway          публичный `GET /api/store/products/search?store_id=&q=&limit=`;
 *   этот модуль      ввод → пауза → запрос (устаревший отменяется) → разметка темы.
 *
 * До 22.09 лупа открывала форму, которая просто уводила в каталог
 * (`/catalog?q=`), а у satin подсказки строились из демо-товаров, зашитых в
 * сборку темы, — у настоящего магазина они показывали чужой ассортимент.
 * Отправка формы в каталог осталась: «Найти» и Enter по-прежнему ведут туда.
 *
 * Контракт разметки (эмитят шапки тем):
 *   [data-header-search]              область поиска — выпадающая панель (сама
 *                                     форма) или шторка бургера целиком
 *     input[type="search"]            поле ввода
 *     [data-search-results]           сюда кладётся разметка темы
 *     [data-search-idle]              прячется, пока показан ответ (меню шторки)
 *   data-search-layout="panel|drawer" какую раскладку рисует тема
 *   data-search-limit="N"             сколько товаров просить у gateway
 *   data-search-state                 idle | loading | results | empty | error —
 *                                     ставит модуль, темы могут на него опираться
 *
 * Разметку результатов рисует тема (`render`) — ровно как строку дровера
 * у nt-cart: внешний вид у тем разный, поведение общее. Сам модуль классов
 * Tailwind не пишет: пакет theme-base Tailwind тем не сканирует, и такой класс
 * молча не доехал бы до бандла.
 *
 * Модуль подключается из скрипта шапки темы. На контентных страницах этот
 * скрипт живёт в ДВУХ копиях (Astro-hoisted и инлайн из renderBlock шапки при
 * сборке хрома) — поэтому делегаты вешаются один раз на окно, а вторая копия
 * лишь обновляет рендер.
 */

import { pickDefaultCombination } from "./nt-cart";

export interface HeaderSearchHit {
	id: string;
	title: string;
	/** Страница товара — та же, что у карточек каталога и избранного. */
	href: string;
	/** Первое фото; пустая строка — фото нет. */
	image: string;
	/** До трёх фото — для переключателя в карточке bloom. */
	images: string[];
	/** Цена в рублях: у товара с вариантами — минимальная цена комбинаций. */
	price: number;
	/** Старая цена — только если она больше текущей. */
	oldPrice: number | null;
	onSale: boolean;
	available: boolean;
	/** Комбинация, которую положит кнопка «В корзину» (товар с вариантами). */
	combinationId: string | null;
	combinationOptions: Record<string, string> | null;
}

export type HeaderSearchState = "idle" | "loading" | "results" | "empty" | "error";

export interface HeaderSearchRenderContext {
	/** Значение `data-search-layout` области: "panel" или "drawer". */
	layout: string;
	query: string;
	/** Сколько всего нашлось (может быть больше показанного). */
	total: number;
	formatPrice: (value: number) => string;
	escapeHtml: (value: unknown) => string;
}

export interface HeaderSearchOptions {
	/** Разметка списка результатов темы. */
	render: (hits: HeaderSearchHit[], ctx: HeaderSearchRenderContext) => string;
	/**
	 * Классы строки-сообщения («Ищем…», «Ничего не нашлось»). Литерал живёт в
	 * исходнике темы — только так Tailwind темы его увидит.
	 */
	messageClass?: string;
	/** Сообщение целиком, если теме мало одного класса. */
	renderMessage?: (state: "loading" | "empty" | "error", ctx: HeaderSearchRenderContext) => string;
	/** С какой длины запроса искать. По умолчанию 2 — как у каталога gateway. */
	minChars?: number;
	/** Пауза после ввода, мс. */
	debounceMs?: number;
}

interface RawVariantCombination {
	id?: unknown;
	price?: unknown;
	available?: unknown;
	options?: unknown;
}

interface RawStoreProduct {
	id?: unknown;
	title?: unknown;
	name?: unknown;
	images?: unknown;
	basePrice?: unknown;
	compareAtPrice?: unknown;
	hasVariants?: unknown;
	quantity?: unknown;
	allowBackorder?: unknown;
	variantCombinations?: unknown;
	variantGroups?: unknown;
}

interface StoreWindow {
	__MERFY_SITE_ID__?: string;
	__MERFY_API_BASE__?: string;
	__MERFY_CONFIG__?: { shopId?: string; storeId?: string; siteId?: string; apiUrl?: string };
	__MERFY__?: { siteId?: string };
}

const DEFAULT_API_BASE = "https://gateway.merfy.ru";
const WINDOW_KEY = "__merfyHeaderSearch";
const CACHE_LIMIT = 40;

const toNumber = (value: unknown): number | null => {
	const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
	return Number.isFinite(n) ? n : null;
};

export function escapeHtml(value: unknown): string {
	return String(value === null || value === undefined ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** «2 690 ₽» — тот же формат, что у карточек каталога и избранного. */
export function formatPrice(value: number): string {
	if (!Number.isFinite(value)) return "";
	return value.toLocaleString("ru-RU") + " ₽";
}

/**
 * Товар из ответа gateway → то, что рисует тема. Цена считается так же, как в
 * каталожных портах (`mapApiProduct`): у товара с вариантами — минимум по
 * комбинациям, иначе basePrice. Иначе поиск и каталог показали бы один товар
 * по разной цене.
 */
export function mapSearchProduct(raw: unknown): HeaderSearchHit | null {
	if (!raw || typeof raw !== "object") return null;
	const p = raw as RawStoreProduct;
	const id = typeof p.id === "string" ? p.id : "";
	if (!id) return null;

	const combos = Array.isArray(p.variantCombinations)
		? (p.variantCombinations as RawVariantCombination[]).filter((c) => c && typeof c === "object")
		: [];
	const comboPrices = combos
		.map((c) => toNumber(c.price))
		.filter((n): n is number => n !== null && n > 0);
	const minComboPrice = comboPrices.length > 0 ? Math.min(...comboPrices) : null;
	const hasVariants = p.hasVariants === true || combos.length > 0;
	const price =
		(hasVariants ? minComboPrice : null) ?? toNumber(p.basePrice) ?? minComboPrice ?? 0;
	const compareAt = toNumber(p.compareAtPrice);
	const oldPrice = compareAt !== null && compareAt > price ? compareAt : null;

	const images = (Array.isArray(p.images) ? p.images : [])
		.filter((src): src is string => typeof src === "string" && src.trim() !== "")
		.slice(0, 3);

	const available = combos.length > 0
		? combos.some((c) => c.available !== false)
		: (toNumber(p.quantity) ?? 0) > 0 || p.allowBackorder === true;

	const combination = hasVariants
		? pickDefaultCombination(
				combos.map((c) => ({
					id: String(c.id ?? ""),
					available: c.available !== false,
					options:
						c.options && typeof c.options === "object" && !Array.isArray(c.options)
							? (c.options as Record<string, string>)
							: {},
				})),
				Array.isArray(p.variantGroups) ? (p.variantGroups as Array<{ name?: string; options?: Array<{ value?: string }> }>) : null,
			)
		: null;

	const title =
		(typeof p.title === "string" && p.title.trim()) ||
		(typeof p.name === "string" && p.name.trim()) ||
		"";

	return {
		id,
		title,
		href: `/product?id=${encodeURIComponent(id)}`,
		image: images[0] ?? "",
		images,
		price,
		oldPrice,
		onSale: oldPrice !== null,
		available,
		combinationId: combination && combination.id ? combination.id : null,
		combinationOptions:
			combination && Object.keys(combination.options ?? {}).length > 0
				? (combination.options as Record<string, string>)
				: null,
	};
}

/**
 * Откуда брать магазин и адрес gateway. Витрина получает id из пропатченного
 * при публикации `__MERFY_CONFIG__.shopId` (patchShopIdInDist), превью
 * конструктора — из `__MERFY_SITE_ID__` и same-origin `__MERFY_API_BASE__`.
 * Нет магазина (демо-сборка темы) — поиска на лету нет, форма по-прежнему
 * уводит в каталог.
 */
export function resolveSearchEndpoint(win: unknown): { storeId: string; apiBase: string } | null {
	const w = (win ?? {}) as StoreWindow;
	const cfg = w.__MERFY_CONFIG__ ?? {};
	const storeId = String(
		w.__MERFY_SITE_ID__ || cfg.shopId || cfg.storeId || cfg.siteId || w.__MERFY__?.siteId || "",
	).trim();
	if (!storeId) return null;
	const fromConfig =
		typeof cfg.apiUrl === "string" ? cfg.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "") : "";
	const apiBase = String(w.__MERFY_API_BASE__ || fromConfig || DEFAULT_API_BASE).replace(/\/+$/, "");
	return { storeId, apiBase };
}

export function buildSearchUrl(
	endpoint: { storeId: string; apiBase: string },
	query: string,
	limit: number,
): string {
	return (
		`${endpoint.apiBase}/api/store/products/search` +
		`?store_id=${encodeURIComponent(endpoint.storeId)}` +
		`&q=${encodeURIComponent(query)}` +
		`&limit=${limit}`
	);
}

interface ScopeRuntime {
	timer: ReturnType<typeof setTimeout> | null;
	controller: AbortController | null;
	seq: number;
	query: string;
}

interface SearchAnswer {
	hits: HeaderSearchHit[];
	total: number;
}

interface HeaderSearchGlobal {
	options: HeaderSearchOptions;
}

const DEFAULT_MESSAGES = {
	loading: () => "Ищем…",
	empty: (q: string) => `По запросу «${q}» ничего не нашлось`,
	error: () => "Поиск сейчас недоступен — нажмите «Найти», чтобы открыть каталог",
};

/**
 * Вернуть фокус на лупу после закрытия панели. Лупа в шапке не одна: у
 * bloom/vanilla/satin первой в DOM стоит кнопка мобильной строки, на десктопе
 * она скрыта — фокус на неё молча теряется. Берём первую видимую.
 */
export function focusSearchToggle(): void {
	if (typeof document === "undefined") return;
	const visible = Array.from(
		document.querySelectorAll<HTMLElement>("[data-action='toggle-search']"),
	).find((btn) => btn.offsetParent !== null || btn.getClientRects().length > 0);
	visible?.focus();
}

export function initHeaderSearch(options: HeaderSearchOptions): void {
	if (typeof window === "undefined" || typeof document === "undefined") return;
	const win = window as unknown as Record<string, unknown>;
	const existing = win[WINDOW_KEY] as HeaderSearchGlobal | undefined;
	if (existing) {
		// Вторая копия скрипта шапки: делегаты уже висят, берём свежий рендер.
		existing.options = options;
		return;
	}
	const global: HeaderSearchGlobal = { options };
	win[WINDOW_KEY] = global;

	const scopes = new WeakMap<Element, ScopeRuntime>();
	const cache = new Map<string, SearchAnswer>();

	const opts = () => global.options;
	const minChars = () => Math.max(1, opts().minChars ?? 2);
	const debounceMs = () => Math.max(0, opts().debounceMs ?? 250);

	const runtimeOf = (scope: Element): ScopeRuntime => {
		let rt = scopes.get(scope);
		if (!rt) {
			rt = { timer: null, controller: null, seq: 0, query: "" };
			scopes.set(scope, rt);
		}
		return rt;
	};

	const resultsOf = (scope: Element) => scope.querySelector<HTMLElement>("[data-search-results]");

	const limitOf = (scope: Element): number => {
		const raw = Number((scope as HTMLElement).dataset?.searchLimit);
		return Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 24) : 8;
	};

	const contextFor = (scope: Element, query: string, total: number): HeaderSearchRenderContext => ({
		layout: (scope as HTMLElement).dataset?.searchLayout ?? "panel",
		query,
		total,
		formatPrice,
		escapeHtml,
	});

	const messageHtml = (
		state: "loading" | "empty" | "error",
		ctx: HeaderSearchRenderContext,
	): string => {
		const custom = opts().renderMessage;
		if (custom) return custom(state, ctx);
		const text =
			state === "empty" ? DEFAULT_MESSAGES.empty(ctx.query) : DEFAULT_MESSAGES[state]();
		const cls = opts().messageClass ?? "";
		return `<p data-search-message="${state}"${cls ? ` class="${escapeHtml(cls)}"` : ""}>${escapeHtml(text)}</p>`;
	};

	const announce = (scope: Element, state: HeaderSearchState, count: number) => {
		scope.dispatchEvent(
			new CustomEvent("merfy:header-search", { bubbles: true, detail: { state, count } }),
		);
	};

	const setState = (scope: Element, state: HeaderSearchState, html?: string, count = 0) => {
		const results = resultsOf(scope);
		(scope as HTMLElement).dataset.searchState = state;
		if (results) {
			if (html !== undefined) results.innerHTML = html;
			if (state === "idle") results.innerHTML = "";
			results.hidden = state === "idle";
			results.setAttribute("aria-busy", state === "loading" ? "true" : "false");
		}
		scope.querySelectorAll<HTMLElement>("[data-search-idle]").forEach((el) => {
			el.hidden = state !== "idle";
		});
		announce(scope, state, count);
	};

	const showAnswer = (scope: Element, query: string, answer: SearchAnswer) => {
		const ctx = contextFor(scope, query, answer.total);
		if (answer.hits.length === 0) {
			setState(scope, "empty", messageHtml("empty", ctx));
			return;
		}
		setState(scope, "results", opts().render(answer.hits, ctx), answer.hits.length);
	};

	const reset = (scope: Element) => {
		const rt = runtimeOf(scope);
		if (rt.timer) clearTimeout(rt.timer);
		rt.timer = null;
		rt.controller?.abort();
		rt.controller = null;
		rt.seq += 1;
		rt.query = "";
		setState(scope, "idle");
	};

	const search = async (scope: Element, query: string) => {
		const rt = runtimeOf(scope);
		const endpoint = resolveSearchEndpoint(window);
		if (!endpoint) {
			// Демо-сборка темы без магазина: живого поиска нет, форма ведёт в каталог.
			reset(scope);
			return;
		}
		const limit = limitOf(scope);
		const key = `${endpoint.storeId}|${limit}|${query.toLowerCase()}`;
		const cached = cache.get(key);
		rt.controller?.abort();
		rt.controller = null;
		const seq = ++rt.seq;
		rt.query = query;
		if (cached) {
			showAnswer(scope, query, cached);
			return;
		}

		const results = resultsOf(scope);
		const hasShown = !!results && !results.hidden && results.innerHTML.trim() !== "";
		if (hasShown) {
			// Прежний ответ остаётся на месте, пока не пришёл новый — без мигания.
			(scope as HTMLElement).dataset.searchState = "loading";
			results?.setAttribute("aria-busy", "true");
		} else {
			setState(scope, "loading", messageHtml("loading", contextFor(scope, query, 0)));
		}

		const controller = typeof AbortController === "function" ? new AbortController() : null;
		rt.controller = controller;
		try {
			const res = await fetch(buildSearchUrl(endpoint, query, limit), {
				credentials: "omit",
				signal: controller?.signal,
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { products?: unknown; total?: unknown };
			const hits = (Array.isArray(body.products) ? body.products : [])
				.map(mapSearchProduct)
				.filter((h): h is HeaderSearchHit => h !== null);
			const total = toNumber(body.total) ?? hits.length;
			const answer = { hits, total };
			cache.set(key, answer);
			if (cache.size > CACHE_LIMIT) {
				const oldest = cache.keys().next().value;
				if (oldest !== undefined) cache.delete(oldest);
			}
			if (seq !== rt.seq) return;
			rt.controller = null;
			showAnswer(scope, query, answer);
		} catch (err) {
			if (seq !== rt.seq) return;
			if ((err as { name?: string } | null)?.name === "AbortError") return;
			rt.controller = null;
			setState(scope, "error", messageHtml("error", contextFor(scope, query, 0)));
		}
	};

	const schedule = (scope: Element, value: string) => {
		const rt = runtimeOf(scope);
		const query = value.trim();
		if (rt.timer) clearTimeout(rt.timer);
		rt.timer = null;
		if (query.length < minChars()) {
			reset(scope);
			return;
		}
		// Тот же запрос, ответ уже на экране или в пути — повторять незачем.
		// После ошибки повтор разрешён: сеть могла ожить.
		const state = (scope as HTMLElement).dataset.searchState;
		if (query === rt.query && (state === "results" || state === "empty" || state === "loading")) return;
		rt.timer = setTimeout(() => {
			rt.timer = null;
			void search(scope, query);
		}, debounceMs());
	};

	const searchInputOf = (target: EventTarget | null): HTMLInputElement | null => {
		const el = target instanceof Element ? target : null;
		const input = el?.closest?.('input[type="search"]') as HTMLInputElement | null;
		return input && input.closest("[data-header-search]") ? input : null;
	};

	document.addEventListener("input", (event) => {
		const input = searchInputOf(event.target);
		if (!input) return;
		const scope = input.closest("[data-header-search]");
		if (scope) schedule(scope, input.value);
	});

	// Вернулись в поле, где уже есть запрос, — показать ответ снова (он в кэше).
	document.addEventListener("focusin", (event) => {
		const input = searchInputOf(event.target);
		if (!input) return;
		const scope = input.closest("[data-header-search]");
		if (!scope || (scope as HTMLElement).dataset.searchState === "results") return;
		if (input.value.trim().length >= minChars()) schedule(scope, input.value);
	});

	document.addEventListener("keydown", (event) => {
		const target = event.target instanceof Element ? event.target : null;
		if (!target) return;
		const scope = target.closest("[data-header-search]");
		if (!scope) return;
		// Ссылка-картинка карточки (tabindex=-1) дублирует подпись — стрелки её пропускают.
		const links = Array.from(
			scope.querySelectorAll<HTMLAnchorElement>("[data-search-results] a[href]"),
		).filter((a) => !a.closest("[hidden]") && a.getAttribute("tabindex") !== "-1");
		const input = scope.querySelector<HTMLInputElement>('input[type="search"]');

		if (event.key === "Escape" && target === input && input && input.value) {
			// Первый Escape чистит поле; следующий уже может закрыть панель темы.
			// Слушатель темы висит на том же document — остановить его может только
			// stopImmediatePropagation (модуль подключается раньше делегатов шапки).
			event.stopImmediatePropagation();
			input.value = "";
			reset(scope);
			return;
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		if (links.length === 0) return;
		const at = links.indexOf(target as HTMLAnchorElement);
		if (target === input) {
			if (event.key !== "ArrowDown") return;
			event.preventDefault();
			links[0].focus();
			return;
		}
		if (at < 0) return;
		event.preventDefault();
		const next = event.key === "ArrowDown" ? at + 1 : at - 1;
		if (next < 0) input?.focus();
		else links[Math.min(next, links.length - 1)].focus();
	});

	// Переключатель фото в карточке (точки bloom). Кнопка лежит рядом со
	// ссылкой-картинкой, а не внутри неё: button внутри <a> невалиден.
	document.addEventListener("click", (event) => {
		const el = event.target instanceof Element ? event.target : null;
		const dot = el?.closest?.("[data-search-dot]") as HTMLElement | null;
		if (!dot) return;
		const hit = dot.closest("[data-search-hit]");
		const img = hit?.querySelector<HTMLImageElement>("[data-search-img]");
		const src = dot.dataset.src;
		if (!hit || !img || !src) return;
		event.preventDefault();
		event.stopPropagation();
		img.src = src;
		hit.querySelectorAll<HTMLElement>("[data-search-dot]").forEach((d) => {
			const active = d === dot;
			d.dataset.active = active ? "true" : "false";
			d.setAttribute("aria-pressed", active ? "true" : "false");
		});
	});

	// Переход по ссылке без перезагрузки (View Transitions): прежние области
	// поиска уходят вместе с DOM, у новых состояние начинается с нуля.
	document.addEventListener("astro:page-load", () => {
		document.querySelectorAll("[data-header-search]").forEach((scope) => {
			const input = scope.querySelector<HTMLInputElement>('input[type="search"]');
			if (input) input.value = "";
			reset(scope);
		});
	});
}
