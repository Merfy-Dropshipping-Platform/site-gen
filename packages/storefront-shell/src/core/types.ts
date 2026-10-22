import type { StorefrontConfig } from '@merfy/storefront-config';

// Договор ядра секций (design.md блока 5, разделы 3.1–3.8): что видит код секции и что дают части SDK. Только типы.
// Блоки 6, 8, 9, 10 дописывают сюда свои поля и имена внутри "sdk": 1 — добавить можно, менять нельзя.

// JSON — то, что ходит через тег входных данных, события и хранилище секции.
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
// Значение настройки секции — то же, что получил шаблон (блок 1, раздел 3.4); виды полей — блок 3.
export type SettingValue = Json;

export interface BlockValue {
  readonly id: string;
  readonly type: string;
  readonly settings: Readonly<Record<string, SettingValue>>;
}

export type Mode = 'live' | 'preview';
export type Stop = () => void;

// Стор для секции — только чтение; подписка — только ctx.watch (12а, «Решил сам» блока 9, п. 14).
export interface ReadableStore<T> {
  get(): T;
}

// Адрес страницы: путь и параметры (?token=…, ?q=…) — для блоков 10 и 11. Ключ дважды — последнее значение.
export interface PageInfo {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

// События страницы целиком, которые слушает ctx.on (раздел 3.2).
export type PageDomEvent = 'keydown' | 'keyup' | 'scroll' | 'resize' | 'pointerdown';

export interface SectionEvent {
  readonly type: string;
  readonly key: string | null; // у клавиатурных событий
  inside(el: El): boolean; // событие пришло изнутри el
  preventDefault(): void;
}

// Обёртка элемента своей секции (раздел 3.3): методы отдают строки, числа, булевы значения и другие обёртки.
export interface El {
  text(): string;
  text(value: string | number): void;
  hasClass(name: string): boolean;
  toggleClass(name: string, on?: boolean): void;
  show(): void;
  hide(): void;
  toggle(on?: boolean): void;
  visible(): boolean;
  attr(name: string): string | null;
  attr(name: string, value: string | null): void;
  cssVar(name: string, value: string | number | null): void;
  value(): string;
  value(next: string): void;
  checked(): boolean;
  checked(next: boolean): void;
  form(): Readonly<Record<string, string | boolean>>;
  focus(): void;
  ref(name: string): El | null;
  refs(name: string): readonly El[];
  closest(name: string): El | null;
  list<T>(items: readonly T[], fill: (row: El, item: T, index: number) => void): void;
}

export interface SectionStorage {
  get(key: string): Json | undefined;
  set(key: string, value: Json): boolean; // false — не записалось: предел 4 КБ или localStorage отказал
  remove(key: string): void;
}

export type FailureStage = 'mount' | 'runtime' | 'unmount';

export interface SectionFailureDetail {
  readonly section: string;
  readonly id: string;
  readonly script: string; // хеш скрипта секции, 64 знака — из списка секций бандла
  readonly stage: FailureStage;
  readonly message: string;
}

// Деньги в событиях и сторах: копейки целым числом, как *_cents в orders; валюта — из конфига витрины (RUB).
export interface Money {
  readonly amount: number;
  readonly currency: string;
}
export type NoticeLevel = 'error' | 'warning';
export type ConsentState = 'accepted' | 'declined';
type NoDetail = Readonly<Record<string, never>>;

// Закрытый каталог событий витрины (13а А; блок 9, «Решил сам» п. 11) — публичный интерфейс для секций мерчантов и
// «своего кода» (16б Г). Внутри "sdk": 1 имя и поле можно только добавить. Вид полей для проверки — event-catalog.ts.
// merfy:geo:change отложено 20.10 вместе с городом по IP.
export interface EventMap {
  'merfy:page:ready': NoDetail;
  'merfy:page:view': { readonly path: string };
  'merfy:page:hidden': NoDetail;
  'merfy:page:visible': NoDetail;
  'merfy:page:restore': NoDetail;
  'merfy:page:leave': NoDetail;
  'merfy:cart:add': {
    readonly lineId: string;
    readonly productId: string;
    readonly variantId: string | null;
    readonly quantity: number; // сколько штук добавилось
    readonly price: Money; // за штуку
  };
  'merfy:cart:remove': {
    readonly lineId: string;
    readonly productId: string;
    readonly variantId: string | null;
    readonly quantity: number;
  };
  'merfy:cart:change': {
    readonly lineId: string;
    readonly productId: string;
    readonly variantId: string | null;
    readonly quantity: number;
    readonly previousQuantity: number;
  };
  'merfy:variant:change': { readonly productId: string; readonly variantId: string };
  'merfy:favorites:add': { readonly productId: string };
  'merfy:favorites:remove': { readonly productId: string };
  'merfy:auth:signin': NoDetail;
  'merfy:auth:signout': NoDetail;
  'merfy:search:submit': { readonly query: string };
  'merfy:catalog:page': { readonly page: number };
  'merfy:section:mount': { readonly section: string };
  'merfy:section:error': SectionFailureDetail;
  'merfy:notice:show': { readonly level: NoticeLevel; readonly message: string; readonly code?: ErrorCode };
  'merfy:consent:change': { readonly state: ConsentState };
}
export type EventName = keyof EventMap;
export type EventDetail<E extends EventName> = EventMap[E];

// Ответ действия SDK (14б): не бросает. refused — дополнение блока 9 (п. 7).
export type ErrorCode = 'out-of-stock' | 'limit' | 'unauthorized' | 'network' | 'server' | 'invalid' | 'refused';
export type Result<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: { readonly code: ErrorCode; readonly message: string } };
export interface ActionOptions {
  readonly quiet?: boolean;
}

// Модули по uses (11г А) — вид для секций по 3.12 и каталогам блоков 9 и 10. Корзина — на сервере (блок 9, часть 9а):
// строка — ответ шлюза, id строки — номер строки на сервере. cart.remove и cart.change — блок 10. Избранное и вход — в
// памяти страницы до блока 10.
export interface CartLine {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly price: Money; // за штуку
}
export interface CartState {
  readonly ready: boolean; // false — корзину с сервера ещё не прочитали
  readonly lines: readonly CartLine[];
}
export interface CartModule {
  readonly $cart: ReadableStore<CartState>;
  readonly $count: ReadableStore<number>; // штук в корзине плюс ждущих ответа сервера
  add(
    args: { readonly productId: string; readonly variantId?: string; readonly quantity?: number },
    options?: ActionOptions,
  ): Promise<Result<CartState>>;
}
export interface FavoritesState {
  readonly ready: boolean;
  readonly ids: readonly string[];
}
export interface FavoritesModule {
  readonly $favorites: ReadableStore<FavoritesState>;
  readonly $count: ReadableStore<number>;
  toggle(args: { readonly productId: string }, options?: ActionOptions): Promise<Result<{ readonly added: boolean }>>;
}
export interface Customer {
  readonly email: string;
  readonly name: string | null;
  readonly phone: string | null;
}
export interface CustomerState {
  readonly ready: boolean;
  readonly customer: Customer | null;
}
export interface AuthModule {
  readonly $customer: ReadableStore<CustomerState>;
}
// Подписка на рассылку магазина — форма подвала (блок 1, раздел 3.22): тот же запрос, что у rose и flux.
export interface NewsletterModule {
  subscribe(
    args: { readonly email: string },
    options?: ActionOptions,
  ): Promise<Result<{ readonly alreadySubscribed: boolean }>>;
}
export interface Modules {
  readonly cart: CartModule;
  readonly favorites: FavoritesModule;
  readonly auth: AuthModule;
  readonly newsletter: NewsletterModule;
}
export type ModuleName = keyof Modules;

// Анимация кода секции — ctx.animate (блок 6, design.md раздел 10): Motion внутри SDK, код секции его не импортирует.
// Кривая — по имени (значения — EASINGS в behaviors/catalog.ts) или массивом Безье; свойства — из списка keyframes.ts.
export type EasingName =
  | 'linear'
  | 'ease-out'
  | 'decelerate'
  | 'material'
  | 'power2.out'
  | 'power3.out'
  | 'power2.in'
  | 'power3.in'
  | 'power2.inOut'
  | 'back.out';
export type Bezier = readonly [number, number, number, number];
export type KeyframeValue = string | number;
export type Keyframes = Readonly<Record<string, KeyframeValue | readonly KeyframeValue[]>>;
export interface AnimateOptions {
  readonly duration?: number; // мс, по умолчанию 300
  readonly delay?: number; // мс, по умолчанию 0
  readonly easing?: EasingName | Bezier; // по умолчанию 'ease-out'
}
export interface Animation {
  readonly finished: Promise<void>; // закончилась или остановлена
  stop(): void;
}

// ctx экземпляра (раздел 3.2). animate — блок 6 (типы выше); theme и ext — блок 9.
export interface BaseCtx<State extends object> {
  readonly name: string; // имя с префиксом автора: 'shop:…'
  readonly id: string; // data-section-id; у глобального скрипта — имя
  readonly mode: Mode;
  readonly settings: Readonly<Record<string, SettingValue>>;
  readonly blocks: readonly BlockValue[];
  readonly data: Readonly<Record<string, Json>>; // объявление data — блок 8; до него {}
  readonly page: PageInfo;
  state: Partial<State>; // ctx заморожен, а state — свойство-аксессор: ctx.state = {…} работает
  readonly signal: AbortSignal;
  readonly storage: SectionStorage;
  ref(name: string): El | null;
  refs(name: string): readonly El[];
  on(target: 'window' | 'document', type: PageDomEvent, fn: (event: SectionEvent) => void): Stop;
  every(ms: number, fn: () => void | Promise<void>): Stop; // меньше 100 мс — 100
  after(ms: number, fn: () => void | Promise<void>): Stop;
  watch<T>(store: ReadableStore<T>, fn: (value: T) => void): Stop; // сразу текущее значение, потом каждое новое
  listen<E extends EventName>(name: E, fn: (detail: EventDetail<E>) => void): Stop;
  emit(name: string, detail?: Json): void; // уходит как '<имя секции>:<name>'
  log(...values: unknown[]): void; // превью — в консоль браузера с именем и id; витрина — ничего
  // Блок 6: элемент только своей секции; превью и «уменьшить движение» — сразу последний кадр; снятие — остановка.
  animate(el: El, keyframes: Keyframes, options?: AnimateOptions): Animation;
}

export type Ctx<State extends object = Record<string, unknown>, Uses extends ModuleName = ModuleName> = BaseCtx<State> &
  Readonly<Pick<Modules, Uses>>;

// Действие секции. Запись через «метод» — чтобы определение с любым State входило в список секций бандла.
export type Action<State extends object = Record<string, unknown>, Uses extends ModuleName = ModuleName> = {
  bivariant(target: El, ctx: Ctx<State, Uses>, event: SectionEvent): void | Promise<void>;
}['bivariant'];

export interface SectionDef<State extends object = Record<string, unknown>, Uses extends ModuleName = ModuleName> {
  mount?(el: El, ctx: Ctx<State, Uses>): void | Promise<void>;
  actions?: Readonly<Record<string, Action<State, Uses>>>;
  unmount?(el: El, ctx: Ctx<State, Uses>): void;
}

// Действие SDK в разметке: data-action="cart.add" → params из data-* элемента → call (раздел 3.4).
export interface MarkupAction<Api> {
  readonly params: readonly string[]; // ['product-id', 'quantity'] — без префикса data-
  call(api: Api, values: Readonly<Record<string, string>>): Promise<Result<unknown>>;
}

// Экземпляр для кода платформы (готовое поведение блока 6): узел, режим и сигнал снятия.
export interface InstanceHost {
  readonly element: HTMLElement;
  readonly name: string;
  readonly id: string;
  readonly mode: Mode;
  readonly signal: AbortSignal;
}

export interface CoreHandle {
  readonly config: StorefrontConfig | null;
  readonly mode: Mode;
  emit<E extends EventName>(name: E, detail: EventDetail<E>): void;
  part<N extends ModuleName>(name: N): Modules[N]; // нет такой части на странице — ShellError part-unknown
}

// Часть SDK (раздел 3.8): фабрика на страницу, действия разметки и запуск на экземпляре до mount (блок 6).
export interface SdkPart<Name extends string, Api> {
  readonly name: Name;
  create(core: CoreHandle): Api;
  readonly markup?: Readonly<Record<string, MarkupAction<Api>>>;
  attach?(api: Api, host: InstanceHost): void;
}

// Строка списка секций бандла страницы (раздел 3.10) — договор со сборкой части 5б.
export interface SectionEntry {
  readonly name: string;
  readonly kind: 'section' | 'global';
  readonly script: string; // sha256 модуля секции, 64 знака
  readonly uses: readonly ModuleName[];
  readonly definition: SectionDef<object, never>;
}

export interface StartOptions {
  readonly parts: readonly SdkPart<string, unknown>[];
  readonly sections: readonly SectionEntry[];
}
