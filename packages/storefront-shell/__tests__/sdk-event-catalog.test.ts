import { describe, expect, expectTypeOf, it } from 'vitest';
import { ERROR_CODES, EVENT_CATALOG, EVENT_NAMES, checkEventDetail, isEventName } from '../src/core/event-catalog';
import { BLOCK_DESELECT_EVENT, BLOCK_SELECT_EVENT } from '../src/core/preview-protocol';
import type { ErrorCode, EventName } from '../src/core/types';

// Каталог событий (блок 9: 13а А, «Решил сам» п. 11) — публичный интерфейс: имена и поля только добавляются.
// merfy:geo:change отложено 20.10 вместе с городом по IP; события превью «выбран блок» и «выбор снят» — блок 6, часть 6в.
// В каталоге 22 имени.
const NAMES = [
  'merfy:page:ready',
  'merfy:page:view',
  'merfy:page:hidden',
  'merfy:page:visible',
  'merfy:page:restore',
  'merfy:page:leave',
  'merfy:cart:add',
  'merfy:cart:remove',
  'merfy:cart:change',
  'merfy:variant:change',
  'merfy:favorites:add',
  'merfy:favorites:remove',
  'merfy:auth:signin',
  'merfy:auth:signout',
  'merfy:search:submit',
  'merfy:catalog:page',
  'merfy:section:mount',
  'merfy:section:error',
  'merfy:block:select',
  'merfy:block:deselect',
  'merfy:notice:show',
  'merfy:consent:change',
];

const CART_ADD = {
  lineId: 'l-1',
  productId: 'p12',
  variantId: null,
  quantity: 2,
  price: { amount: 249000, currency: 'RUB' },
};

describe('каталог событий', () => {
  it('22 имени merfy:объект:действие; каталог и типы EventMap — одно и то же', () => {
    expect([...EVENT_NAMES].sort()).toEqual([...NAMES].sort());
    expectTypeOf<keyof typeof EVENT_CATALOG>().toEqualTypeOf<EventName>();
    expect(isEventName('merfy:cart:add')).toBe(true);
    expect(isEventName('merfy:cart:ad')).toBe(false);
    expect(isEventName('merfy:geo:change')).toBe(false);
  });

  it('семь кодов ошибок: шесть из 14б и refused', () => {
    expectTypeOf<(typeof ERROR_CODES)[number]>().toEqualTypeOf<ErrorCode>();
    expect(ERROR_CODES).toHaveLength(7);
  });

  it('события выбора блока в превью — имена протокола @merfy/shell/preview (часть 6в)', () => {
    expect([BLOCK_SELECT_EVENT, BLOCK_DESELECT_EVENT]).toEqual(['merfy:block:select', 'merfy:block:deselect']);
    expect([BLOCK_SELECT_EVENT, BLOCK_DESELECT_EVENT].every((name) => isEventName(name))).toBe(true);
  });

  it('у каждого события есть описание для документации', () => {
    const empty = Object.entries(EVENT_CATALOG).filter(([, spec]) => spec.about.trim().length === 0);
    expect(empty).toEqual([]);
  });
});

describe('checkEventDetail', () => {
  it.each([
    ['merfy:cart:add', CART_ADD],
    ['merfy:cart:add', { ...CART_ADD, variantId: 'v-red' }],
    ['merfy:page:ready', {}],
    ['merfy:page:view', { path: '/products/scarf' }],
    ['merfy:notice:show', { level: 'error', message: 'Этого товара нет в наличии', code: 'out-of-stock' }],
    ['merfy:notice:show', { level: 'warning', message: 'Добавили 2 шт. — больше нет в наличии' }],
    ['merfy:catalog:page', { page: 2 }],
    ['merfy:consent:change', { state: 'accepted' }],
    ['merfy:section:error', { section: 'shop:a', id: 'a-1', script: '', stage: 'runtime', message: 'сломалась' }],
    ['merfy:block:select', { blockId: 'slide-2' }],
    ['merfy:block:deselect', { blockId: 'slide-2' }],
  ])('%s %j — по каталогу', (name, detail) => {
    expect(checkEventDetail(name, detail)).toBeNull();
  });

  it.each([
    ['merfy:cart:ad', CART_ADD, 'события merfy:cart:ad нет в каталоге'],
    ['merfy:cart:add', null, 'merfy:cart:add: данные — объект'],
    ['merfy:cart:add', { ...CART_ADD, email: 'a@b.ru' }, 'merfy:cart:add: лишнее поле email'],
    ['merfy:cart:add', { ...CART_ADD, quantity: 1.5 }, 'merfy:cart:add: quantity — целое число от 0'],
    [
      'merfy:cart:add',
      { ...CART_ADD, price: 2490 },
      'merfy:cart:add: price — { amount: копейки целым числом, currency }',
    ],
    ['merfy:cart:add', { ...CART_ADD, variantId: 7 }, 'merfy:cart:add: variantId — строка или null'],
    ['merfy:page:view', {}, 'merfy:page:view: path — строка'],
    ['merfy:page:ready', { path: '/' }, 'merfy:page:ready: лишнее поле path'],
    ['merfy:notice:show', { level: 'info', message: 'x' }, 'merfy:notice:show: level — одно из: error, warning'],
    [
      'merfy:notice:show',
      { level: 'error', message: 'x', code: 'oops' },
      'merfy:notice:show: code — одно из: out-of-stock, limit, unauthorized, network, server, invalid, refused',
    ],
    ['merfy:consent:change', {}, 'merfy:consent:change: нет поля state'],
    ['merfy:block:select', {}, 'merfy:block:select: blockId — строка'],
    ['merfy:block:deselect', { blockId: 2 }, 'merfy:block:deselect: blockId — строка'],
    ['merfy:block:select', { blockId: 'slide-2', index: 1 }, 'merfy:block:select: лишнее поле index'],
  ])('%s %j — «%s»', (name, detail, problem) => {
    expect(checkEventDetail(name, detail)).toBe(problem);
  });
});
