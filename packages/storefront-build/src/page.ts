import type { ParsedTheme } from '@merfy/tokens';
import { sha256 } from './canonical';
import type { BuildFile } from './client-files';
import { entityKey } from './entities';
import { pageLocals } from './head';
import type { BuildInputs } from './inputs';
import type { ShopPageLocals } from './locals';
import { checkPageRow, type PageRow } from './manifest';
import { routeOf, type ShopRoute } from './routes';
import { checkSeo } from './seo';

// Одна страница магазина (design.md блока 4, Св-1 В): рисуется по запросу без полной сборки и отдаётся строкой в формате
// манифеста и файлом. Полная сборка рисует каждую страницу так же, поэтому строки совпадают. Где лежит строка
// дорисовки, решает блок 5 (В5-1).

// Путь и данные → HTML. В сборке это render рисовальщика (startRenderer), в быстрых тестах — подставная функция.
export type RenderPage = (path: string, locals: ShopPageLocals) => Promise<string>;

export interface ShopTheme {
  // Словарь и значения токенов темы — parseTheme(tokens из theme.json пакета темы).
  tokens: ParsedTheme;
  render: RenderPage;
}

export interface RenderedPage {
  row: PageRow;
  file: BuildFile;
}

// Чья страница и от чего она зависит. Главная — страница сайта: рисует имя и описание магазина.
const pageEntity = (inputs: BuildInputs, route: ShopRoute) => ({ type: route.entity, id: inputs.site.id });

type Update = [key: string, updatedAt: string];

// Дата правки каждой сущности по ключу, сайта — тоже.
const updateRows = (inputs: BuildInputs): Update[] => [
  [entityKey('site', inputs.site.id), inputs.site.updatedAt],
  ...inputs.data.entities.map((entity): Update => [entityKey(entity.type, entity.id), entity.updatedAt]),
];

// Последняя правка данных страницы — по её зависимостям: из неё lastmod карты сайта (блок 5). Даты в одном формате UTC,
// поэтому порядок строк — это порядок времени.
function dataUpdatedAt(inputs: BuildInputs, deps: readonly string[]): string {
  const updates = new Map(updateRows(inputs));
  const dates = deps.map((key) => updates.get(key) ?? '').sort();
  return dates.at(-1) ?? '';
}

export async function renderShopPage(inputs: BuildInputs, path: string, theme: ShopTheme): Promise<RenderedPage> {
  const route = routeOf(path);
  const html = await theme.render(route.path, pageLocals(inputs, route, theme.tokens));
  checkSeo(route.path, html);
  const content = Buffer.from(html, 'utf8');
  const entity = pageEntity(inputs, route);
  const deps = [entityKey(entity.type, entity.id)];
  const row = checkPageRow({
    path: route.path,
    file: route.file,
    hash: sha256(content),
    entity,
    deps,
    dataUpdatedAt: dataUpdatedAt(inputs, deps),
  });
  return { row, file: { path: route.file, content } };
}
