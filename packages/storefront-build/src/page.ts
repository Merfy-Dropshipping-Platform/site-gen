import {
  readSettingsEdits,
  resolveSettings,
  type PanelSchema,
  type ParsedTheme,
  type TokenMigrations,
} from '@merfy/tokens';
import { sha256 } from './canonical';
import type { BuildFile } from './client-files';
import { placedSections, withoutHidden } from './code';
import { entityKey } from './entities';
import { pageLocals, shopName } from './head';
import type { BuildInputs } from './inputs';
import type { ShopPageLocals } from './locals';
import { checkPageRow, type PageRow } from './manifest';
import { pageListsOf, routeOf, type ShopRoute } from './routes';
import { pageSectionTheme } from './section-tokens';
import {
  LIVE_PAGE,
  renderPlacedSections,
  type PageContent,
  type PageProps,
  type PageRender,
  type PlacedSection,
} from './sections-render';
import { checkSeo } from './seo';
import { shopPropsOf } from './shop-props';

// Одна страница магазина (design.md блока 4, Св-1 В): рендерится по запросу без полной сборки и отдаётся строкой в
// формате манифеста и файлом. Полная сборка рендерит каждую страницу так же, поэтому строки совпадают. Шапка, свой
// список секций и подвал (блок 1 «Секций и SDK», часть 4, Р1-4-7) — одним проходом рендера.

// Путь и данные → HTML. В сборке это render рисовальщика (startRenderer), в быстрых тестах — подставная функция.
export type RenderPage = (path: string, locals: ShopPageLocals) => Promise<string>;

export interface ShopTheme {
  // Словарь и значения токенов темы — parseTheme(tokens из theme.json пакета темы).
  tokens: ParsedTheme;
  render: RenderPage;
  // Шаги перевода правок этой версии темы (migrations.json пакета темы, блок 10). Нет — правки читаются как есть.
  migrations?: TokenMigrations;
  // Схема панели темы (часть 4, Р1-4-4): по ней — настройки темы для секций с "uses": ["theme"]. Нет — настроек нет.
  panel?: PanelSchema;
}

export interface RenderedPage {
  row: PageRow;
  file: BuildFile;
}

// Чья страница и от чего она зависит. Главная и свои страницы — страницы сайта.
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

// Настройки темы и данные магазина для секций страницы (Р1-4-4, Р1-4-6). Правки настроек — из ревизии или, в превью
// одного блока, несохранённые из конструктора; неверная правка — умолчание панели, как у стенда темы.
export function pagePropsOf(
  inputs: BuildInputs,
  theme: ShopTheme,
  settingsEdits: unknown = inputs.revision.settings ?? {},
): PageProps {
  const settings =
    theme.panel === undefined ? {} : resolveSettings(theme.panel, readSettingsEdits(theme.panel, settingsEdits).edits);
  return { theme: settings, shop: shopPropsOf(shopName(inputs.site), inputs.data.entities) };
}

// Разметка трёх списков одного прохода — обратно по спискам: шапка, страница, подвал.
function splitContent(content: PageContent, [header = 0, own = 0]: readonly number[]): PageContent {
  const { sections } = content;
  return {
    ...content,
    header: sections.slice(0, header),
    sections: sections.slice(header, header + own),
    footer: sections.slice(header + own),
  };
}

// page — как рендерить секции: модули, функция рендера и режим. По умолчанию — опубликованный сайт без процесса
// рендера: страница без секций рендерится, страница с секцией — ошибка.
// Строки @theme токенов секций страницы (блок 4, Р4-10): классы токенов секций получают CSS вместе со словарём.
const sectionThemeOf = (inputs: BuildInputs, placed: readonly PlacedSection[]): string =>
  pageSectionTheme(
    inputs.code.sections,
    placed.map((entry) => entry.name),
  );

// Строка манифеста страницы: путь, файл, сущность и её зависимости, время обновления данных.
function pageRowOf(inputs: BuildInputs, route: ShopRoute, content: Buffer): PageRow {
  const entity = pageEntity(inputs, route);
  const deps = [entityKey(entity.type, entity.id)];
  return checkPageRow({
    path: route.path,
    file: route.file,
    hash: sha256(content),
    entity,
    deps,
    dataUpdatedAt: dataUpdatedAt(inputs, deps),
  });
}

export async function renderShopPage(
  inputs: BuildInputs,
  path: string,
  theme: ShopTheme,
  page: PageRender = LIVE_PAGE,
): Promise<RenderedPage> {
  const route = routeOf(path, inputs);
  // Скрытые экземпляры убираются здесь, до рендера (п. 22): разметка, CSS секций и список модулей — по видимым.
  const shown = withoutHidden(inputs);
  const lists = pageListsOf(route.id).map((list) => placedSections(shown, list));
  const props = pagePropsOf(shown, theme);
  const placed = lists.flat();
  const rendered = await renderPlacedSections(
    placed,
    theme.tokens.dictionary,
    { ...page, props },
    sectionThemeOf(inputs, placed),
  );
  const pageContent = splitContent(
    rendered,
    lists.map((list) => list.length),
  );
  const html = await theme.render(route.path, pageLocals(shown, route, theme.tokens, theme.migrations, pageContent));
  checkSeo(route.path, html);
  const content = Buffer.from(html, 'utf8');
  return { row: pageRowOf(inputs, route, content), file: { path: route.file, content } };
}
