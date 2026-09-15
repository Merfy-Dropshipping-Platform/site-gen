/**
 * Контекст коллекции для превью конструктора — ЕДИНЫЙ источник имени/описания/
 * картинки коллекции для ТОЧЕЧНОГО перерендера секции.
 *
 * Зачем он есть. Страница коллекции (`page-collection`) — это ШАБЛОН: её блоки
 * хранят в Puck JSON не текст, а плейсхолдеры `{{COLLECTION_NAME}}` /
 * `{{COLLECTION_DESCRIPTION}}` / `{{COLLECTION_IMAGE}}`. Подставляет их тот, кто
 * рендерит, и путей рендера у нас ТРИ:
 *   1. живая витрина — `substituteVars` в сгенерённом `collections/[slug].astro`;
 *   2. целая страница превью — `extractPageBlocks(..., collectionContext)`;
 *   3. ТОЧЕЧНЫЙ hot-render одной секции — `POST /api/sites/:id/preview/block`
 *      (им идут и `update-block` при правке любого поля панели, и `reconcile`).
 *
 * Третий путь подстановки не имел вовсе: тело запроса — это `{ blockType, props }`
 * из Puck, без страницы и без коллекции. Поэтому первая же правка в панели
 * «Группа товаров» (в т.ч. «Выбор коллекции») заменяла нарисованный заголовок
 * сырым `{{COLLECTION_NAME}}` — баг владельца 15.09.
 *
 * Как чинится. GET-превью УЖЕ резолвит контекст коллекции по маршруту
 * (`collections/<slug>` → коллекция, `collections/preview` → пресет шаблона) —
 * кладём этот же контекст в `<head>` отдаваемой страницы, агент превью
 * возвращает его в теле POST `/preview/block`, а сервер применяет ТУ ЖЕ функцию
 * `applyCollectionContextToProps`, что и путь целой страницы.
 *
 * Почему источник истины — маршрут, а не проп «Выбор коллекции»: живая витрина
 * подставляет имя из `Astro.params.slug` и перебивает проп
 * (`collectionSlug={slug}` в `generatePuckCollectionsSlugPage`). Превью обязано
 * повторять витрину.
 *
 * ── Почему это не дыра в витрине ───────────────────────────────────────────
 *  1. Глобал ставит `preview.controller.injectPreviewGlobals` — метод
 *     контроллера превью. Сборка витрины (`generator/build.service.ts`) этот
 *     модуль не импортирует; на live глобала нет, подстановка там своя.
 *  2. Утечь нечему: в глобале только имя/описание/обложка коллекции ЭТОГО же
 *     сайта — ровно то, что и так напечатано на отдаваемой странице превью.
 */

/** Имя глобала. Одно на всю платформу — агент превью читает именно его. */
export const PREVIEW_COLLECTION_GLOBAL = '__MERFY_COLLECTION_CTX__';

/** Контекст коллекции: то же, что `CollectionContext` в src/themes/collection-context.ts. */
export interface PreviewCollectionContext {
  name?: string;
  description?: string;
  image?: string;
  slug?: string;
}

/**
 * Маркер идемпотентности — ПРИСВАИВАНИЕ, а не имя глобала. Те же грабли, что у
 * демо-глобала кабинета: имя встречается и в ЧТЕНИИ внутри агента, поэтому
 * сторожить простое вхождение нельзя — инжект молча пропускался бы.
 */
export const PREVIEW_COLLECTION_MARKER = `window.${PREVIEW_COLLECTION_GLOBAL} = `;

/**
 * Вставить контекст коллекции в `<head>` превью.
 *
 * `ctx === undefined` — страница НЕ коллекционная: HTML возвращается байт в байт,
 * глобала нет, агент шлёт `update-block` как раньше. Пустой объект `{}` —
 * страница коллекционная, но данных коллекции нет (пресет `collections/preview`
 * на пустом магазине): глобал ставится, и подстановка даёт те же дефолты, что
 * живая витрина («Каталог» / пусто).
 */
export function injectPreviewCollectionGlobal(
  html: string,
  ctx: PreviewCollectionContext | undefined,
): string {
  if (!ctx || typeof ctx !== 'object') return html;
  if (html.includes(PREVIEW_COLLECTION_MARKER)) return html;
  // Нет <head> — не трогаем документ ВООБЩЕ (как соседние инжекторы превью).
  // Первая редакция клала тег перед <!DOCTYPE> и тем ломала страницы-шеллы без
  // головы; поймано `preview-page-routing.spec.ts`.
  const tag = `<script>${PREVIEW_COLLECTION_MARKER}${JSON.stringify(ctx)};</script>`;
  return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${tag}`);
}
