import type { ModuleName } from './types';

// Действия SDK (блок 9: 14а А, «Решил сам» п. 18) — таблица имён: имя → модуль, функция и параметры разметки. По ней
// data-action="cart.add" находит функцию части (markup, 5а-5), проверка при сохранении (5б) сверяет имя
// (action-unknown) и параметры, документация блока 14 описывает действия. Общей функции run нет: запрос, стор, событие и
// уведомление каждая функция делает у себя. Внутри "sdk": 1 имя и параметр можно только добавить.

// Параметр разметки — data-<имя> элемента: строка, целое число от 1 или целое от 0.
export type ParamRule = 'text' | 'count-from-1' | 'count-from-0';

export interface ActionSpec {
  readonly module: ModuleName;
  readonly about: string;
  // Параметры data-action; null — действие только из скрипта секции.
  readonly markup: Readonly<Record<string, ParamRule>> | null;
}

export const ACTIONS = {
  'cart.add': {
    module: 'cart',
    about: 'добавить товар в корзину; аргументы { productId, variantId?, quantity? = 1 }, ответ — CartState',
    markup: { 'product-id': 'text', 'variant-id': 'text', quantity: 'count-from-1' },
  },
  // Блок 10, часть 10а: по номеру строки корзины; quantity 0 — убрать строку.
  'cart.change': {
    module: 'cart',
    about: 'поменять количество строки корзины; аргументы { lineId, quantity }, 0 — убрать строку; ответ — CartState',
    markup: { 'line-id': 'text', quantity: 'count-from-0' },
  },
  'cart.remove': {
    module: 'cart',
    about: 'убрать строку из корзины; аргументы { lineId }, ответ — CartState',
    markup: { 'line-id': 'text' },
  },
  'cart.open': {
    module: 'cart',
    about:
      'открыть корзину: при «Сайдбар» и выезжающей корзине на странице — merfy:cart:open, иначе переход на /cart; ответ — { drawer }',
    markup: {},
  },
  'cart.checkout': {
    module: 'cart',
    about: 'перейти в оформление заказа: номер корзины и копия строк для оформления, переход на /checkout',
    markup: {},
  },
  'favorites.toggle': {
    module: 'favorites',
    about: 'отметить товар в избранном или снять отметку; аргументы { productId }, ответ — { added }',
    markup: { 'product-id': 'text' },
  },
  // Блок 10, часть 10в: вход по коду из письма и кабинет. Тексты ошибок секция показывает сама (quiet: true).
  'auth.requestCode': {
    module: 'auth',
    about: 'отправить письмо с кодом и ссылкой для входа; аргументы { email }, ответ — {}',
    markup: null,
  },
  'auth.verify': {
    module: 'auth',
    about:
      'войти по коду { email, code } или ссылке { token }; ответ — { customer }, потом merfy:auth:signin; на «Входе» — переход по ?redirect или в кабинет',
    markup: null,
  },
  'auth.signout': {
    module: 'auth',
    about: 'выйти: токен и избранное браузера стёрты, merfy:auth:signout; в кабинете — переход на «Вход»',
    markup: {},
  },
  'auth.updateProfile': {
    module: 'auth',
    about: 'сохранить имя и телефон; аргументы { name?, phone? }, ответ — { customer }',
    markup: null,
  },
  'orders.list': {
    module: 'orders',
    about: 'заказы покупательницы, новые сверху; ответ — { orders }',
    markup: null,
  },
  'orders.get': {
    module: 'orders',
    about: 'заказ по номеру; аргументы { number }, ответ — { order }',
    markup: null,
  },
  'orders.cancel': {
    module: 'orders',
    about: 'отменить заказ; аргументы { number, reason }, ответ — { order }',
    markup: null,
  },
  // Блок 13: кнопки баннера cookie. Ответ — один на все страницы магазина, событие merfy:consent:change.
  'consent.accept': {
    module: 'consent',
    about:
      'покупатель принял cookie: счётчики мерчанта и «свой код» с ожиданием согласия запускаются; ответ — "accepted"',
    markup: {},
  },
  'consent.decline': {
    module: 'consent',
    about: 'покупатель отклонил cookie: аналитика ничего не отправляет, счётчиков нет; ответ — "declined"',
    markup: {},
  },
  'newsletter.subscribe': {
    module: 'newsletter',
    about: 'подписать на рассылку магазина; аргументы { email }, ответ — { alreadySubscribed }; e-mail — из поля формы',
    markup: null,
  },
  // Блок 11 «Секций и SDK», часть 11б: значение группы вариантов — id группы и значения из JSON вариантов страницы.
  'variants.pick': {
    module: 'variants',
    about:
      'выбрать значение группы вариантов товара; аргументы { productId, group, value } — id из JSON вариантов страницы, ответ — Variant, потом merfy:variant:change',
    markup: { 'product-id': 'text', group: 'text', value: 'text' },
  },
  // Блок 11, часть 11б: кнопка «Поиск» «Шапки» — панель секции «Поиск» или страница каталога.
  'search.open': {
    module: 'search',
    about: 'открыть панель поиска: есть на странице — merfy:search:open, нет — переход на /catalog; ответ — { panel }',
    markup: {},
  },
  // Базовые секции, 29.10: кнопка «Поделиться» у «Товара» — как flux и vanilla на проде.
  'share.page': {
    module: 'share',
    about:
      'поделиться страницей: окно «Поделиться» системы с названием и адресом страницы, нет окна — адрес в буфер обмена; ответ — { method: "share" | "copy" }',
    markup: {},
  },
} as const satisfies Readonly<Record<string, ActionSpec>>;

export type ActionName = keyof typeof ACTIONS;

export const ACTION_NAMES: readonly string[] = Object.keys(ACTIONS);

export const isActionName = (name: string): name is ActionName => Object.hasOwn(ACTIONS, name);

// Параметры разметки действия — то, что ядро читает из data-* элемента (MarkupAction.params).
export function markupParams(name: ActionName): readonly string[] {
  const markup: ActionSpec['markup'] = ACTIONS[name].markup;
  return markup === null ? [] : Object.keys(markup);
}

// Модули SDK для "uses" в section.json (design.md блока 5, раздел 3.8): по этому списку проверка при сохранении (часть 5в)
// сверяет uses, сборка выбирает части бандла страницы. Новый модуль в ModuleName без строки здесь — ошибка типов.
export const MODULE_NAMES = [
  'cart',
  'favorites',
  'customer',
  'auth',
  'newsletter',
  'consent',
  'variants',
  'search',
  'catalog',
  'orders',
  'files',
  'share',
] as const satisfies readonly ModuleName[];
type MissingModule = Exclude<ModuleName, (typeof MODULE_NAMES)[number]>;
export const MODULE_NAMES_COMPLETE: [MissingModule] extends [never] ? true : never = true;

// События data-action (раздел 3.4) — тот же список, что слушает ядро: проверка сверяет событие перед двоеточием.
export { ACTION_EVENTS } from './actions';
