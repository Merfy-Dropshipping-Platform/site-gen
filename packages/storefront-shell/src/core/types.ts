import type { StorefrontConfig } from '@merfy/storefront-config';
import type { PageStores } from './own-stores';
import type { ReplaceDeps } from './replace';

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
export type PageDomEvent = 'keydown' | 'keyup' | 'scroll' | 'resize' | 'pointerdown' | 'pointermove';

export interface SectionEvent {
  readonly type: string;
  readonly key: string | null; // у клавиатурных событий
  inside(el: El): boolean; // событие пришло изнутри el
  preventDefault(): void;
}

// Курсор относительно прямоугольника: x и y — px от левого верхнего угла (за пределами прямоугольника — отрицательные
// или больше размера), px и py — доли ширины и высоты (0…1 внутри; у прямоугольника без размера — 0).
export interface PointerPoint {
  readonly x: number;
  readonly y: number;
  readonly px: number;
  readonly py: number;
}

// 12.11, ctx.on('window' | 'document', 'pointermove', fn): не чаще раза в кадр, с последним положением курсора.
// pointer — относительно секции, at(el) — относительно любого элемента секции (null — элемент не из этой секции).
// «Уменьшить движение» событие не отключает: автор решает сам.
export interface PointerSectionEvent extends SectionEvent {
  readonly pointer: PointerPoint;
  at(el: El): PointerPoint | null;
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
export type NoticeLevel = 'error' | 'warning' | 'info'; // info — сообщение, не ошибка и не предупреждение («Скопировано»)
export type ConsentState = 'accepted' | 'declined';
// Ответ покупателя на баннер cookie (блок 13 «Секций и SDK», 13.2): unknown — ещё не ответил.
export type ConsentAnswer = 'unknown' | ConsentState;
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
  'merfy:page:leaving': NoDetail; // модуль page: посетитель собирается уйти (курсор за верхним краем окна, рывок вверх)
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
  'merfy:cart:open': NoDetail; // блок 10: cart.open при «Сайдбар» и выезжающей корзине на странице
  // Базовые секции, 03.11: заказ оформлен, покупатель уходит на страницу платёжки выбранным способом.
  'merfy:checkout:order': {
    readonly orderId: string;
    readonly total: Money;
    readonly method: PaymentMethod;
  };
  'merfy:variant:change': { readonly productId: string; readonly variantId: string };
  'merfy:favorites:add': { readonly productId: string };
  'merfy:favorites:remove': { readonly productId: string };
  'merfy:auth:signin': NoDetail;
  'merfy:auth:signout': NoDetail;
  'merfy:search:submit': { readonly query: string };
  'merfy:search:open': NoDetail; // блок 11: search.open — панель поиска на странице открывается
  'merfy:catalog:page': { readonly page: number };
  'merfy:section:mount': { readonly section: string };
  'merfy:section:error': SectionFailureDetail;
  // Превью конструктора (блок 6, часть 6в; В6-1 А): мерчант выбрал блок секции в панели слева или снял выбор — id блока.
  'merfy:block:select': { readonly blockId: string };
  'merfy:block:deselect': { readonly blockId: string };
  'merfy:notice:show': { readonly level: NoticeLevel; readonly message: string; readonly code?: ErrorCode };
  'merfy:consent:change': { readonly state: ConsentState };
  // Готовые поведения countdown и scratch: какая секция (имя и id экземпляра), как у merfy:section:error.
  'merfy:countdown:end': { readonly section: string; readonly id: string };
  'merfy:scratch:done': { readonly section: string; readonly id: string };
  // 01.11: окно секции поверх страницы закрылось — имя и id секции, причина.
  'merfy:overlay:close': { readonly section: string; readonly id: string; readonly reason: OverlayCloseReason };
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
// строка — ответ шлюза, id строки — номер строки на сервере. Блок 10 (часть 10а): итоги, cart.change и cart.remove по
// номеру строки, cart.open, cart.checkout. Избранное и вход — в памяти страницы до частей 10б и 10в.
export interface CartLine {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly price: Money; // за штуку
  // Блок 10, 10.1: что показывают строки корзины — из ответа orders, SDK цен не считает.
  readonly title: string; // название товара (orders: name)
  readonly image: string | null; // адрес фото (imageUrl)
  readonly options: Readonly<Record<string, string>>; // варианты: «Цвет» → «Красный»
  readonly total: Money; // сумма строки (totalCents)
  readonly gift: boolean; // подарок по акции (isBonus): 0 ₽, без «−», «+» и «Удалить»
  readonly compareAt: Money | null; // цена до скидки за штуку (compareAtPriceCents): есть, только если больше цены
}
// Итоги корзины (блок 10, 10.1, Р10а-2): суммы считает orders. Корзины нет — нули, ready: true.
export interface CartTotals {
  readonly ready: boolean; // false — итоги ещё не прочитаны
  readonly subtotal: Money;
  readonly discount: Money;
  readonly discountName: string | null; // имя автоматической скидки магазина; промокод покупательницы — null
  readonly extensionDiscount: Money;
  readonly total: Money; // к оплате
}
export interface CartState {
  readonly ready: boolean; // false — корзину с сервера ещё не прочитали
  readonly lines: readonly CartLine[];
}
export interface CartModule {
  readonly $cart: ReadableStore<CartState>;
  readonly $count: ReadableStore<number>; // штук в корзине плюс ждущих ответа сервера
  readonly $totals: ReadableStore<CartTotals>; // блок 10: итоги с сервера, читаются, когда стор впервые читает секция
  readonly $total: ReadableStore<Money>; // итог к оплате — $totals.total
  add(
    args: { readonly productId: string; readonly variantId?: string; readonly quantity?: number },
    options?: ActionOptions,
  ): Promise<Result<CartState>>;
  change(
    args: { readonly lineId: string; readonly quantity: number },
    options?: ActionOptions,
  ): Promise<Result<CartState>>;
  remove(args: { readonly lineId: string }, options?: ActionOptions): Promise<Result<CartState>>;
  open(): Promise<Result<{ readonly drawer: boolean }>>; // Р10а-5
  checkout(): Promise<Result<null>>; // Р10а-7: переход на /checkout
}
export interface FavoritesState {
  readonly ready: boolean;
  readonly ids: readonly string[];
}
// Карточки отмеченных (блок 10, часть 10б, Р10б-2, Р10б-8): вид каталога блока 11; товара нет у шлюза — карточки нет.
export interface FavoriteProducts {
  readonly ready: boolean; // false — карточки ещё не прочитаны
  readonly products: readonly CatalogItem[]; // в порядке $favorites.ids
}
export interface FavoritesModule {
  readonly $favorites: ReadableStore<FavoritesState>; // ready: false — список сервера ещё не прочитан (вошедшая)
  readonly $count: ReadableStore<number>;
  readonly $products: ReadableStore<FavoriteProducts>; // читается, когда стор впервые читает секция
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
// Вход покупательницы (блок 10, часть 10в, Р10в-1…Р10в-6): по коду из письма; токен — merfy_customer_token.
export type NoData = Readonly<Record<string, never>>;
export type VerifyArgs = { readonly email: string; readonly code: string } | { readonly token: string };
// Кто вошёл (блок 15, часть 15ж, Р15ж-1): часть customer ядра — на каждой странице; тот же стор, что auth.$customer.
export interface CustomerModule {
  readonly $customer: ReadableStore<CustomerState>; // читается, когда стор впервые читает секция
}
export interface AuthModule {
  readonly $customer: ReadableStore<CustomerState>; // читается, когда стор впервые читает секция
  requestCode(args: { readonly email: string }, options?: ActionOptions): Promise<Result<NoData>>;
  verify(args: VerifyArgs, options?: ActionOptions): Promise<Result<{ readonly customer: Customer }>>;
  signout(options?: ActionOptions): Promise<Result<NoData>>;
  updateProfile(
    args: { readonly name?: string; readonly phone?: string },
    options?: ActionOptions,
  ): Promise<Result<{ readonly customer: Customer }>>;
}
// Заказы покупательницы (блок 10, часть 10в, Р10в-7, Р10в-8): ctx.orders.
export interface OrderSummary {
  readonly number: string;
  readonly createdAt: string; // ISO
  readonly status: string; // как в orders: paid, processing, sent…
  readonly statusText: string; // «Оплачен»; незнакомый статус — как есть
  readonly total: Money | null; // totalCents; нет — null
}
export interface OrderLine {
  readonly title: string;
  readonly image: string | null;
  readonly options: Readonly<Record<string, string>>;
  readonly quantity: number;
  readonly total: Money;
  readonly gift: boolean;
}
export interface Order extends OrderSummary {
  readonly lines: readonly OrderLine[];
  readonly address: string | null;
  readonly canCancel: boolean;
}
export interface OrdersModule {
  list(options?: ActionOptions): Promise<Result<{ readonly orders: readonly OrderSummary[] }>>;
  get(args: { readonly number: string }, options?: ActionOptions): Promise<Result<{ readonly order: Order }>>;
  cancel(
    args: { readonly number: string; readonly reason: string },
    options?: ActionOptions,
  ): Promise<Result<{ readonly order: Order }>>;
}
// Подписка на рассылку магазина — форма подвала (блок 1, раздел 3.22): тот же запрос, что у rose и flux.
export interface NewsletterModule {
  subscribe(
    args: { readonly email: string },
    options?: ActionOptions,
  ): Promise<Result<{ readonly alreadySubscribed: boolean }>>;
}
// Согласие на cookie (блок 13 «Секций и SDK», 13.2): ответ покупателя и два действия баннера. Ответ — один на все
// страницы магазина; что можно при каждом ответе — таблица согласия ядра.
export interface ConsentModule {
  readonly $consent: ReadableStore<ConsentAnswer>;
  accept(): Promise<Result<ConsentAnswer>>;
  decline(): Promise<Result<ConsentAnswer>>;
}
// Цена в модулях каталога, поиска и вариантов (блок 11 «Секций и SDK»): Money ядра и текст «1 900 ₽» — как у сборки.
export interface PriceMoney extends Money {
  readonly text: string;
}
// Варианты товара (блок 11, 11.6): данные — JSON страницы data-merfy-variants (сборка, page-variants.ts).
export interface VariantValue {
  readonly id: string;
  readonly value: string;
  readonly images: readonly string[];
}
export interface VariantOption {
  readonly id: string;
  readonly name: string;
  readonly values: readonly VariantValue[];
}
export interface Variant {
  readonly id: string;
  readonly options: readonly string[]; // id значений по порядку групп options
  readonly price: PriceMoney;
  readonly compareAtPrice: PriceMoney | null;
  readonly available: boolean;
}
export interface VariantImage {
  readonly url: string;
}
export interface ProductVariants {
  readonly $variant: ReadableStore<Variant | null>; // выбранное сочетание; вариантов нет — null
  readonly options: readonly VariantOption[];
  pick(group: string, value: string): Result<Variant>; // id группы и значения; остальные группы — как были
  pickVariant(variantId: string): Result<Variant>;
  isAvailable(group: string, value: string): boolean; // в наличии ли сочетание с этим значением при прочих выбранных
  imageFor(variant: Variant): VariantImage | null;
}
export interface VariantsModule {
  of(productId: string): ProductVariants | null; // товара нет в JSON страницы — null
  pick(productId: string, group: string, value: string): Result<Variant>; // of(productId).pick; товара нет — invalid
}
// Поиск (блок 11, 11.5): строка подсказки — без остатков и артикулов.
export interface SearchItem {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly image: string | null;
  readonly price: PriceMoney;
  readonly compareAtPrice: PriceMoney | null;
  readonly available: boolean;
}
export interface SearchModule {
  query(
    q: string,
    options?: { readonly limit?: number } & ActionOptions,
  ): Promise<Result<{ readonly items: readonly SearchItem[]; readonly hasMore: boolean }>>;
  open(): Promise<Result<{ readonly panel: boolean }>>; // Р11б-7
}
// Каталог для своих секций (блок 11, 11.4, п. 13): параметры — как у шлюза /store/products и /store/filters.
export interface CatalogQuery {
  readonly page?: number;
  readonly limit?: number; // по умолчанию 20, как у шлюза
  readonly sort?: 'newest' | 'price_asc' | 'price_desc' | 'title_asc';
  readonly minPrice?: number; // рубли
  readonly maxPrice?: number;
  readonly availability?: 'in_stock' | 'sold_out';
  readonly collectionIds?: readonly string[];
  readonly q?: string;
  readonly filters?: Readonly<Record<string, readonly string[]>>; // ключ группы → значения (ИЛИ)
}
export interface CatalogItem extends SearchItem {
  readonly hasVariants: boolean;
}
export interface CatalogFilters {
  readonly groups: readonly { readonly key: string; readonly name: string; readonly values: readonly string[] }[];
  readonly price: { readonly min: PriceMoney; readonly max: PriceMoney } | null;
  readonly total: number;
}
export interface CatalogModule {
  products(
    query?: CatalogQuery,
    options?: ActionOptions,
  ): Promise<
    Result<{
      readonly items: readonly CatalogItem[];
      readonly total: number;
      readonly page: number;
      readonly pages: number;
    }>
  >;
  filters(
    query?: Omit<CatalogQuery, 'page' | 'limit' | 'sort' | 'collectionIds'>,
    options?: ActionOptions,
  ): Promise<Result<CatalogFilters>>;
}
// Файлы покупательницы (блок 12 «Секций и SDK», часть 12е, Р12е-2): ctx.files — выбор из поля, загрузка в хранилище
// расширения в три шага (шлюз → хранилище → шлюз), превью картинки. Имён расширений ядро не знает: id передаёт секция.
export type FileKind = 'photo' | 'video' | 'file';
export interface ChosenFile {
  readonly key: string; // номер файла на странице: f1, f2, …
  readonly name: string;
  readonly size: number; // байты
  readonly type: string; // по расширению имени, иначе тип браузера
  readonly image: boolean; // превью в браузере: jpeg, png, webp, gif
}
export interface UploadArgs {
  readonly key: string;
  readonly extension: string; // id расширения
  readonly kind: FileKind;
}
export type UploadDone =
  | { readonly status: 'ready'; readonly fileId: string }
  | { readonly status: 'rejected'; readonly reason: 'format' | 'size' | 'empty' };
export interface FilesModule {
  chosen(input: El): readonly ChosenFile[];
  upload(args: UploadArgs, options?: ActionOptions): Promise<Result<UploadDone>>;
  preview(img: El, key: string): void;
  forget(key: string): void;
}

// «Поделиться» страницей (базовые секции, 29.10): окно системы с названием и адресом страницы или адрес в буфер обмена.
// method: share — окно системы открыто (покупатель мог закрыть его, не выбрав); copy — адрес скопирован.
export interface ShareResult {
  readonly method: 'share' | 'copy';
}
export interface ShareModule {
  page(options?: ActionOptions): Promise<Result<ShareResult>>;
  // Скопировать текст (код, ссылку) в буфер обмена; нет буфера — запасной способ; успех — уведомление «Скопировано».
  copy(args: { readonly text: string }, options?: ActionOptions): Promise<Result<NoData>>;
}

// Страница целиком (ctx.page с uses: ["page"]): те же path и query, что у ctx.page без модуля, и три стора. Скрипту секции
// window и document недоступны, а ctx.on('window', 'scroll') отдаёт событие без положения прокрутки — поэтому здесь.
export interface PageModule extends PageInfo {
  readonly $scroll: ReadableStore<number>; // доля прокрутки страницы, целое от 0 до 100; обновляется не чаще кадра
  // Посетитель собирается уйти: курсор вышел за верхний край окна (к вкладкам и адресной строке) или, без курсора,
  // резкая прокрутка вверх к верху страницы. true — с этого момента и до возвращения курсора или касания экрана; в начале
  // true приходит вместе с событием merfy:page:leaving.
  readonly $leaving: ReadableStore<boolean>;
  // Время по серверу магазина, мс. null — ответ сервера ещё не пришёл (часам устройства верить нельзя); в превью и без
  // ответа сервера — часы устройства. Обновляется раз в секунду, пока на стор есть подписчики.
  readonly $now: ReadableStore<number | null>;
}

// Оформление заказа (базовые секции, 03.11): ctx.checkout — поля покупателя, настройки формы магазина, доставка, оплата,
// промокод, итоги, ошибки по полям, отправка и «Спасибо за заказ». Все запросы оформления — в модуле: секции рисуют
// сторы и зовут действия. Корзина — ctx.cart; по ссылке оплаты предложения расширения (/checkout?offer=<токен>) строки
// и итоги — предложения, только для чтения, корзина не трогается.
export type CheckoutField =
  | 'email'
  | 'phone'
  | 'country'
  | 'firstName'
  | 'lastName'
  | 'city'
  | 'address'
  | 'postalCode';
// Ошибка показывается по полю или по выбору: способ доставки, пункт выдачи, способ оплаты.
export type CheckoutErrorKey = CheckoutField | 'delivery' | 'point' | 'payment';
export interface CheckoutForm {
  readonly values: Readonly<Record<CheckoutField, string>>;
  // Только у полей, которые покупатель уже покинул, и у всех после нажатия «Оплатить».
  readonly errors: Readonly<Partial<Record<CheckoutErrorKey, string>>>;
}
// Настройки формы магазина (кабинет → «Оформление заказа»): ready — прочитаны; до ответа и при сбое — полная форма.
export interface CheckoutSettings {
  readonly ready: boolean;
  readonly phone: boolean; // поле телефона есть и обязательно
  readonly name: 'name' | 'surname' | 'name-surname'; // какие поля имени есть
  readonly address: boolean; // физическая доставка: адрес и способ доставки
  readonly signIn: boolean; // магазин требует вход покупателя
  readonly offer: boolean; // оплата предложения расширения по ссылке: строки только для чтения, промокода нет
}
// Подсказки адреса (DaData) для поля «Город» или «Адрес»; field null — подсказок нет.
export interface CheckoutHint {
  readonly id: string;
  readonly text: string;
}
export interface CheckoutHints {
  readonly field: 'city' | 'address' | null;
  readonly items: readonly CheckoutHint[];
}
export interface CheckoutDeliveryOption {
  readonly id: string;
  readonly kind: 'pickup' | 'own' | 'carrier'; // самовывоз магазина, свой тариф, перевозчик
  readonly title: string;
  readonly about: string; // адрес самовывоза или описание и срок
  readonly price: Money;
  readonly cheapest: boolean; // единственный самый дешёвый платный
  readonly needsPoint: boolean; // перевозчику нужен пункт выдачи
}
export interface CheckoutPoint {
  readonly code: string;
  readonly name: string;
  readonly address: string;
  readonly hours: string;
}
export interface CheckoutDelivery {
  // none — физической доставки нет (цифровые товары); idle — ждём корзину; error — message
  readonly status: 'idle' | 'loading' | 'ready' | 'error' | 'none';
  readonly options: readonly CheckoutDeliveryOption[];
  readonly selected: string | null;
  readonly message: string | null;
  readonly points: {
    readonly status: 'idle' | 'loading' | 'ready' | 'error';
    readonly items: readonly CheckoutPoint[];
    readonly selected: string | null;
  };
}
export type PaymentMethod = 'bank_card' | 'sbp' | 'sberbank' | 'tinkoff_bank';
// Способы оплаты — по включённым у магазина (платёжка решает): данные карты вводятся только на странице платёжки.
export interface CheckoutPayment {
  readonly ready: boolean;
  readonly methods: readonly { readonly key: PaymentMethod; readonly title: string }[];
  readonly selected: PaymentMethod | null;
  readonly unavailable: boolean; // ни одного способа — «Оплата сейчас недоступна»
}
export interface CheckoutPromo {
  readonly code: string | null; // применённый промокод
  readonly busy: boolean;
  readonly error: string | null;
}
export interface CheckoutLines {
  readonly ready: boolean;
  readonly lines: readonly CartLine[];
}
export interface CheckoutTotals extends CartTotals {
  readonly delivery: Money | null; // null — способ доставки не выбран
}
export interface CheckoutStatus {
  readonly complete: boolean; // всё обязательное на месте — «Оплатить» уйдёт на оплату
  readonly submitting: boolean;
  readonly error: string | null; // почему не ушло на оплату — текст покупателю
  readonly signIn: boolean; // гость магазина с обязательным входом
}
// Заказ на «Спасибо за заказ»: ?orderId= адреса или последний оформленный в этом браузере.
export interface CheckoutOrder {
  readonly status: 'loading' | 'ready' | 'missing' | 'error';
  readonly number: string;
  readonly name: string; // имя покупателя, первое слово
  readonly contacts: readonly string[]; // телефон и e-mail
  readonly delivery: string; // способ доставки
  readonly address: string;
  readonly payment: 'paid' | 'pending' | 'failed';
  readonly lines: readonly OrderLine[];
  readonly subtotal: Money;
  readonly discount: Money;
  readonly shipping: Money; // 0 — «Бесплатно»
  readonly total: Money;
}
export interface CheckoutModule {
  readonly $form: ReadableStore<CheckoutForm>;
  readonly $settings: ReadableStore<CheckoutSettings>;
  readonly $hints: ReadableStore<CheckoutHints>;
  readonly $lines: ReadableStore<CheckoutLines>;
  readonly $delivery: ReadableStore<CheckoutDelivery>;
  readonly $payment: ReadableStore<CheckoutPayment>;
  readonly $promo: ReadableStore<CheckoutPromo>;
  readonly $totals: ReadableStore<CheckoutTotals>;
  readonly $status: ReadableStore<CheckoutStatus>;
  readonly $order: ReadableStore<CheckoutOrder>; // читается, когда стор впервые читает секция
  set(args: { readonly field: CheckoutField; readonly value: string }): Result<CheckoutForm>;
  leave(args: { readonly field: CheckoutField }): Result<CheckoutForm>; // покупатель ушёл с поля — показать его ошибку
  pickHint(args: { readonly id: string }): Promise<Result<CheckoutForm>>;
  selectDelivery(args: { readonly id: string }): Result<CheckoutDelivery>;
  selectPoint(args: { readonly code: string }): Result<CheckoutDelivery>;
  selectPayment(args: { readonly method: PaymentMethod }): Result<CheckoutPayment>;
  applyPromo(args: { readonly code: string }, options?: ActionOptions): Promise<Result<CheckoutPromo>>;
  removePromo(options?: ActionOptions): Promise<Result<CheckoutPromo>>;
  submit(options?: ActionOptions): Promise<Result<{ readonly orderId: string }>>; // успех — переход на платёжку
}

export interface Modules {
  readonly cart: CartModule;
  // Базовые секции, 03.11: оформление заказа и «Спасибо за заказ».
  readonly checkout: CheckoutModule;
  readonly consent: ConsentModule;
  readonly favorites: FavoritesModule;
  readonly customer: CustomerModule;
  readonly auth: AuthModule;
  readonly orders: OrdersModule;
  readonly newsletter: NewsletterModule;
  // Блок 11 «Секций и SDK», часть 11б.
  readonly variants: VariantsModule;
  readonly search: SearchModule;
  readonly catalog: CatalogModule;
  // Блок 12 «Секций и SDK», часть 12е.
  readonly files: FilesModule;
  // Базовые секции, 29.10: «Поделиться» у «Товара».
  readonly share: ShareModule;
  // Страница целиком: сторы прокрутки, ухода и времени сервера. Объявленный в uses, заменяет ctx.page на PageModule.
  readonly page: PageModule;
}
export type ModuleName = keyof Modules;

// Модули расширений (блок 9, часть 9в; 12в А, «Решил сам» п. 17): секция с uses: ["ext:<id>"] получает ctx.ext.<id>.
// Имя со $ — стор: значение — ответ функции расширения или null (до ответа, у гостя при customer: true, пока чтение не
// удалось); тот же стор, вызванный с id товара, — стор этого товара (у стора by: "product"), с id записи расширения —
// стор этой записи (by: "record"; null или "" — запись не выбрана, стор с null). Имя без $ — метод: аргументы
// — объект JSON, ответ — Result, как у действий SDK. Что объявлено, решает манифест расширения (storefront.stores,
// storefront.methods); у стора и у метода разные шаблоны имени — TypeScript различает их без сужения типов.
type CharsOf<S extends string> = S extends `${infer Head}${infer Rest}` ? Head | CharsOf<Rest> : never;
type LowerLetter = CharsOf<'abcdefghijklmnopqrstuvwxyz'>;
export type ExtValue = Json;
export type ExtStore = ReadableStore<ExtValue> & ((entityId: string | null) => ReadableStore<ExtValue>);
export type ExtMethod = (input?: { readonly [key: string]: Json }, options?: ActionOptions) => Promise<Result<Json>>;
export interface ExtModule {
  readonly [store: `$${string}`]: ExtStore;
  readonly [method: `${LowerLetter}${string}`]: ExtMethod;
}
export type ExtUse = `ext:${string}`;
// Свой стор в uses (свои сторы, 01.11): "store:<префикс автора>:<имя>" — ctx.stores['<префикс автора>:<имя>'].
export type StoreUse = `store:${string}`;

// Сквозные настройки темы — ctx.theme (блок 9, часть 9б; design.md блока 9, п. 16): значения из theme.settings конфига
// страницы, те же, что у шаблона в Astro.props.theme. Только чтение; нет значения — undefined.
export type ThemeSettings = NonNullable<StorefrontConfig['theme']['settings']>;

// Поведения из скрипта секции — ctx.behavior (03.11): скрипт командует готовым поведением своей разметки (data-behavior) —
// тем, что у поведения есть как действие. Команды и их аргументы — commands в каталоге поведений (behaviors/catalog.ts);
// ответ — Result, как у действий SDK: refused — сейчас нельзя (нет такого пункта, модальное окно уже открыто), invalid —
// ошибка вызова, строка в консоли.
export type DialogPosition = 'center' | 'corner' | 'sheet';
export interface DialogOpenOptions {
  readonly position?: DialogPosition; // место на этот раз; без него — data-position окна, а без него — по классам окна
  readonly side?: 'left' | 'right'; // угол у corner и сторона у панели drawer
  readonly backdrop?: boolean; // затемнение страницы у center и sheet, по умолчанию true; у corner его нет
}
export interface BehaviorHandles {
  readonly dialog: {
    open(options?: DialogOpenOptions): Result<NoData>; // уже открыто — ok
    close(): Result<NoData>; // уже закрыто — ok
    toggle(): Result<NoData>;
  };
  readonly accordion: {
    open(item: number | string): Result<NoData>; // номер с 0 или id элемента <details>
    close(item: number | string): Result<NoData>;
    toggle(item: number | string): Result<NoData>;
  };
  readonly carousel: {
    next(): Result<NoData>;
    prev(): Result<NoData>;
    goTo(index: number): Result<NoData>; // номер слайда с 0
    play(): Result<NoData>;
    pause(): Result<NoData>;
  };
  readonly tabs: { select(value: string): Result<NoData> }; // data-value вкладки
  readonly video: { play(): Result<NoData>; pause(): Result<NoData> };
}
export type BehaviorHandleName = keyof BehaviorHandles;

// Окно поверх страницы — ctx.overlay (01.11, УСТАРЕЛО с 03.11): в конструкторе только три блока — шапка, тема и подвал,
// новая секция группу overlay не объявляет. Окно из секции любого блока — поведение dialog: ctx.behavior('dialog').open().
// ctx.overlay работает у секций, принятых с группой overlay раньше. Поведение окна — у ядра (parts/overlay.ts): center и
// sheet — модальные (role="dialog", aria-modal, фокус внутри, Esc, запрет прокрутки), таких открыто не больше одного;
// corner — немодальное, одно, может стоять рядом с модальным; на телефоне corner — шторкой снизу.
export type OverlayPosition = DialogPosition;
export interface OverlayOptions {
  readonly position?: OverlayPosition; // по умолчанию 'center'
  readonly side?: 'left' | 'right'; // угол у corner, по умолчанию 'right'
  readonly backdrop?: boolean; // затемнение страницы у center и sheet, по умолчанию true; у corner фона нет
}
// Почему окно закрылось: button — data-action="overlay.close", escape — Esc, backdrop — клик мимо окна, code —
// ctx.overlay.close().
export type OverlayCloseReason = 'button' | 'escape' | 'backdrop' | 'code';
export interface OverlayWindow {
  readonly $open: ReadableStore<boolean>;
  open(options?: OverlayOptions): Result<NoData>; // уже открыто — ok, параметры прежние
  close(): Result<NoData>; // уже закрыто — ok
}

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
  | 'back.out'
  | 'expo.out';
export type Bezier = readonly [number, number, number, number];
// Пружина вместо кривой: bounce — упругость 0…0.95 (0 — без отскока, по умолчанию 0.25), duration — мс (по умолчанию
// duration анимации или 600).
export interface SpringEasing {
  readonly spring: { readonly bounce?: number; readonly duration?: number };
}
export type KeyframeValue = string | number;
export type Keyframes = Readonly<Record<string, KeyframeValue | readonly KeyframeValue[]>>;
export interface AnimateOptions {
  readonly duration?: number; // мс, по умолчанию 300
  readonly delay?: number; // мс, по умолчанию 0
  readonly easing?: EasingName | Bezier | SpringEasing; // по умолчанию 'ease-out'
  readonly stagger?: number; // мс между элементами списка: i-й стартует на i × stagger позже; по умолчанию 0
  // Повтор: сколько раз проиграть ещё (число или Infinity; по умолчанию 0) и как — loop с начала или reverse туда-обратно.
  // finished при Infinity не выполняется, пока анимацию не остановят. «Уменьшить движение» и превью — без повтора.
  readonly repeat?: number;
  readonly repeatType?: 'loop' | 'reverse';
}
export type SplitBy = 'chars' | 'words' | 'lines';
export interface Animation {
  readonly finished: Promise<void>; // закончилась или остановлена
  stop(): void;
}

// 13.11, часть 2б спеки анимаций: ctx.scroll и ctx.inView. offset — как у scroll из Motion: пары «край цели край экрана»
// ('start end' — верх цели у низа экрана; края — start, center, end, число 0…1, px, %, vh, vw); по умолчанию
// ['start end', 'end start'] — от входа цели снизу до ухода вверх.
export interface ScrollOptions {
  readonly offset?: readonly string[];
}
export interface InViewOptions {
  readonly amount?: 'some' | 'all' | number; // какая доля элемента в экране считается входом; по умолчанию 'some'
  readonly margin?: string; // отступ области экрана, 1–4 значения px или %: '0px 0px -20% 0px'
  readonly once?: boolean; // только первый вход; по умолчанию false
}

// Полный Motion по uses: ["lib:motion"] (часть 2в): анимация, которую можно поставить на паузу и крутить. time — мс.
export interface Playback extends Animation {
  play(): void;
  pause(): void;
  time: number;
}
// Начало сегмента таймлайна: число — мс от начала, '<' — вместе с прошлым сегментом, '+200' и '-200' — через или за
// столько мс от конца прошлого. Без at — сразу после прошлого.
export type TimelineAt = number | '<' | `+${number}` | `-${number}`;
export interface TimelineSegmentOptions extends AnimateOptions {
  readonly at?: TimelineAt;
}
export type TimelineSegment = readonly [El | readonly El[], Keyframes, TimelineSegmentOptions?];
export interface TimelineOptions {
  readonly delay?: number; // мс
  readonly repeat?: number;
  readonly repeatType?: 'loop' | 'reverse';
}
export interface TweenOptions {
  readonly duration?: number; // мс, по умолчанию 300
  readonly delay?: number;
  readonly easing?: EasingName | Bezier | SpringEasing;
}
export interface MotionLib {
  // Несколько элементов по одному сценарию; ctx.scroll(target, timeline) крутит его прокруткой.
  timeline(segments: readonly TimelineSegment[], options?: TimelineOptions): Playback;
  // Число от from до to: onUpdate получает каждое промежуточное значение (счётчик «0 → 12 000»).
  tween(from: number, to: number, options: TweenOptions | undefined, onUpdate: (value: number) => void): Playback;
  // Как ctx.animate, плюс отдельные части transform: x, y, z, rotateX, rotateY, rotateZ, scaleX, scaleY, skewX, skewY.
  animate(el: El | readonly El[], keyframes: Keyframes, options?: AnimateOptions): Playback;
}
// Плавная прокрутка Lenis по uses: ["lib:lenis"] (13.11, пункт 7 спеки анимаций): один экземпляр на страницу — его
// включает первая секция с "lib:lenis", живёт, пока на странице есть хоть одна такая. «Уменьшить движение» и запуск в
// превью после правки настроек или текста — прокрутка нативная, API тот же: подписка срабатывает, scrollTo — сразу.
export interface LenisSettings {
  readonly lerp?: number; // доля оставшегося пути за кадр, 0.01…1; по умолчанию 0.1
  readonly duration?: number; // мс прокрутки колесом вместо lerp, 100…5000
}
export interface LenisState {
  readonly scroll: number; // px от верха страницы
  readonly limit: number; // px: самая нижняя прокрутка
  readonly progress: number; // scroll / limit, 0…1
  readonly velocity: number; // px за кадр, со знаком
  readonly direction: -1 | 0 | 1; // 1 — вниз, -1 — вверх
}
export interface LenisScrollToOptions {
  readonly offset?: number; // px к цели: -80 — остановиться на 80 px выше
  readonly duration?: number; // мс; без него — lerp экземпляра
  readonly immediate?: boolean; // сразу, без прокрутки
}
export interface LenisLib {
  // Каждый кадр прокрутки — fn с состоянием; снятие секции — отписка.
  onScroll(fn: (state: LenisState) => void): Stop;
  // К числу px от верха страницы или к элементу своей секции.
  scrollTo(target: number | El, options?: LenisScrollToOptions): void;
  stop(): void; // запрет прокрутки (прелоадер, своё окно); снятие секции — снимает и её запрет
  start(): void;
  // Настройки экземпляра: применяет первая вызвавшая секция, у остальных — false.
  configure(settings: LenisSettings): boolean;
}
// Библиотеки каталога SDK (behaviors/libraries.ts) — ctx.lib.<имя>; есть, только если в uses есть "lib:<имя>".
export interface LibModules {
  readonly motion: MotionLib;
  readonly lenis: LenisLib;
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
  on(target: 'window' | 'document', type: 'pointermove', fn: (event: PointerSectionEvent) => void): Stop;
  on(target: 'window' | 'document', type: PageDomEvent, fn: (event: SectionEvent) => void): Stop;
  every(ms: number, fn: () => void | Promise<void>): Stop; // меньше 100 мс — 100
  after(ms: number, fn: () => void | Promise<void>): Stop;
  watch<T>(store: ReadableStore<T>, fn: (value: T) => void): Stop; // сразу текущее значение, потом каждое новое
  listen<E extends EventName>(name: E, fn: (detail: EventDetail<E>) => void): Stop;
  emit(name: string, detail?: Json): void; // уходит как '<имя секции>:<name>'
  log(...values: unknown[]): void; // превью — в консоль браузера с именем и id; витрина — ничего
  // Блок 6: элемент только своей секции; превью и «уменьшить движение» — сразу последний кадр; снятие — остановка.
  // 12.11: список элементов — одним вызовом, options.stagger сдвигает старт каждого следующего.
  animate(el: El | readonly El[], keyframes: Keyframes, options?: AnimateOptions): Animation;
  // 12.11: текст элемента → куски своей секции (текст уходит в aria-label, куски — aria-hidden). Строки считаются по
  // раскладке после загрузки шрифтов, поэтому для 'lines' ответ — Promise (mount может быть async).
  split(el: El, by: 'chars' | 'words'): readonly El[];
  split(el: El, by: 'lines'): Promise<readonly El[]>;
  // 13.11: проход элемента своей секции через экран крутит анимацию (ctx.animate, ctx.lib.motion) или зовёт fn с
  // прогрессом 0…1. «Уменьшить движение» и запуск в превью после правки настроек или текста — не следит: анимация на
  // последнем кадре, fn получает 1.
  scroll(target: El, run: Animation | ((progress: number) => void), options?: ScrollOptions): Stop;
  // 13.11: элемент своей секции вошёл в экран — fn; что fn вернёт функцией, вызывается при выходе. Снятие — отписка.
  inView(el: El | readonly El[], fn: (el: El) => void | (() => void), options?: InViewOptions): Stop;
  // 13.11: библиотеки каталога SDK по uses: ["lib:<имя>"] — ctx.lib.motion; без "lib:<имя>" в uses её нет (приём секции
  // отказывает lib-unknown).
  readonly lib: Readonly<LibModules>;
  // Блок 9, часть 9в: модули расширений из uses: ["ext:<id>"]; без таких uses — пустой объект.
  readonly ext: Readonly<Record<string, ExtModule>>;
  // Блок 9, часть 9б: сквозные настройки темы страницы — ctx.theme['cart-type']; читать в момент действия.
  readonly theme: Readonly<ThemeSettings>;
  // 03.11: команды готового поведения своей разметки; el — любой элемент внутри нужного поведения, без него поведение в
  // секции должно быть одно. Нет такого data-behavior в разметке секции — ошибка кода (sdk-call-invalid).
  behavior<N extends BehaviorHandleName>(name: N, el?: El): BehaviorHandles[N];
  // 01.11, УСТАРЕЛО с 03.11 (окно секции поверх страницы, группа overlay без роли): у секций, принятых с этой группой
  // раньше, работает как работало; у остальных секций и глобальных скриптов — null. Новое окно — ctx.behavior('dialog').
  /** @deprecated окно секции любого блока — ctx.behavior('dialog').open(); ctx.overlay остался для секций, принятых с группой overlay раньше */
  readonly overlay: OverlayWindow | null;
  // Свои сторы из uses: ["store:<префикс>:<имя>"] — ctx.stores['<префикс>:<имя>'], только чтение; без таких uses — {}.
  readonly stores: Readonly<Record<string, ReadableStore<Json>>>;
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

// Свой стор (свои сторы, 01.11): код без места на странице, как глобальный скрипт, но вместо mount — start(ctx, set).
// Значение — JSON: начальное — value, дальше пишет только set самого стора; секции и другие сторы читают ctx.watch и get.
// У ctx стора нет элементов, настроек и данных секции: таймеры, хранилище, события, сторы и модули из uses, ctx.ext.
export type StoreCtx<Uses extends ModuleName = ModuleName> = Pick<
  BaseCtx<object>,
  | 'name'
  | 'mode'
  | 'page'
  | 'signal'
  | 'storage'
  | 'every'
  | 'after'
  | 'watch'
  | 'listen'
  | 'emit'
  | 'log'
  | 'ext'
  | 'theme'
  | 'stores'
> &
  Readonly<Pick<Modules, Uses>>;

export interface StoreDef<Value extends Json = Json, Uses extends ModuleName = ModuleName> {
  readonly value: Value;
  start?(ctx: StoreCtx<Uses>, set: (value: Value) => void): void | Promise<void>;
}

// Действие SDK в разметке: data-action="cart.add" → params из data-* элемента → call (раздел 3.4).
export interface MarkupAction<Api> {
  readonly params: readonly string[]; // ['product-id', 'quantity'] — без префикса data-
  // event — событие нажатия (блок 10, Р10а-4): cart.open и cart.checkout отменяют переход по ссылке до первого await.
  // section — <merfy-section> элемента с data-action (01.11: overlay.close закрывает окно своей секции).
  call(
    api: Api,
    values: Readonly<Record<string, string>>,
    event?: SectionEvent,
    section?: HTMLElement,
  ): Promise<Result<unknown>>;
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
  // Подписка на стор модуля SDK для кода платформы, который собран отдельно от ядра (поведения блока 6): фасады сторов
  // знает только модуль stores.ts ядра, его копия в файле поведения их не видит. Слушатель зовётся при смене значения,
  // текущее значение читает вызывающий (store.get()). Стор не из модулей SDK — ShellError sdk-call-invalid, как у ctx.watch.
  watch<T>(store: ReadableStore<T>, listener: (value: T) => void): Stop;
}

// Часть SDK (раздел 3.8): фабрика на страницу, действия разметки и запуск на экземпляре до mount (блок 6).
export interface SdkPart<Name extends string, Api> {
  readonly name: Name;
  create(core: CoreHandle): Api;
  readonly markup?: Readonly<Record<string, MarkupAction<Api>>>;
  attach?(api: Api, host: InstanceHost): void;
  // Действие разметки, имя которого известно только на странице (блок 9, часть 9в: ext.<id>.<метод>); ядро зовёт, когда
  // в markup такого имени нет. Нет действия — null.
  markupOf?(api: Api, action: string): MarkupAction<Api> | null;
}

// Строка списка секций бандла страницы (раздел 3.10) — договор со сборкой части 5б.
export interface SectionEntry {
  readonly name: string;
  readonly kind: 'section' | 'global';
  readonly script: string; // sha256 модуля секции, 64 знака
  readonly uses: readonly (ModuleName | ExtUse | StoreUse)[];
  readonly definition: SectionDef<object, never>;
}

// Строка списка своих сторов бандла страницы (свои сторы): те же поля, что у секции, определение — стора.
export interface StoreEntry {
  readonly name: string;
  readonly script: string;
  readonly uses: readonly (ModuleName | ExtUse | StoreUse)[];
  readonly definition: StoreDef<Json, never>;
}

export interface StartOptions {
  readonly parts: readonly SdkPart<string, unknown>[];
  readonly sections: readonly SectionEntry[];
  // Свои сторы страницы (свои сторы): pageStores([…]) из бандла страниц, где они нужны; ядро запускает их до секций.
  readonly stores?: PageStores;
  // Бандл превью (часть 5г): замена экземпляра — watchPreviewReplace; ядро зовёт её только в режиме preview.
  readonly preview?: (deps: ReplaceDeps) => void;
}
