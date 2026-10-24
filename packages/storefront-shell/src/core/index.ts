// @merfy/shell и @merfy/shell/core — ядро секций в браузере (design.md блока 5). Бандл страницы (часть 5б) импортирует
// отсюда start и части SDK, в том числе analytics — её получает каждая страница опубликованного сайта; код секции —
// defineSection и типы.
export { defineSection } from './define';
export { SECTION_FAILURE_EVENT } from './events';
export { start, type CoreEnv, type StartedCore } from './start';
export { auth } from './parts/auth';
export { cart } from './parts/cart';
export { favorites } from './parts/favorites';
// Блок 6: типы ctx.animate. Поведения и анимации — @merfy/shell/behaviors.
export type { AnimateOptions, Animation, Bezier, EasingName, KeyframeValue, Keyframes } from './types';
// Блок 9: подписка на рассылку, типы событий и денег. Каталоги событий и действий — @merfy/shell/events и
// @merfy/shell/actions.
export { newsletter } from './parts/newsletter';
// Часть 5б: аналитика магазина — часть SDK без API для секций (src/core/analytics/).
export { analytics } from './analytics/part';
export type { ConsentState, Money, NewsletterModule, NoticeLevel } from './types';
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
