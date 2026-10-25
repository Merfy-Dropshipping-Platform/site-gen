// @merfy/shell и @merfy/shell/core — ядро секций в браузере (design.md блока 5). Бандл страницы (часть 5б) импортирует
// отсюда start и части SDK, в том числе analytics — её получает каждая страница опубликованного сайта; код секции —
// defineSection и типы.
export { defineSection } from './define';
export { SECTION_FAILURE_EVENT } from './events';
export { start, type CoreEnv, type StartedCore } from './start';
export { auth } from './parts/auth';
export { cart } from './parts/cart';
export { favorites } from './parts/favorites';
// Блок 13: согласие на cookie — ctx.consent и действия consent.accept, consent.decline.
export { consent } from './parts/consent';
// Блок 6: типы ctx.animate. Поведения и анимации — @merfy/shell/behaviors.
export type { AnimateOptions, Animation, Bezier, EasingName, KeyframeValue, Keyframes } from './types';
// Блок 9: подписка на рассылку, типы событий и денег. Каталоги событий и действий — @merfy/shell/events и
// @merfy/shell/actions.
export { newsletter } from './parts/newsletter';
export { variants } from './parts/variants';
export { search } from './parts/search';
// Блок 11 «Секций и SDK», часть 11б: типы модулей вариантов, поиска и каталога; части — в задачах Б11б-3…Б11б-5.
export type {
  CatalogFilters,
  CatalogItem,
  CatalogModule,
  CatalogQuery,
  PriceMoney,
  ProductVariants,
  SearchItem,
  SearchModule,
  Variant,
  VariantImage,
  VariantOption,
  VariantValue,
  VariantsModule,
} from './types';
// Часть 5б: аналитика магазина — часть SDK без API для секций (src/core/analytics/).
export { analytics } from './analytics/part';
// Блок 9, часть 9в: модули расширений ctx.ext — в бандле страниц, где секция объявила "ext:<id>" в uses.
export { ext } from './parts/ext';
export type { ExtMethod, ExtModule, ExtStore, ExtUse, ExtValue } from './types';
export type { ConsentAnswer, ConsentModule, ConsentState, Money, NewsletterModule, NoticeLevel } from './types';
export {
  EMPTY_INPUT,
  INPUT_PARSE_FAILED,
  SECTION_INPUT_ATTRIBUTE,
  SECTION_INPUT_MAX_BYTES,
  readSectionInput,
  type SectionInput,
} from './input';
export type {
  Action,
  ActionOptions,
  AuthModule,
  BaseCtx,
  BlockValue,
  CartLine,
  CartModule,
  CartState,
  CoreHandle,
  Ctx,
  Customer,
  CustomerState,
  El,
  ErrorCode,
  EventDetail,
  EventMap,
  EventName,
  FailureStage,
  FavoritesModule,
  FavoritesState,
  InstanceHost,
  Json,
  MarkupAction,
  Mode,
  ModuleName,
  Modules,
  PageDomEvent,
  PageInfo,
  ReadableStore,
  Result,
  SdkPart,
  SectionDef,
  SectionEntry,
  SectionEvent,
  SectionFailureDetail,
  SectionStorage,
  SettingValue,
  StartOptions,
  Stop,
} from './types';
// Часть 5г: замена экземпляра секции в превью — бандл превью передаёт её в start({ preview }); протокол превью — вход
// @merfy/shell/preview (src/core/preview-protocol.ts).
export { watchPreviewReplace, type ReplaceDeps } from './replace';
