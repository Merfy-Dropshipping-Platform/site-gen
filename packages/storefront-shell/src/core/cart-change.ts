import { changeItem, readCart, removeItem, type CartApi } from './cart-server';
import { failed, type Failure, failureOf, reportFailure, reportWarning } from './failures';
import { apiOf, CART_ID_KEY, cartIdOf, emptyTotals, readCartInto, type CartRuntime } from './parts/cart';
import type { ActionOptions, CartLine, CartState, Result } from './types';

// cart.change и cart.remove (блок 10, 10.1, «Решил сам» п. 3): по номеру строки, в очереди корзины (п. 4 блока 9).

export interface ChangeArgs {
  readonly lineId: string;
  readonly quantity: number; // целое от 0; 0 — убрать строку
}

export const remainText = (left: number): string => `Осталось ${left} шт. — больше нет в наличии`;

const isLineId = (value: unknown): boolean => typeof value === 'string' && value !== '';
const isQuantityFrom0 = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= 0;

// Проверка аргументов сразу, по порядку (п. 3): ошибка — invalid без запросов.
function argsFailure(name: string, args: ChangeArgs): Failure | null {
  if (!isLineId(args.lineId)) return failureOf('invalid', `${name}: lineId — непустая строка`);
  if (name === 'cart.remove') return null;
  if (!isQuantityFrom0(args.quantity)) return failureOf('invalid', `${name}: quantity — целое число от 0`);
  return null;
}

const lineById = (rt: CartRuntime, lineId: string): CartLine | null =>
  rt.state.get().lines.find((line) => line.id === lineId) ?? null;

const shiftWaiting = (rt: CartRuntime, delta: number): void =>
  rt.writeStores(() => rt.adding.set(rt.adding.get() + delta));

// Выход без запроса или с ошибкой: разница счётчика снята, ошибка — автору или покупателю.
function bailOut(rt: CartRuntime, diff: number, failure: Failure, options?: ActionOptions): Result<CartState> {
  shiftWaiting(rt, -diff);
  reportFailure(rt.core, failure, options);
  return failed(failure);
}

// События — после записи: строка ушла или количество другое; сервер урезал — предупреждение (Р10а-3).
function emitChange(rt: CartRuntime, line: CartLine, asked: number, options?: ActionOptions): void {
  const next = rt.state.get().lines.find((current) => current.id === line.id) ?? null;
  if (next === null) {
    rt.core.emit('merfy:cart:remove', {
      lineId: line.id,
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
    });
    return;
  }
  if (next.quantity !== line.quantity) {
    rt.core.emit('merfy:cart:change', {
      lineId: line.id,
      productId: line.productId,
      variantId: line.variantId,
      quantity: next.quantity,
      previousQuantity: line.quantity,
    });
  }
  if (next.quantity !== 0 && next.quantity < asked) reportWarning(rt.core, remainText(next.quantity), options);
}

// Успех PATCH или DELETE: перечитать корзину; строки, итоги и снятие разницы — одной записью (п. 5).
async function finishChange(
  rt: CartRuntime,
  line: CartLine,
  asked: number,
  conf: CartApi,
  cartId: string,
  diff: number,
  options?: ActionOptions,
): Promise<Result<CartState>> {
  const outcome = await readCart(conf, cartId);
  if (outcome.kind === 'failure') return bailOut(rt, diff, outcome.failure, options);
  const lines = outcome.kind === 'missing' ? [] : outcome.lines;
  const totals = outcome.kind === 'lines' ? outcome.totals : undefined;
  if (outcome.kind === 'missing') rt.page.removeItem(CART_ID_KEY);
  rt.writeStores(() => {
    rt.readDone = true;
    rt.readAt = Date.now();
    rt.state.set({ ready: true, lines });
    if (totals === undefined) rt.totals.set(emptyTotals(rt.core.config?.currency ?? 'RUB', true));
    else if (totals !== null) rt.totals.set(totals);
    rt.adding.set(rt.adding.get() - diff);
  });
  emitChange(rt, line, asked, options);
  return { ok: true, data: rt.state.get() };
}

// Задача в очереди: без запроса — разница снята; запрос — PATCH (quantity ≥ 1) или DELETE (0) (пп. 3–4).
async function changeOnServer(
  rt: CartRuntime,
  name: string,
  args: ChangeArgs,
  conf: CartApi,
  diff: number,
  options?: ActionOptions,
): Promise<Result<CartState>> {
  if (!rt.readDone) {
    const readFailure = await readCartInto(rt);
    if (readFailure !== null) return bailOut(rt, diff, readFailure, options);
  }
  const cartId = cartIdOf(rt.page);
  const line = lineById(rt, args.lineId);
  if (cartId === null || line === null) {
    return bailOut(rt, diff, failureOf('invalid', `${name}: строки ${args.lineId} в корзине нет`), options);
  }
  if (line.gift) return bailOut(rt, diff, failureOf('invalid', `${name}: подарок акции не меняется`), options);
  if (line.quantity === args.quantity) {
    shiftWaiting(rt, -diff);
    return { ok: true, data: rt.state.get() };
  }
  const changed =
    args.quantity === 0
      ? await removeItem(conf, cartId, args.lineId)
      : await changeItem(conf, cartId, args.lineId, args.quantity);
  if (changed.kind === 'failure') return bailOut(rt, diff, changed.failure, options);
  return finishChange(rt, line, args.quantity, conf, cartId, diff, options);
}

function changeIn(
  rt: CartRuntime,
  name: 'cart.change' | 'cart.remove',
  args: ChangeArgs,
  options?: ActionOptions,
): Promise<Result<CartState>> {
  const problem = argsFailure(name, args);
  if (problem !== null) {
    reportFailure(rt.core, problem);
    return Promise.resolve(failed(problem));
  }
  const conf = apiOf(rt.core);
  if (conf === null) {
    const failure = failureOf('server', `${name}: конфиг витрины не прочитан`);
    reportFailure(rt.core, failure, options);
    return Promise.resolve(failed(failure));
  }
  const known = lineById(rt, args.lineId);
  const diff = known === null ? 0 : args.quantity - known.quantity;
  shiftWaiting(rt, diff);
  return rt.enqueue(() => changeOnServer(rt, name, args, conf, diff, options));
}

export function changeInModule(
  rt: CartRuntime,
): (args: ChangeArgs, options?: ActionOptions) => Promise<Result<CartState>> {
  return (args, options) => changeIn(rt, 'cart.change', args, options);
}

export function removeInModule(
  rt: CartRuntime,
): (args: { readonly lineId: string }, options?: ActionOptions) => Promise<Result<CartState>> {
  return (args, options) => changeIn(rt, 'cart.remove', { lineId: args.lineId, quantity: 0 }, options);
}
