/**
 * Баннер согласия на cookie — ОДНА механика на все пять тем.
 *
 * Разметка — `primitives/CookieConsent.astro` (подключается одной строкой из
 * макета темы). Здесь только поведение:
 *   • баннер показывается, пока покупатель не ответил: «Принять» пишет в
 *     localStorage `merfy:cookie-consent:v1` = дата согласия, «Отклонить» —
 *     `declined:<дата>`; после ответа баннер больше не показывается ни на
 *     одной странице;
 *   • хранилище недоступно (приватный режим, запрет cookie, iframe без
 *     доступа) — ничего не падает: ответ прячет баннер до конца визита
 *     (память модуля), на следующей загрузке он появится снова;
 *   • ссылка «Политике конфиденциальности» показывается ТОЛЬКО если продавец
 *     написал политику в админке. Признак и адрес приезжают глобалом
 *     `window.__MERFY_PRIVACY_POLICY_URL__`: его ставят сборка витрины
 *     (build.service, themes-v2) и превью конструктора (preview.controller) из
 *     одной функции `privacyPolicyUrl` (src/utils/footer-data.ts) — тем же
 *     правилом, что ссылки политик в подвале. Нет глобала — ссылки нет
 *     (удаляется из DOM), а не «ссылка на демо-текст темы»;
 *   • в превью конструктора (iframe) нажатие на ссылку политики гасится —
 *     общая функция `guardPreviewClicks` (runtime/preview-click-guard.ts):
 *     навигация конструктора по неизвестному адресу АВТОСОЗДАЁТ страницу.
 *
 * Настройки продавца («Настройки темы» → «Баннер», владелец 28.09):
 *   • тексты и кнопки (заголовок, текст, подписи кнопок «Основная» и
 *     «Дополнительная»; пустая подпись = кнопки нет) рисует ЭТОТ рантайм из глобала
 *     `window.__MERFY_COOKIE_BANNER__` — дист темы один на все магазины, как и
 *     с политикой выше. Глобал ставят сборка и превью (`cookieBannerGlobal`);
 *     в превью конструктор меняет его без перезагрузки: агент превью на
 *     `update-tokens` кладёт новые настройки и шлёт событие
 *     `merfy:cookie-banner`. Нет глобала — тексты по умолчанию, то есть
 *     ровно прежний баннер;
 *   • вкл/выкл, цветовая схема и расположение — CSS (`cookieBannerCss`,
 *     его зовёт tokens.css): тот же канал, что у схемы корзины, общий для
 *     пяти тем, витрины и превью, и горячий в конструкторе.
 *
 * В превью конструктора баннер виден ВСЕГДА, даже если в этом браузере уже
 * ответили (превью живёт на одном адресе gateway для всех магазинов, и один
 * ответ прятал бы баннер у всех): мерчант его настраивает. Нажатия на кнопки
 * там ничего не решают — агент превью выделяет баннер и открывает его
 * настройки.
 *
 * Мягкая навигация Astro (ViewTransitions у rose/vanilla/bloom) подменяет
 * <body> — новый баннер приходит скрытым, поэтому состояние сверяется заново
 * на `astro:page-load`. Слушатели вешаются один раз на окно.
 *
 * Модуль самодостаточен по соседям, кроме preview-click-guard: чистая часть
 * (настройки, разметка текста, CSS) импортируется и сервером (tokens-css,
 * build.service, preview.controller), и витриной.
 */

import { guardPreviewClicks } from "./preview-click-guard";

export const COOKIE_CONSENT_STORAGE_KEY = "merfy:cookie-consent:v1";
export const PRIVACY_POLICY_URL_GLOBAL = "__MERFY_PRIVACY_POLICY_URL__";
export const COOKIE_BANNER_GLOBAL = "__MERFY_COOKIE_BANNER__";
/** Событие «настройки баннера сменились» — шлёт агент превью конструктора. */
export const COOKIE_BANNER_UPDATE_EVENT = "merfy:cookie-banner";

const DECLINED_PREFIX = "declined:";

// ─── Настройки продавца ────────────────────────────────────────────────────

export const COOKIE_BANNER_POSITIONS = [
	"bottom-left",
	"bottom-center",
	"bottom-right",
	"bar",
] as const;
export type CookieBannerPosition = (typeof COOKIE_BANNER_POSITIONS)[number];

/**
 * Всё, что продавец настраивает у баннера (вид после разбора ревизии).
 *
 * Кнопки — как у секций («Кнопка основная / дополнительная» героя): подпись
 * есть — кнопка есть, пустая — кнопки нет (владелец 28.09: «Работает как
 * везде — отображает два инпута всегда»). Основная отвечает «согласен»,
 * дополнительная — «отказ».
 */
export interface CookieBannerSettings {
	enabled: boolean;
	/** id схемы («scheme-2»); null — баннер красится как страница. */
	colorScheme: string | null;
	heading: string;
	text: string;
	primaryLabel: string;
	secondaryLabel: string;
	position: CookieBannerPosition;
}

/**
 * Значения по умолчанию = баннер, каким он вышел 27.09: без заголовка, одна
 * кнопка, карточка слева снизу. Текст и подпись дословно совпадают с
 * разметкой `CookieConsent.astro` (сторож — cookie-consent.spec.ts).
 * Конструктор получает их с конфигом темы (`/api/themes/:id/puck-config`,
 * поле `cookieBanner`) — второй копии в нём нет.
 */
export const COOKIE_BANNER_DEFAULTS: Readonly<CookieBannerSettings> = Object.freeze({
	enabled: true,
	colorScheme: null,
	heading: "",
	text: "Мы используем файлы cookie, чтобы сайт работал корректно. Продолжая пользоваться сайтом, вы соглашаетесь с их использованием.",
	primaryLabel: "Принять",
	secondaryLabel: "",
	position: "bottom-left",
});

/**
 * Первая версия настроек (28.09, до правки владельца) хранила кнопки иначе:
 * `acceptLabel` (пустая = «Принять»), `declineEnabled` + `declineLabel`
 * (выключено = второй кнопки нет, пустая подпись = «Отклонить»). Такие
 * ревизии уже есть — читаем их по старым правилам, чтобы у магазина ничего
 * не поменялось. Новые ключи `primaryLabel`/`secondaryLabel`, если есть,
 * главнее. В ревизию старые ключи больше не пишутся.
 */
const LEGACY_DECLINE_LABEL = "Отклонить";

function nonEmpty(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

function legacyPrimary(own: Record<string, unknown>): string | undefined {
	return nonEmpty(own.acceptLabel) ? own.acceptLabel : undefined;
}

function legacySecondary(own: Record<string, unknown>): string | undefined {
	if (own.declineEnabled === false) return "";
	if (own.declineEnabled !== true) return undefined;
	return nonEmpty(own.declineLabel) ? own.declineLabel : LEGACY_DECLINE_LABEL;
}

/** Подписи кнопок: новые ключи → старые правила → по умолчанию. */
function buttonLabels(own: Record<string, unknown>): Pick<CookieBannerSettings, "primaryLabel" | "secondaryLabel"> {
	const pick = (next: unknown, legacy: string | undefined, fallback: string) =>
		typeof next === "string" ? next : (legacy ?? fallback);
	return {
		primaryLabel: pick(own.primaryLabel, legacyPrimary(own), COOKIE_BANNER_DEFAULTS.primaryLabel),
		secondaryLabel: pick(own.secondaryLabel, legacySecondary(own), COOKIE_BANNER_DEFAULTS.secondaryLabel),
	};
}

type Check<T> = (value: unknown) => value is T;

const isBoolean: Check<boolean> = (v): v is boolean => typeof v === "boolean";
const isString: Check<string> = (v): v is string => typeof v === "string";
const isSchemeId: Check<string> = (v): v is string => typeof v === "string" && v !== "";
const isPosition: Check<CookieBannerPosition> = (v): v is CookieBannerPosition =>
	(COOKIE_BANNER_POSITIONS as readonly unknown[]).includes(v);

type PlainSetting = Exclude<keyof CookieBannerSettings, "primaryLabel" | "secondaryLabel">;

/** Правило каждой настройки, кроме кнопок (их разбирает `buttonLabels`). */
const SETTING_CHECKS: { [K in PlainSetting]: Check<CookieBannerSettings[K]> } = {
	enabled: isBoolean,
	colorScheme: isSchemeId as Check<string | null>,
	// Заголовок и текст — «стёрто = пусто» (runtime/merchant-text): пустой
	// заголовок не рисуется, стёртый текст не возвращается текстом по умолчанию.
	heading: isString,
	text: isString,
	position: isPosition,
};

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** Настройки продавца поверх значений по умолчанию; мусор отбрасывается. */
export function resolveCookieBanner(raw: unknown): CookieBannerSettings {
	const own = asRecord(raw);
	const resolved = { ...COOKIE_BANNER_DEFAULTS } as Record<string, unknown>;
	for (const [key, check] of Object.entries(SETTING_CHECKS)) {
		if ((check as Check<unknown>)(own[key])) resolved[key] = own[key];
	}
	return { ...(resolved as unknown as CookieBannerSettings), ...buttonLabels(own) };
}

/** То, что рисует рантайм: тексты и кнопки. */
export type CookieBannerContent = Pick<
	CookieBannerSettings,
	"heading" | "text" | "primaryLabel" | "secondaryLabel"
>;

function contentOf(settings: CookieBannerSettings): CookieBannerContent {
	const { heading, text, primaryLabel, secondaryLabel } = settings;
	return { heading, text, primaryLabel, secondaryLabel };
}

/**
 * Глобал `__MERFY_COOKIE_BANNER__` для витрины и превью: только если продавец
 * трогал баннер. Не трогал — глобала нет, и баннер ровно прежний.
 */
export function cookieBannerGlobal(themeSettings: unknown): CookieBannerContent | null {
	const raw = asRecord(themeSettings).cookieBanner;
	if (Object.keys(asRecord(raw)).length === 0) return null;
	return contentOf(resolveCookieBanner(raw));
}

// ─── CSS: вкл/выкл, схема, расположение ────────────────────────────────────

const ROOT = "[data-cookie-consent]";
const CARD = "[data-cookie-consent-card]";
const DESKTOP = "@media (min-width:768px)";

/**
 * Расположение на компьютере. «Снизу слева» — вид по умолчанию, его держат
 * классы разметки, правила нет. На телефоне карточка всегда во всю ширину с
 * полями, кроме полосы. Правила вне слоёв, поэтому бьют утилиты Tailwind
 * разметки (они в `@layer utilities`).
 */
const POSITION_CSS: Record<CookieBannerPosition, string> = {
	"bottom-left": "",
	"bottom-center": `${DESKTOP}{${ROOT}{left:0;right:0;margin-inline:auto}}`,
	"bottom-right": `${DESKTOP}{${ROOT}{left:auto;right:1.5rem}}`,
	bar:
		`${ROOT}{left:0;right:0;bottom:0;width:auto;margin:0}` +
		`${CARD}{border-radius:0;border-width:1px 0 0 0}` +
		`${DESKTOP}{${CARD}{flex-direction:row;align-items:center;justify-content:space-between;gap:1.5rem;padding:1rem 1.5rem}` +
		`${CARD} > [data-cookie-consent-actions]{align-self:center;flex-shrink:0}}`,
};

/**
 * CSS настроек баннера для tokens.css. `schemeVars` — переменные выбранной
 * схемы (tokens-css знает палитру магазина); пусто — схема не выбрана или
 * такой нет, баннер красится как страница.
 */
export function cookieBannerCss(settings: CookieBannerSettings, schemeVars: string): string {
	if (!settings.enabled) return `${ROOT}{display:none !important}`;
	const schemeRule = schemeVars ? `${ROOT}{${schemeVars}}` : "";
	return schemeRule + POSITION_CSS[settings.position];
}

// ─── Текст продавца → разметка ─────────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Жирный/курсив кнопок «Ж»/«К» поля конструктора — единственные теги текста. */
const FORMAT_TAG = /&lt;(\/?)(strong|em|b|i)&gt;/g;
const withFormatting = (escaped: string): string => escaped.replace(FORMAT_TAG, "<$1$2>");

/** Схемы ссылок, как у `safeHref` (runtime/rich-text.ts), без sanitize-html в бандле витрины. */
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/** Адрес ссылки из текста продавца; недоверенный → null (ссылка станет текстом). */
export function safeBannerHref(value: string): string | null {
	const raw = value.trim();
	if (!raw || raw.startsWith("//")) return null;
	const probe = raw.replace(/[\u0000- ]/g, "");
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe)?.[1];
	if (!scheme) return raw;
	return SAFE_SCHEMES.has(scheme.toLowerCase()) ? raw : null;
}

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function linkHtml(label: string, url: string, linkClass: string): string {
	const text = withFormatting(escapeHtml(label));
	const href = safeBannerHref(url);
	if (!href) return text;
	return `<a href="${escapeHtml(href)}" class="${escapeHtml(linkClass)}">${text}</a>`;
}

/**
 * Текст продавца → безопасная разметка: всё экранируется, кроме жирного и
 * курсива, а `[текст](адрес)` становится ссылкой — тот же синтаксис, что у
 * «Условий» чекаута. Своих атрибутов у продавца нет: класс ссылки ставит
 * разметка баннера.
 */
export function formatCookieBannerText(value: string, linkClass = ""): string {
	let out = "";
	let from = 0;
	for (const match of value.matchAll(MARKDOWN_LINK)) {
		const at = match.index ?? 0;
		out += withFormatting(escapeHtml(value.slice(from, at)));
		out += linkHtml(match[1], match[2], linkClass);
		from = at + match[0].length;
	}
	return out + withFormatting(escapeHtml(value.slice(from)));
}

// ─── Поведение на странице ─────────────────────────────────────────────────

const SELECTOR = {
	root: ROOT,
	accept: "[data-cookie-consent-accept]",
	decline: "[data-cookie-consent-decline]",
	heading: "[data-cookie-consent-heading]",
	text: "[data-cookie-consent-text]",
	policy: "[data-cookie-consent-policy]",
	policyLink: "[data-cookie-consent-policy-link]",
} as const;

type ConsentWindow = Window & {
	[PRIVACY_POLICY_URL_GLOBAL]?: unknown;
	[COOKIE_BANNER_GLOBAL]?: unknown;
	__merfyCookieConsentBound?: boolean;
};

/** Покупатель ответил в этом визите — на случай, если хранилище не пишет. */
let answeredThisVisit = false;

function readStoredDecision(): string | null {
	try {
		return window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
	} catch {
		return null;
	}
}

function storeDecision(value: string): void {
	try {
		window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value);
	} catch {
		// Хранилище недоступно — ответ живёт до конца визита (answeredThisVisit).
	}
}

/** Покупатель уже ответил на баннер («Принять» или «Отклонить»). */
export function hasCookieConsent(): boolean {
	return answeredThisVisit || Boolean(readStoredDecision());
}

/** Что ответил покупатель: принял, отказался или ещё не отвечал. */
export function cookieConsentDecision(): "accepted" | "declined" | null {
	const stored = readStoredDecision();
	if (!stored) return null;
	return stored.startsWith(DECLINED_PREFIX) ? "declined" : "accepted";
}

/** Страница открыта в превью конструктора (iframe), а не на витрине. */
function inPreviewFrame(win: Window = window): boolean {
	try {
		return win.self !== win.top;
	} catch {
		return true;
	}
}

/** Адрес политики из глобала сборки/превью; только путь своего сайта. */
export function privacyPolicyUrl(win: Window = window): string | null {
	const raw = (win as ConsentWindow)[PRIVACY_POLICY_URL_GLOBAL];
	if (typeof raw !== "string") return null;
	const url = raw.trim();
	const isOwnPath = url.startsWith("/") && !url.startsWith("//");
	return isOwnPath ? url : null;
}

/** Тексты и кнопки из глобала; нет глобала — значения по умолчанию. */
export function cookieBannerContent(win: Window = window): CookieBannerContent {
	return contentOf(resolveCookieBanner((win as ConsentWindow)[COOKIE_BANNER_GLOBAL]));
}

function applyPolicyLink(root: Element, url: string | null): void {
	const slot = root.querySelector<HTMLElement>(SELECTOR.policy);
	const link = slot?.querySelector<HTMLAnchorElement>(SELECTOR.policyLink);
	if (!slot || !link) return;
	if (!url) {
		slot.remove();
		return;
	}
	link.setAttribute("href", url);
	slot.hidden = false;
}

/** Класс ссылок продавца — тот же, что у ссылки политики в разметке. */
function linkClassOf(root: Element): string {
	return root.querySelector(SELECTOR.policyLink)?.getAttribute("class") ?? "";
}

/** Подпись кнопки; пустая — кнопки нет (как у кнопок секций). */
function applyButton(button: HTMLElement | null, label: string): void {
	if (!button) return;
	button.textContent = label;
	button.hidden = label.trim() === "";
}

function applyContent(root: Element, content: CookieBannerContent): void {
	const heading = root.querySelector<HTMLElement>(SELECTOR.heading);
	const text = root.querySelector<HTMLElement>(SELECTOR.text);
	if (heading) {
		heading.innerHTML = formatCookieBannerText(content.heading);
		heading.hidden = content.heading.trim() === "";
	}
	if (text) text.innerHTML = formatCookieBannerText(content.text, linkClassOf(root));
	applyButton(root.querySelector<HTMLElement>(SELECTOR.accept), content.primaryLabel);
	applyButton(root.querySelector<HTMLElement>(SELECTOR.decline), content.secondaryLabel);
}

/** Привести все баннеры страницы к текущему ответу, настройкам и политике. */
export function syncCookieConsent(doc: Document = document): void {
	const hidden = hasCookieConsent() && !inPreviewFrame();
	const url = privacyPolicyUrl();
	const content = cookieBannerContent();
	doc.querySelectorAll<HTMLElement>(SELECTOR.root).forEach((root) => {
		applyContent(root, content);
		applyPolicyLink(root, url);
		root.hidden = hidden;
	});
}

/** Ответ по нажатой кнопке; не кнопка баннера — null. */
function decisionFor(target: Element): string | null {
	const now = new Date().toISOString();
	if (target.closest(SELECTOR.accept)) return now;
	if (target.closest(SELECTOR.decline)) return `${DECLINED_PREFIX}${now}`;
	return null;
}

function onClick(event: Event): void {
	const target = event.target instanceof Element ? event.target : null;
	const decision = target ? decisionFor(target) : null;
	// В превью ответ ничего не решает: нажатие забирает агент превью (выделение).
	if (!decision || inPreviewFrame()) return;
	answeredThisVisit = true;
	storeDecision(decision);
	syncCookieConsent();
}

export function initCookieConsent(): void {
	syncCookieConsent();
	const win = window as ConsentWindow;
	if (win.__merfyCookieConsentBound) return;
	win.__merfyCookieConsentBound = true;
	window.addEventListener("click", onClick, true);
	guardPreviewClicks(window, SELECTOR.policyLink);
	document.addEventListener("astro:page-load", () => syncCookieConsent());
	document.addEventListener(COOKIE_BANNER_UPDATE_EVENT, () => syncCookieConsent());
}
