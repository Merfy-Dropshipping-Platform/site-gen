import type { ModuleName } from './types';

// Действия SDK (блок 9: 14а А, «Решил сам» п. 18) — таблица имён: имя → модуль, функция и параметры разметки. По ней
// data-action="cart.add" находит функцию части (markup, 5а-5), проверка при сохранении (5б) сверяет имя
// (action-unknown) и параметры, документация блока 14 описывает действия. Общей функции run нет: запрос, стор, событие и
// уведомление каждая функция делает у себя. Внутри "sdk": 1 имя и параметр можно только добавить.

// Параметр разметки — data-<имя> элемента: строка или целое число от 1.
export type ParamRule = 'text' | 'count-from-1';

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
  'favorites.toggle': {
    module: 'favorites',
    about: 'отметить товар в избранном или снять отметку; аргументы { productId }, ответ — { added }',
    markup: { 'product-id': 'text' },
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
export const MODULE_NAMES = ['cart', 'favorites', 'auth', 'newsletter', 'consent', 'variants', 'search', 'catalog'] as const satisfies readonly ModuleName[];
type MissingModule = Exclude<ModuleName, (typeof MODULE_NAMES)[number]>;
export const MODULE_NAMES_COMPLETE: [MissingModule] extends [never] ? true : never = true;

// События data-action (раздел 3.4) — тот же список, что слушает ядро: проверка сверяет событие перед двоеточием.
export { ACTION_EVENTS } from './actions';
