/**
 * @jest-environment jsdom
 */
/**
 * После оплаты корзина пустеет, после отмены оплаты — остаётся.
 *
 * Владелец 26.09: «После оплаты корзина не сбрасывается, отображаются старые и
 * оплаченные товары». «Оплатить» (CheckoutSubmit) стирал только указатель
 * серверной корзины `merfy:cartId`, а корзину покупателя `<тема>:cart:v1` —
 * счётчик в шапке, выдвижная, страница корзины — не трогал никто, ни на кнопке,
 * ни на странице «Спасибо за заказ».
 *
 * Проверяем путь покупателя из настоящего кода: встроенный скрипт «Оплатить»
 * из CheckoutSubmit.astro → платёжка → любая страница витрины с общим ядром
 * корзины (nt-cart initCartUI) и ответом `payment-status`; и событие страницы
 * «Спасибо за заказ» (встроенный скрипт OrderConfirmation.astro). Ключи
 * корзины — всех пяти тем: ядро одно, различается только ключ.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createNtCart, type NtCartLine } from "../../../packages/theme-base/runtime/nt-cart";
import {
	ORDER_STATUS_EVENT,
	PENDING_ORDER_KEY,
	verdictOf,
	withoutOrdered,
} from "../../../packages/theme-base/runtime/paid-order-cart";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
const API = "https://gateway.test/api";

const inlineScript = (file: string): string => {
	const src = readFileSync(resolve(SITES_ROOT, file), "utf-8");
	const body = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src)?.[1];
	if (!body) throw new Error(`${file}: нет встроенного скрипта`);
	return body;
};
const CHECKOUT_SUBMIT = inlineScript("packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.astro");
const ORDER_CONFIRMATION = inlineScript("packages/theme-base/blocks/OrderConfirmation/OrderConfirmation.astro");

const flush = async (n = 30) => {
	for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

const SOCKS: NtCartLine = {
	id: "socks|combo-1",
	productId: "socks",
	name: "Носки «Набор»",
	price: 2690,
	image: "",
	quantity: 2,
	variant: { variantCombinationId: "combo-1" },
};
const MUG: NtCartLine = { id: "mug", productId: "mug", name: "Кружка", price: 500, image: "", quantity: 1 };

const json = (status: number, body: unknown) =>
	Promise.resolve({ ok: status < 400, status, json: async () => body } as unknown as Response);

let fetchMock: jest.Mock;
/** Статус оплаты на сервере; "network-error" — сеть легла. */
let paymentStatus: string;

/**
 * На живой странице ядро корзины одно; здесь каждая «страница» создаёт своё.
 * Слушатели прошлых «страниц» снимаем, иначе они отвечали бы за текущую.
 */
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
for (const target of [window, document] as EventTarget[]) {
	const add = target.addEventListener.bind(target);
	target.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => {
		listeners.push([target, type, fn]);
		add(type, fn, opts as AddEventListenerOptions);
	}) as typeof target.addEventListener;
}

function resetWindow(): void {
	for (const [target, type, fn] of listeners.splice(0)) target.removeEventListener(type, fn);
	localStorage.clear();
	sessionStorage.clear();
	document.body.innerHTML = "";
	paymentStatus = "pending";
	fetchMock = jest.fn((url: string) => {
		if (/\/payment-status$/.test(url)) {
			return paymentStatus === "network-error"
				? Promise.reject(new TypeError("Failed to fetch"))
				: json(200, { success: true, data: { status: paymentStatus } });
		}
		if (/\/summary$/.test(url)) return json(200, { success: true, data: { orderNumber: "100500", paymentStatus, items: [] } });
		if (/\/checkout$/.test(url)) return json(200, { success: true, data: { orderId: "order-1" } });
		if (/\/create-payment$/.test(url)) return json(200, { success: true, data: { confirmationUrl: "https://pay.test/x" } });
		if (/products\.json/.test(url)) return json(200, []);
		return json(200, { success: true, data: {} });
	});
	(window as unknown as { fetch: unknown }).fetch = fetchMock;
	(globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
	(window as unknown as { __MERFY_CONFIG__: unknown }).__MERFY_CONFIG__ = { shopId: "shop-1", apiUrl: API };
}

/** Чекаут: «Оплатить» из CheckoutSubmit.astro над заполненной формой. */
async function payOnCheckout(storageKey: string): Promise<void> {
	document.body.innerHTML = `
		<section data-block="checkout-submit">
			<div data-checkout-submit-error hidden></div>
			<button data-checkout-submit disabled>Оплатить {total}</button>
		</section>
		<div data-checkout-delivery></div>
		<div data-checkout-field="email"><input value="a@b.ru" /></div>
		<div data-checkout-field="phone"><input value="+79990000000" /></div>
		<div data-checkout-field="firstName"><input value="Иван" /></div>
		<div data-checkout-field="lastName"><input value="Петров" /></div>
		<div data-checkout-field="city"><input value="Москва" /></div>
		<div data-checkout-field="street"><input value="Тверская" /></div>
		<div data-checkout-field="building"><input value="1" /></div>`;
	const section = document.querySelector<HTMLElement>('[data-block="checkout-submit"]')!;
	const w = window as unknown as Record<string, unknown>;
	w.__merfyRoot = () => section;
	// Как checkout.astro: серверная корзина собрана из <тема>:cart:v1.
	const lines = JSON.parse(localStorage.getItem(storageKey) || "[]") as NtCartLine[];
	w.cartStore = {
		getItems: () =>
			lines.map((l) => ({
				productId: l.productId,
				quantity: l.quantity,
				unitPriceCents: l.price * 100,
				variantCombinationId: l.variant?.variantCombinationId ?? null,
			})),
		syncToServer: async () => "cart-1",
	};
	delete w.location;
	w.location = { origin: "https://shop.test", href: "", search: "" };
	// eslint-disable-next-line @typescript-eslint/no-implied-eval -- исполняем настоящий встроенный скрипт блока
	new Function("buttonText", "loadingText", "successRedirectUrl", "blockId", CHECKOUT_SUBMIT)(
		"Оплатить {total}",
		"Оформляем…",
		"/checkout-result",
		"cs-1",
	);
	document.dispatchEvent(new CustomEvent("checkout:delivery-changed", { detail: { type: "self_pickup", costCents: 0 } }));
	document.dispatchEvent(new CustomEvent("checkout:payment-method-changed", { detail: { method: "bank_card" } }));
	section.querySelector<HTMLButtonElement>("[data-checkout-submit]")!.click();
	await flush();
	expect((window as unknown as { location: { href: string } }).location.href).toBe("https://pay.test/x");
	delete w.cartStore;
}

/** Любая страница витрины: шапка со счётчиком + общее ядро корзины. */
function openStorefrontPage(theme: string) {
	for (const [target, type, fn] of listeners.splice(0)) target.removeEventListener(type, fn);
	document.body.innerHTML = '<header><span data-cart-count>0</span></header>';
	const cart = createNtCart({
		storageKey: `${theme}:cart:v1`,
		eventPrefix: `${theme}:cart`,
		renderDrawerItem: (l) => `<li data-line-id="${l.id}"></li>`,
	});
	cart.initCartUI();
	return cart;
}

const badge = () => document.querySelector("[data-cart-count]")!.textContent;
const pending = () => localStorage.getItem(PENDING_ORDER_KEY);

describe.each(THEMES)("%s: корзина после оплаты", (theme) => {
	const key = `${theme}:cart:v1`;

	beforeEach(async () => {
		resetWindow();
		localStorage.setItem(key, JSON.stringify([SOCKS]));
		await payOnCheckout(key);
	});

	it("«Оплатить» запоминает заказ и НЕ трогает корзину до исхода оплаты", () => {
		expect(JSON.parse(localStorage.getItem(key)!)).toEqual([SOCKS]);
		expect(JSON.parse(pending()!)).toEqual({
			orderId: "order-1",
			apiBase: API,
			items: [{ productId: "socks", variantCombinationId: "combo-1" }],
		});
	});

	it("оплата прошла → счётчик 0, корзина пуста, заказ забыт", async () => {
		paymentStatus = "succeeded";
		const cart = openStorefrontPage(theme);
		await flush();
		expect(fetchMock).toHaveBeenCalledWith(`${API}/orders/order-1/payment-status`);
		expect(cart.getCart()).toEqual([]);
		expect(badge()).toBe("0");
		expect(pending()).toBeNull();
	});

	it("оплату отменили → корзина на месте, заказ забыт", async () => {
		paymentStatus = "cancelled";
		const cart = openStorefrontPage(theme);
		await flush();
		expect(cart.getCart()).toEqual([SOCKS]);
		expect(badge()).toBe("2");
		expect(pending()).toBeNull();
	});

	it("оплата ещё идёт (или нет сети) → корзина на месте, заказ помним до следующей страницы", async () => {
		for (const status of ["pending", "network-error"]) {
			paymentStatus = status;
			const cart = openStorefrontPage(theme);
			await flush();
			expect(cart.getCart()).toEqual([SOCKS]);
			expect(pending()).not.toBeNull();
		}
		paymentStatus = "succeeded";
		const cart = openStorefrontPage(theme);
		await flush();
		expect(cart.getCart()).toEqual([]);
	});

	it("положенное в корзину уже после ухода на оплату остаётся", async () => {
		localStorage.setItem(key, JSON.stringify([SOCKS, MUG]));
		paymentStatus = "succeeded";
		const cart = openStorefrontPage(theme);
		await flush();
		expect(cart.getCart()).toEqual([MUG]);
		expect(badge()).toBe("1");
	});

	it("«Спасибо за заказ» сообщает «оплачен» → корзина пустеет сразу, без ожидания следующей страницы", async () => {
		paymentStatus = "pending";
		const cart = openStorefrontPage(theme);
		await flush();
		expect(cart.getCart()).toEqual([SOCKS]);

		paymentStatus = "succeeded";
		const root = document.createElement("section");
		root.setAttribute("data-block", "order-confirmation");
		root.innerHTML = "<div data-oc-state hidden></div><div data-oc-content hidden><div data-oc-items></div></div>";
		document.body.append(root);
		(window as unknown as { __merfyRoot: unknown }).__merfyRoot = () => root;
		(window as unknown as { location: { search: string } }).location.search = "?orderId=order-1";
		fetchMock.mockClear();
		// eslint-disable-next-line @typescript-eslint/no-implied-eval -- исполняем настоящий встроенный скрипт блока
		new Function("blockId", "apiBase", "greetingTpl", "confTitle", "confNote", ORDER_CONFIRMATION)(
			"oc-1",
			API,
			"Спасибо за заказ, {name}!",
			"Ваш заказ подтверждён",
			"",
		);
		await flush();
		expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([`${API}/orders/order-1/summary`]);
		expect(cart.getCart()).toEqual([]);
		expect(badge()).toBe("0");
		expect(pending()).toBeNull();
	});
});

describe("правило исхода оплаты", () => {
	it("незнакомый статус не чистит корзину", () => {
		expect(verdictOf("succeeded")).toBe("paid");
		expect(verdictOf("cancelled")).toBe("abandoned");
		expect(verdictOf("что-то новое")).toBe("wait");
		expect(verdictOf(undefined)).toBe("wait");
	});

	it("старая запись без списка заказанного — заказана вся корзина", () => {
		expect(withoutOrdered([SOCKS, MUG], [])).toEqual([]);
	});

	it("событие чужого заказа корзину не трогает", async () => {
		resetWindow();
		localStorage.setItem("flux:cart:v1", JSON.stringify([SOCKS]));
		localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ orderId: "order-2", apiBase: API, items: [] }));
		const cart = openStorefrontPage("flux");
		await flush();
		window.dispatchEvent(new CustomEvent(ORDER_STATUS_EVENT, { detail: { orderId: "order-1", paymentStatus: "succeeded" } }));
		await flush();
		expect(cart.getCart()).toEqual([SOCKS]);
		expect(pending()).not.toBeNull();
	});
});
