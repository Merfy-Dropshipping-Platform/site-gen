/**
 * Окно «Товар добавлен в корзину» — ОДНА механика на все пять тем.
 *
 * Откуда взялось. Флоу придуман и обкатан в bloom
 * (`themes/bloom/src/components/cart/BloomCartAddedModal.astro` + свой
 * `initCartUI` в `themes/bloom/src/lib/cart.ts`). Владелец попросил тот же флоу
 * во всех темах, поэтому механика переехала СЮДА, а разметка — в
 * `primitives/CartAddedModal.astro`. В портах тем остаётся ровно одна строка
 * подключения компонента: копии логики в четыре темы не разводим.
 *
 * Что делает окно:
 *   • открывается после добавления товара (делегат `[data-add-to-cart]` в
 *     nt-cart.ts) ВМЕСТО авто-открытия сайдбара;
 *   • «В корзину (N)» → `/cart`;
 *   • «Купить сейчас» → быстрый переход к оформлению — ровно так же, как это
 *     сделано у rose: её страница товара рендерится общим блоком
 *     `packages/theme-base/blocks/Product` (rose входит в PRODUCT_UNIFIED_THEMES),
 *     и его `[data-product-action="buy-now"]` чистит залипший
 *     `<тема>:buynow`, после чего уходит на `/checkout`: живьём —
 *     `location.href`, в iframe конструктора — postMessage нав-агенту. Товар в
 *     корзине уже лежит (окно открылось ПОСЛЕ добавления), поэтому повторно не
 *     добавляем;
 *   • «Продолжить покупки» → просто закрывает окно.
 *
 * Цвет. Окно берёт цветовую схему тем же вычисленным значением, что уже
 * покрасило корзину, — не своим вторым каналом:
 *   • вид корзины «Сайдбар» (`--cart-type` ≠ page) — источник корень дровера
 *     `[data-nt$="cart-drawer"]`. Его красит правило tokens.css
 *     `[data-nt$="cart-drawer"] {…}` из настройки «Настройки темы» → «Корзина» →
 *     «Цветовая схема». Замер 15.09 показал, что этот канал работает ОДИНАКОВО
 *     на витрине и в конструктор-превью (оконные глобалы для цвета избыточны),
 *     и что у rose это единственный канал — читателя
 *     `__MERFY_CART_DRAWER_SCHEME__` у неё нет вовсе;
 *   • вид корзины «Страница» — схемы корзины в панели нет (поле показывается
 *     только при «Сайдбар», состав параметров — канон), поэтому источник
 *     ближайшая обёртка схемы у нажатой кнопки `[class*="color-scheme-"]`, а
 *     если её нет — корень документа, то есть схема страницы.
 * Копируем ВЫЧИСЛЕННЫЕ значения, а не класс: класс `.color-scheme-N` на корне
 * дровера есть только на витрине (его вешает JS темы из оконного глобала), в
 * превью его нет — а цвет нужен одинаковый.
 */

/** Токены, которые реально попадают в правило схемы (`schemeToVars`, tokens-css.ts). */
export const CART_SCHEME_TOKENS = [
	"--color-bg",
	"--color-bg-alt",
	"--color-surface",
	"--color-heading",
	"--color-text",
	"--color-accent",
	"--color-muted",
	"--color-button-bg",
	"--color-button-text",
	"--color-button-border",
	"--color-button-bg-hover",
	"--color-button-text-hover",
	"--color-button-secondary-bg",
	"--color-button-secondary-text",
	"--color-button-secondary-border",
	"--color-button-secondary-bg-hover",
	"--color-button-secondary-text-hover",
	"--color-button-2-bg",
	"--color-button-2-text",
	"--color-button-2-border",
] as const;

export interface CartAddedModalPayload {
	productId: string;
	name: string;
	/** Готовая строка цены с кнопки (фолбэк, если строки корзины нет). */
	price: string;
	image: string;
	volume?: string;
	/** Итог по строке корзины: цена × количество. */
	lineTotal?: number;
	quantity?: number;
	/** Элемент, по которому кликнули, — от него ищем обёртку схемы страницы. */
	origin?: Element | null;
}

export interface CartAddedModalDeps {
	/** «1 234 ₽». */
	formatPrice: (value: number) => string;
	/** Текущее число позиций — уходит в подпись «В корзину (N)». */
	getCartCount: () => number;
	/** Базовый путь карточки товара (совпадает с ссылками строк дровера). */
	productPathPrefix: string;
	/** Префикс темы (`rose`, `bloom`, …) — ключ `<тема>:buynow`. */
	themeKey: string;
}

const MODAL = "[data-cart-added-modal]";
const CARD = "[data-cart-modal-card]";

/**
 * Кнопка корзины в шапке. Портированные темы (bloom, flux) вешают
 * `data-cart-open`, общий блок `blocks/Header` — `a[data-action="cart"]`.
 */
const CART_ANCHORS = '[data-cart-open], a[data-action="cart"]';
/** Зазор между низом иконки и верхом окна. */
const ANCHOR_GAP = 12;
/** Минимальный отступ окна от правого края — чтобы не липло к кромке. */
const ANCHOR_MIN_SIDE = 16;

/**
 * Окно встаёт ПОД ИКОНКОЙ КОРЗИНЫ, а не по центру экрана (владелец, 19.09 по
 * bloom: «ща она в центре, а надо чтобы была под корзиной справа сверху»).
 *
 * Считаем от живого прямоугольника кнопки, а не классами с числами: правые
 * поля шапки у тем разные (порт bloom/flux — `px-20 2xl:px-[300px]`, общий
 * Header — `md:px-10 lg:px-16 xl:px-20 2xl:px-[var(--header-container-px-2xl,280px)]`),
 * а разметка окна ОДНА на все темы. Эталонный `pr-[348px]` bloom.merfy.ru встал
 * бы под корзину только у bloom и только на 2xl.
 *
 * Кнопок в шапке несколько (мобильный и десктопный ряды, второй ярус), видима
 * всегда одна — берём самую правую из непустых прямоугольников. Не нашли ни
 * одной (шапки нет — например, превью отдельного блока) → переменные снимаем,
 * и окно садится на фолбэк из классов.
 *
 * Владелец, 19.09 (второй заход, уже по живому проду): «надо правее прям
 * напротив корзины». Первая версия равняла ПРАВЫЙ край окна по правому краю
 * иконки — окно целиком уходило влево от корзины. Теперь окно центрируется по
 * оси иконки: середина карточки под серединой кнопки. Ширину карточки берём
 * живым замером (max-w у окна разный: 430px на узких, 520px от md), поэтому
 * функция зовётся ПОСЛЕ снятия `hidden` — у скрытого элемента ширина 0.
 * Ось у правого края экрана — окно упёрлось бы за кромку, поэтому отступ
 * снизу ограничен `ANCHOR_MIN_SIDE`.
 */
const anchorToCartIcon = (modal: HTMLElement) => {
	const boxes = Array.from(document.querySelectorAll<HTMLElement>(CART_ANCHORS))
		.map((node) => node.getBoundingClientRect())
		.filter((rect) => rect.width > 0 && rect.height > 0);

	if (boxes.length === 0) {
		modal.style.removeProperty("--cart-modal-top");
		modal.style.removeProperty("--cart-modal-right");
		return;
	}

	const rect = boxes.reduce((widest, box) => (box.right > widest.right ? box : widest));
	const card = modal.querySelector<HTMLElement>(CARD);
	const cardWidth = card?.getBoundingClientRect().width ?? 0;
	const axis = rect.left + rect.width / 2;
	const right = Math.max(ANCHOR_MIN_SIDE, window.innerWidth - axis - cardWidth / 2);
	// Шапка не липкая: на прокрученной странице низ иконки уходит в минус
	// (замер 390×844 отдавал bottom = −410), и окно уползло бы за верх экрана
	// обрезанным. Ниже отступа-минимума не опускаемся.
	const top = Math.max(ANCHOR_MIN_SIDE, rect.bottom + ANCHOR_GAP);
	modal.style.setProperty("--cart-modal-top", `${Math.round(top)}px`);
	modal.style.setProperty("--cart-modal-right", `${Math.round(right)}px`);
};

const isAbsoluteUrl = (v: string) => /^(https?:)?\/\//i.test(v) || v.startsWith("data:");

/**
 * Источник цвета для окна. «Сайдбар» → корень дровера; «Страница» → ближайшая
 * обёртка схемы у нажатой кнопки, иначе корень документа.
 */
export function resolveCartSchemeSource(origin?: Element | null): Element {
	const root = document.documentElement;
	const cartType = getComputedStyle(root)
		.getPropertyValue("--cart-type")
		.trim()
		.replace(/['"]/g, "");
	if (cartType !== "page") {
		const drawer = document.querySelector('[data-nt$="cart-drawer"]');
		if (drawer) return drawer;
	}
	if (origin) {
		const wrapper = origin.closest('[class*="color-scheme-"]');
		if (wrapper) return wrapper;
	}
	return root;
}

/** Перенести вычисленные схемные токены с источника на окно. */
export function applyCartSchemeTo(target: HTMLElement, origin?: Element | null): void {
	const source = resolveCartSchemeSource(origin);
	const cs = getComputedStyle(source);
	for (const token of CART_SCHEME_TOKENS) {
		const value = cs.getPropertyValue(token).trim();
		if (value) target.style.setProperty(token, value);
		else target.style.removeProperty(token);
	}
}

/**
 * Название магазина — берём оттуда же, откуда его показывает шапка: логотип
 * шапки (`siteTitle` блока Header). Картинка → её `alt`, иначе текст ссылки.
 * Своего источника у окна нет: `siteTitle` — проп блока шапки, а окно живёт в
 * Layout. Ничего не нашли → надпись не рендерим (пусто лучше чужого бренда:
 * имя шаблона из шапки убрали ровно по этой причине).
 */
export function resolveStoreName(): string {
	const header =
		document.querySelector('[data-nt$="-header"]') ?? document.querySelector("header");
	if (!header) return "";
	const links = Array.from(header.querySelectorAll<HTMLAnchorElement>('a[href="/"]'));
	for (const link of links) {
		const img = link.querySelector("img");
		if (img) {
			const alt = (img.getAttribute("alt") ?? "").trim();
			if (alt) return alt;
		}
		const text = (link.textContent ?? "").replace(/\s+/g, " ").trim();
		if (text && text.length <= 60) return text;
	}
	for (const link of links) {
		const label = (link.getAttribute("aria-label") ?? "").trim();
		if (label) return label;
	}
	return "";
}

export const createCartAddedModal = (deps: CartAddedModalDeps) => {
	const productHref = (productId: string) =>
		`${deps.productPathPrefix}/${encodeURIComponent(productId)}`;

	const el = <T extends HTMLElement>(sel: string): T | null =>
		document.querySelector<T>(sel);

	/** Есть ли разметка окна на странице (тема подключила компонент). */
	const exists = () => Boolean(el(MODAL) && el(CARD));

	const lockBody = (locked: boolean) => {
		document.body.style.overflow = locked ? "hidden" : "";
	};

	const close = () => {
		const modal = el(MODAL);
		const card = el(CARD);
		if (!modal || !card || modal.classList.contains("hidden")) return;
		card.classList.add("translate-y-3", "opacity-0");
		card.classList.remove("translate-y-0", "opacity-100");
		modal.setAttribute("aria-hidden", "true");
		lockBody(false);
		window.setTimeout(() => {
			modal.classList.add("hidden");
			modal.classList.remove("flex");
		}, 220);
	};

	const open = (payload: CartAddedModalPayload) => {
		const modal = el(MODAL);
		const card = el(CARD);
		if (!modal || !card) return;

		applyCartSchemeTo(modal, payload.origin);

		const href = productHref(payload.productId);
		const brandEl = modal.querySelector<HTMLElement>("[data-cart-modal-brand]");
		const imageEl = modal.querySelector<HTMLImageElement>("[data-cart-modal-image]");
		const nameEls = modal.querySelectorAll<HTMLAnchorElement>(
			"[data-cart-modal-name], [data-cart-modal-product-link]",
		);
		const volumeEl = modal.querySelector<HTMLElement>("[data-cart-modal-volume]");
		const priceEl = modal.querySelector<HTMLElement>("[data-cart-modal-price]");
		const cartLink = modal.querySelector<HTMLAnchorElement>("[data-cart-modal-cart-link]");

		if (brandEl) {
			const store = resolveStoreName();
			brandEl.textContent = store;
			brandEl.classList.toggle("hidden", !store);
		}

		nameEls.forEach((node) => {
			node.href = href;
			if (node.matches("[data-cart-modal-name]")) node.textContent = payload.name;
		});

		if (imageEl) {
			// Абсолютный URL (MinIO/API) оставляем как есть — иначе получается
			// «/http://…» и картинка в окне битая (та же защита в cart-thumb-html).
			const raw = payload.image || "";
			imageEl.src = raw;
			imageEl.alt = payload.name;
			imageEl.classList.toggle("hidden", !raw);
			if (raw && !isAbsoluteUrl(raw) && !raw.startsWith("/")) imageEl.src = `/${raw}`;
		}

		if (volumeEl) {
			volumeEl.textContent = payload.volume ? `Объём: ${payload.volume}` : "";
			volumeEl.classList.toggle("hidden", !payload.volume);
		}

		if (priceEl) {
			const qty = payload.quantity ?? 1;
			priceEl.textContent =
				typeof payload.lineTotal === "number"
					? `${deps.formatPrice(payload.lineTotal)} · ${qty} шт.`
					: payload.price;
		}

		if (cartLink) cartLink.textContent = `Перейти в корзину (${deps.getCartCount()})`;

		// Сначала показываем, потом ставим на место: `anchorToCartIcon` меряет
		// ширину карточки, а у скрытого окна она нулевая. Оба шага в одном
		// синхронном блоке — браузер не успевает нарисовать промежуточный кадр,
		// так что окно не прыгает.
		modal.classList.remove("hidden");
		modal.classList.add("flex");
		anchorToCartIcon(modal);
		modal.setAttribute("aria-hidden", "false");
		lockBody(true);
		window.requestAnimationFrame(() => {
			card.classList.remove("translate-y-3", "opacity-0");
			card.classList.add("translate-y-0", "opacity-100");
		});
	};

	/**
	 * «Купить сейчас» — дословно механика rose (общий блок Product,
	 * `[data-product-action="buy-now"]`): сбросить залипший express-ключ и уйти
	 * на `/checkout`; в iframe конструктора — через нав-агента.
	 */
	const goToCheckout = () => {
		try {
			if (deps.themeKey) sessionStorage.removeItem(`${deps.themeKey}:buynow`);
		} catch {
			/* приватный режим — не мешаем переходу */
		}
		close();
		const inIframe = window.parent && window.parent !== window;
		if (inIframe) {
			try {
				window.parent.postMessage({ type: "navigate", path: "/checkout" }, "*");
				return;
			} catch {
				/* cross-origin — падаем на обычный переход */
			}
		}
		window.location.href = "/checkout";
	};

	/** Клик внутри окна. `true` — событие обработано, делегат дальше не идёт. */
	const handleClick = (target: HTMLElement): boolean => {
		if (target.closest("[data-cart-modal-buy-now]")) {
			goToCheckout();
			return true;
		}
		if (
			target.closest("[data-cart-modal-close]") ||
			target.closest("[data-cart-modal-overlay]") ||
			target.closest("[data-cart-modal-continue]")
		) {
			close();
			return true;
		}
		return false;
	};

	return { exists, open, close, handleClick };
};

export type CartAddedModalApi = ReturnType<typeof createCartAddedModal>;
