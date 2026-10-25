import { placedSections, withoutHidden } from './code';
import type { BuildInputs } from './inputs';
import { EMPTY_LIST_QUERY } from './list-query';
import { listSourceOf, pageListOf, type ListSource } from './page-list';
import type { RecordIndex } from './records';
import { CATALOG_PAGE_ID, CATALOG_PATH, catalogShown, pageInfoOf, type ShopRoute } from './routes';
import { NO_PAGE_PROPS, type PageMode } from './sections-render';

// Каталог и страницы N списков (Р11а-1, Р11а-4): страницы N — у каталога, коллекций и блогов с показанным шаблоном, по
// числу страниц списка; у страницы N тот же id, сущность и запись, что у первой, list: { page: N }.

// Маршрут каталога: первая страница списка, второй адрес — /catalog/page/1. В сборке — при показанном каталоге; в
// превью — всегда: мерчант ставит в каталог первую секцию.
function catalogRouteOf(inputs: BuildInputs, mode: PageMode): ShopRoute[] {
  if (mode !== 'preview' && !catalogShown(inputs)) return [];
  return [
    {
      id: CATALOG_PAGE_ID,
      path: CATALOG_PATH,
      file: 'catalog/index.html',
      entity: 'site',
      list: { page: 1 },
      aliases: [`${CATALOG_PATH}/page/1`],
    },
  ];
}

// Данные для поиска списка у маршрута: записи полей секций читаются по записям страницы.
const propsOf = (route: ShopRoute, index: RecordIndex) => ({
  ...NO_PAGE_PROPS,
  page: pageInfoOf(route),
  records: index,
});

// Список первой страницы маршрута: каталог, запись коллекции или блога; страницы N — только у него.
function listSourceOfRoute(
  inputs: BuildInputs,
  shown: BuildInputs,
  route: ShopRoute,
  index: RecordIndex,
): ListSource | null {
  return listSourceOf(inputs, route, placedSections(shown, route.id), propsOf(route, index));
}

// Страницы N одного списка: число страниц — по записям сборки; маршрут — тот же id, сущность и запись.
function pageRoutesOf(inputs: BuildInputs, shown: BuildInputs, route: ShopRoute, index: RecordIndex): ShopRoute[] {
  const source = listSourceOfRoute(inputs, shown, route, index);
  if (source === null || source.pages !== 'built') return [];
  const { pages } = pageListOf(index, shown, source, EMPTY_LIST_QUERY, null);
  return Array.from({ length: pages - 1 }, (_, n): ShopRoute => {
    const page = n + 2;
    return {
      id: route.id,
      path: `${route.path}/page/${page}`,
      file: `${route.path.slice(1)}/page/${page}/index.html`,
      entity: route.entity,
      ...(route.record === undefined ? {} : { record: route.record }),
      list: { page },
    };
  });
}

export function listRoutesOf(
  inputs: BuildInputs,
  mode: PageMode,
  records: readonly ShopRoute[],
  index: RecordIndex,
): ShopRoute[] {
  const shown = withoutHidden(inputs);
  const catalog = catalogRouteOf(inputs, mode);
  // Страницы N — при сборке (Р11а-4): превью конструктора открывает одну страницу, номера ему не нужны.
  if (mode === 'preview') return [...catalog];
  const sources = [...catalog, ...records];
  return [...catalog, ...sources.flatMap((route) => pageRoutesOf(inputs, shown, route, index))];
}
