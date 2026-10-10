// @merfy/shell — ядро витрины (design.md блока 7). Секции всех авторов берут отсюда определение секции (С7-15 Б) и части
// ядра по имени (С7-3 Б); журнал ошибок из браузера (блок 11) — имя события сбоя секции. Остальное — устройство ядра.
export { defineSection, type SectionContext, type SectionDefinition } from './define';
export { part } from './parts/registry';
export type {
  AuthPart,
  AuthState,
  CartLine,
  CartPart,
  CartState,
  FavoritesPart,
  FavoritesState,
  PartName,
  Parts,
} from './parts/types';
export { SECTION_ERROR_EVENT, type SectionFailure } from './report';
