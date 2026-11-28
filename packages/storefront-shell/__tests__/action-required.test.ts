import { describe, expect, it } from 'vitest';
import { ACTIONS, ACTION_NAMES, isActionName, markupParams, requiredParams } from '../src/core/action-catalog';
import { cart } from '../src/core/parts/cart';
import { checkout } from '../src/core/parts/checkout';
import { favorites } from '../src/core/parts/favorites';
import { share } from '../src/core/parts/share';
import { variants } from '../src/core/parts/variants';
import type { CoreHandle, ModuleName, Modules, SdkPart } from '../src/core/types';
import { fakeCore } from './sdk-support';

// ActionSpec.required (обязательные параметры разметки) сверяется с тем, что действие требует на самом деле: вызов без
// такого параметра часть отклоняет кодом invalid. Проверку аргументов делает сама часть (parts/*.ts), таблица её не
// дублирует — поэтому здесь вызов, а не копия правил.
const PARTS: readonly SdkPart<string, unknown>[] = [cart, checkout, favorites, share, variants];

// Значения «остальных» параметров: годятся по виду, настоящих записей за ними нет.
const FILLER: Readonly<Record<string, string>> = {
  'product-id': 'p-1',
  'variant-id': 'v-1',
  quantity: '1',
  'line-id': 'l-1',
  'hint-id': 'h1',
  'option-id': 'o-1',
  'point-code': 'c-1',
  method: 'bank_card',
  group: 'g-1',
  value: 'x-1',
  text: 'PROMO10',
};

// Оформление читает корзину через core.part('cart'): у ядра теста она есть.
function withCart(): CoreHandle {
  const base = fakeCore().core;
  const parts: Partial<Modules> = { cart: cart.create(base) };
  return {
    ...base,
    part: <N extends ModuleName>(name: N): Modules[N] => {
      const found = parts[name];
      if (found === undefined) throw new Error(`части ${name} в тесте нет`);
      return found;
    },
  };
}

// Пары, где отказ без параметра не доказывает его обязательность, — проверяются только на согласованность с markup:
// variants.pick group/value — отказ приходит и так, товара нет в JSON страницы (записей магазина в тесте нет);
// cart.change quantity — часть читает пропущенное как Number('') = 0, то есть «убрать строку» (parts/cart.ts), а не отказ:
// для существующей строки пропуск тихо уберёт её, поэтому параметр обязателен по таблице, но часть его не принуждает.
const CHECKED_BY_LOOKUP: ReadonlySet<string> = new Set([
  'variants.pick/group',
  'variants.pick/value',
  'cart.change/quantity',
]);

const pairs = ACTION_NAMES.filter(isActionName).flatMap((name) =>
  requiredParams(name).map((param): [string, string] => [name, param]),
);

async function callWithout(name: string, omitted: string) {
  const [moduleName = '', method = ''] = name.split('.');
  const part = PARTS.find((candidate) => candidate.name === moduleName);
  const action = part?.markup?.[method];
  if (part === undefined || action === undefined) throw new Error(`нет действия разметки ${name}`);
  const values = Object.fromEntries(
    action.params.filter((param) => param !== omitted).map((p) => [p, FILLER[p] ?? '']),
  );
  return action.call(part.create(withCart()), values);
}

describe('ActionSpec.required', () => {
  it('обязательные параметры — подмножество параметров разметки, без повторов', () => {
    for (const name of ACTION_NAMES.filter(isActionName)) {
      const required = requiredParams(name);
      expect(new Set(required).size, name).toBe(required.length);
      for (const param of required) expect(markupParams(name), `${name}/${param}`).toContain(param);
    }
  });

  it('у действия без разметки и с пустой разметкой обязательных параметров нет', () => {
    const without = ACTION_NAMES.filter(isActionName).filter((name) => markupParams(name).length === 0);
    expect(without.length).toBeGreaterThan(10);
    for (const name of without) expect(requiredParams(name), name).toEqual([]);
  });

  it('список целиком: что обязательно у каждого действия', () => {
    const table = Object.fromEntries(
      ACTION_NAMES.filter(isActionName)
        .filter((name) => requiredParams(name).length > 0)
        .map((name) => [name, requiredParams(name)]),
    );
    expect(table).toEqual({
      'cart.add': ['product-id'],
      'cart.change': ['line-id', 'quantity'],
      'cart.remove': ['line-id'],
      'checkout.pickHint': ['hint-id'],
      'checkout.selectDelivery': ['option-id'],
      'checkout.selectPayment': ['method'],
      'checkout.selectPoint': ['point-code'],
      'favorites.toggle': ['product-id'],
      'share.copy': ['text'],
      'variants.pick': ['product-id', 'group', 'value'],
    });
    expect(ACTIONS['cart.add'].required).toEqual(['product-id']);
  });

  it.each(pairs.filter(([name, param]) => !CHECKED_BY_LOOKUP.has(`${name}/${param}`)))(
    '%s без data-%s часть отклоняет кодом invalid',
    async (name, param) => {
      const result = await callWithout(name, param);
      expect(result.ok).toBe(false);
      expect(result.ok ? null : result.error.code).toBe('invalid');
    },
  );
});
