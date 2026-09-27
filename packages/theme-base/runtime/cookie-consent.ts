/**
 * Баннер согласия на cookie — ОДНА механика на все пять тем.
 *
 * Разметка — `primitives/CookieConsent.astro` (подключается одной строкой из
 * макета темы). Здесь только поведение:
 *   • баннер показывается, пока покупатель не нажал «Принять»; после нажатия
 *     в localStorage пишется `merfy:cookie-consent:v1` = дата согласия, и
 *     баннер больше не показывается ни на одной странице;
 *   • хранилище недоступно (приватный режим, запрет cookie, iframe без
 *     доступа) — ничего не падает: «Принять» прячет баннер до конца визита
 *     (память модуля), на следующей загрузке он появится снова;
 *   • ссылка «Политике конфиденциальности» показывается ТОЛЬКО если продавец
 *     написал политику в админке. Признак и адрес приезжают глобалом
 *     `window.__MERFY_PRIVACY_POLICY_URL__`: его ставят сборка витрины
 *     (build.service, themes-v2) и превью конструктора (preview.controller) из
 *     одной функции `privacyPolicyUrl` (src/utils/footer-data.ts) — тем же
 *     правилом, что ссылки политик в подвале. Нет глобала — ссылки нет
 *     (удаляется из DOM), а не «ссылка на демо-текст темы»;
 *   • в превью конструктора (iframe) нажатие на ссылку политики гасится:
 *     навигация конструктора по неизвестному адресу АВТОСОЗДАЁТ страницу
 *     (SiteConstructor.autoCreatePageFromPath), а мусорная страница в сайте
 *     продавца хуже, чем ссылка без перехода в режиме редактирования.
 *     Слушатель стоит на window в фазе захвата — раньше агента превью,
 *     который слушает document.
 *
 * Мягкая навигация Astro (ViewTransitions у rose/vanilla/bloom) подменяет
 * <body> — новый баннер приходит скрытым, поэтому состояние сверяется заново
 * на `astro:page-load`. Слушатели вешаются один раз на окно.
 */

export const COOKIE_CONSENT_STORAGE_KEY = "merfy:cookie-consent:v1";
export const PRIVACY_POLICY_URL_GLOBAL = "__MERFY_PRIVACY_POLICY_URL__";

const SELECTOR = {
	root: "[data-cookie-consent]",
	accept: "[data-cookie-consent-accept]",
	policy: "[data-cookie-consent-policy]",
	policyLink: "[data-cookie-consent-policy-link]",
} as const;

type ConsentWindow = Window & {
	[PRIVACY_POLICY_URL_GLOBAL]?: unknown;
	__merfyCookieConsentBound?: boolean;
};

/** «Принять» нажато в этом визите — на случай, если хранилище не пишет. */
let acceptedThisVisit = false;

function readStoredConsent(): string | null {
	try {
		return window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
	} catch {
		return null;
	}
}

function storeConsent(): void {
	try {
		window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, new Date().toISOString());
	} catch {
		// Хранилище недоступно — согласие живёт до конца визита (acceptedThisVisit).
	}
}

export function hasCookieConsent(): boolean {
	return acceptedThisVisit || Boolean(readStoredConsent());
}

/** Адрес политики из глобала сборки/превью; только путь своего сайта. */
export function privacyPolicyUrl(win: Window = window): string | null {
	const raw = (win as ConsentWindow)[PRIVACY_POLICY_URL_GLOBAL];
	if (typeof raw !== "string") return null;
	const url = raw.trim();
	const isOwnPath = url.startsWith("/") && !url.startsWith("//");
	return isOwnPath ? url : null;
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

/** Привести все баннеры страницы к текущему состоянию согласия и политики. */
export function syncCookieConsent(doc: Document = document): void {
	const accepted = hasCookieConsent();
	const url = privacyPolicyUrl();
	doc.querySelectorAll<HTMLElement>(SELECTOR.root).forEach((root) => {
		applyPolicyLink(root, url);
		root.hidden = accepted;
	});
}

function isPreviewFrame(): boolean {
	try {
		return window.self !== window.top;
	} catch {
		return true;
	}
}

function onClick(event: Event): void {
	const target = event.target instanceof Element ? event.target : null;
	if (target?.closest(SELECTOR.accept)) {
		acceptedThisVisit = true;
		storeConsent();
		syncCookieConsent();
		return;
	}
	if (!target?.closest(SELECTOR.policyLink) || !isPreviewFrame()) return;
	event.preventDefault();
	event.stopPropagation();
}

export function initCookieConsent(): void {
	syncCookieConsent();
	const win = window as ConsentWindow;
	if (win.__merfyCookieConsentBound) return;
	win.__merfyCookieConsentBound = true;
	window.addEventListener("click", onClick, true);
	document.addEventListener("astro:page-load", () => syncCookieConsent());
}
