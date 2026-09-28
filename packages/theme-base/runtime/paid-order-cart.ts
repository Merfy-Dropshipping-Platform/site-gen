/**
 * Корзина после оплаченного заказа — одно правило для всех тем.
 *
 * Баг владельца 26.09: «после оплаты корзина не сбрасывается, отображаются
 * старые и оплаченные товары». Кнопка «Оплатить» (CheckoutSubmit) перед уходом
 * на платёжку стирала только указатель серверной корзины (`merfy:cartId`), а
 * корзину покупателя — `<тема>:cart:v1`, из которой рисуются счётчик в шапке,
 * выдвижная корзина и страница корзины, — не трогал никто. Стирать её прямо на
 * кнопке нельзя: покупатель может отменить оплату или вернуться «Назад» со
 * страницы платёжки — корзина должна остаться.
 *
 * Поэтому так:
 *  1. CheckoutSubmit, получив ссылку на оплату, пишет `merfy:pendingOrder`
 *     ({ orderId, apiBase, items }) и уходит на платёжку. Корзину не трогает.
 *  2. На любой странице витрины ядро корзины (nt-cart → initCartUI) спрашивает
 *     статус оплаты этого заказа и поступает по таблице PAYMENT_VERDICT:
 *     оплачен — убирает из корзины заказанные позиции и забывает заказ;
 *     отменён/не прошёл — забывает заказ, корзину оставляет; ещё идёт — ждёт
 *     следующей страницы.
 *  3. Страница «Спасибо за заказ» (OrderConfirmation) сама опрашивает сводку
 *     заказа и сообщает статус событием ORDER_STATUS_EVENT — корзина на этой
 *     странице сбрасывается, как только оплата прошла, без лишнего запроса.
 *
 * Статус берём из `GET /orders/:id/payment-status`: при `pending` orders сам
 * сверяется с платёжной системой, не дожидаясь вебхука.
 */
import type { NtCartLine } from "./nt-cart";

/** Ключ localStorage: заказ, ушедший на оплату. Пишет CheckoutSubmit (строкой — у него is:inline). */
export const PENDING_ORDER_KEY = "merfy:pendingOrder";

/** Событие страницы «Спасибо за заказ»: `{ orderId, paymentStatus }` из сводки заказа. */
export const ORDER_STATUS_EVENT = "merfy:order-status";

/** Заказанная позиция — как её отправили в серверную корзину. */
export interface OrderedItem {
	productId: string;
	variantCombinationId: string | null;
}

export interface PendingOrder {
	orderId: string;
	/** База API, с которой оформляли (у dev-контура она своя). */
	apiBase: string;
	items: OrderedItem[];
}

type Verdict = "paid" | "abandoned" | "wait";

/**
 * Статус оплаты (orders.payment_status) → что делать с корзиной.
 * Незнакомый статус и сбой сети — «ждать»: лучше лишний раз показать корзину,
 * чем потерять её. `not_found` — заказа нет (404): помнить нечего.
 */
export const PAYMENT_VERDICT: Readonly<Record<string, Verdict>> = {
	succeeded: "paid",
	refunded: "paid",
	failed: "abandoned",
	cancelled: "abandoned",
	not_found: "abandoned",
	pending: "wait",
	processing: "wait",
};

export const verdictOf = (status: unknown): Verdict => PAYMENT_VERDICT[String(status)] ?? "wait";

const isOrderedItem = (x: unknown): x is OrderedItem =>
	!!x && typeof (x as OrderedItem).productId === "string";

/** Разобрать запись `merfy:pendingOrder`; мусор → null. */
export const readPendingOrder = (raw: string | null): PendingOrder | null => {
	if (!raw) return null;
	try {
		const p = JSON.parse(raw) as Partial<PendingOrder>;
		if (!p || typeof p.orderId !== "string" || !p.orderId) return null;
		return {
			orderId: p.orderId,
			apiBase: typeof p.apiBase === "string" ? p.apiBase : "",
			items: Array.isArray(p.items) ? p.items.filter(isOrderedItem) : [],
		};
	} catch {
		return null;
	}
};

const itemKey = (productId: string, combinationId: string | null | undefined) => `${productId}|${combinationId ?? ""}`;

/**
 * Корзина без заказанного. Позиции, добавленные уже после ухода на оплату,
 * остаются. Список заказанного пуст (старая запись) — заказана вся корзина.
 */
export const withoutOrdered = (lines: NtCartLine[], items: OrderedItem[]): NtCartLine[] => {
	if (items.length === 0) return [];
	const ordered = new Set(items.map((i) => itemKey(i.productId, i.variantCombinationId)));
	return lines.filter((l) => !ordered.has(itemKey(l.productId, l.variant?.variantCombinationId)));
};

export interface PaidOrderCartDeps {
	storage: Pick<Storage, "getItem" | "removeItem">;
	fetch: typeof fetch;
	getCart: () => NtCartLine[];
	saveCart: (lines: NtCartLine[]) => void;
	/** База API на случай записи без apiBase. */
	defaultApiBase: string;
}

/** Статус оплаты с сервера. Сбой сети → undefined («ждать»). */
const fetchPaymentStatus = async (deps: PaidOrderCartDeps, order: PendingOrder): Promise<string | undefined> => {
	const base = (order.apiBase || deps.defaultApiBase).replace(/\/+$/, "");
	try {
		const res = await deps.fetch(`${base}/orders/${encodeURIComponent(order.orderId)}/payment-status`);
		if (res.status === 404) return "not_found";
		const json = (await res.json()) as { data?: { status?: string } } | null;
		return json?.data?.status;
	} catch {
		return undefined;
	}
};

const ACTIONS: Readonly<Record<Verdict, (deps: PaidOrderCartDeps, order: PendingOrder) => void>> = {
	paid: (deps, order) => {
		deps.saveCart(withoutOrdered(deps.getCart(), order.items));
		deps.storage.removeItem(PENDING_ORDER_KEY);
	},
	abandoned: (deps) => deps.storage.removeItem(PENDING_ORDER_KEY),
	wait: () => undefined,
};

/**
 * Свести корзину с исходом оплаты. `known` — статус, уже известный странице
 * (событие ORDER_STATUS_EVENT), тогда без запроса. Пока шёл запрос, в другой
 * вкладке могли оформить новый заказ — действуем, только если запись та же.
 */
export const settlePaidOrder = async (
	deps: PaidOrderCartDeps,
	known?: { orderId?: string; paymentStatus?: string },
): Promise<void> => {
	const order = readPendingOrder(deps.storage.getItem(PENDING_ORDER_KEY));
	if (!order) return;
	const status =
		known?.orderId === order.orderId ? known.paymentStatus : await fetchPaymentStatus(deps, order);
	if (readPendingOrder(deps.storage.getItem(PENDING_ORDER_KEY))?.orderId !== order.orderId) return;
	ACTIONS[verdictOf(status)](deps, order);
};
