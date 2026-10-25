import {
  readSettingsEdits,
  resolveSettings,
  type PanelSchema,
  type ParsedTheme,
  type TokenMigrations,
} from '@merfy/tokens';
import { sha256 } from './canonical';
import type { BuildFile } from './client-files';
import { pageBundle, placedSections, withoutHidden } from './code';
import { entityKey } from './entities';
import { pageLocals, shopName } from './head';
import type { BuildInputs } from './inputs';
import type { ShopPageLocals } from './locals';
import { checkPageRow, type PageRow } from './manifest';
import { EMPTY_LIST_QUERY, type ListQuery } from './list-query';
import { listSourceOf, pageListOf, type ListSource, type ListedPage, type PageList } from './page-list';
import { catalogUrlOf, pageInfoOf, pageListsOf, recordIndex, routeOf, type ShopRoute } from './routes';
import { recordDepsOf } from './section-records';
import { pageSectionTheme } from './section-tokens';
import {
  LIVE_PAGE,
  renderPlacedSections,
  type PageContent,
  type PageMode,
  type PageProps,
  type PageRender,
  type PlacedSection,
} from './sections-render';
import { checkSeo } from './seo';
import { policyTextHtml } from './policy-text';
import { shopPropsOf } from './shop-props';
import { HOME_PAGE, NOT_FOUND_PAGE_ID } from './special-pages';

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
  // Схема панели, которую тема показывает мерчанту (часть 4, Р1-4-4): поля из theme.json → panel.hidden убраны. По ней
  // читаются правки настроек темы для секций с "uses": ["theme"]. Нет — настроек для секций нет.
  panel?: PanelSchema;
  // Полная панель платформы со словарём этой темы, скрытые темой поля на месте (часть 3в блока 3, design.md блока 3,
  // 3.7): по ней считаются значения настроек. Нет — значения по panel.
  platformPanel?: PanelSchema;
}

export interface RenderedPage {
  row: PageRow;
  file: BuildFile;
  // Файл бандла страницы _merfy/b/<sha256>.js (часть 5б); нет — бандл встроен в HTML или его нет.
  bundle?: BuildFile;
}

// Чья страница и от чего она зависит. Главная и свои страницы — страницы сайта; страница записи (блок 8, часть 8б) —
// сущности записи: по ней раздача отвечает 301 и 410.
const pageEntity = (inputs: BuildInputs, route: ShopRoute) =>
  route.record?.entity ?? { type: route.entity, id: inputs.site.id };

// Зависимости: записи страницы (сама запись — первой), записи из полей секций (часть 8г) и сайт — шапка и подвал есть
// на каждой странице. Ключ — один раз.
const pageDeps = (inputs: BuildInputs, route: ShopRoute, recordDeps: readonly string[]): string[] => [
  ...new Set([...(route.record?.deps ?? []), ...recordDeps, entityKey('site', inputs.site.id)]),
];

// Вторые адреса (часть 8б: адрес записи по id; блок 11: …/page/1 первой страницы списка) — поле строки только у страницы,
// у которой они есть.
function aliasesOf(route: ShopRoute): { aliases?: string[] } {
  const aliases = [...(route.record?.aliases ?? []), ...(route.aliases ?? [])];
  return aliases.length === 0 ? {} : { aliases };
}

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
  // Правки читаются по полям, которые тема показывает мерчанту; значения — по полной панели платформы (часть 3в блока 3,
  // 3.7): поле, скрытое темой, приходит с умолчанием, правка по нему не действует.
  const settings =
    theme.panel === undefined
      ? {}
      : resolveSettings(theme.platformPanel ?? theme.panel, readSettingsEdits(theme.panel, settingsEdits).edits);
  const shop = shopPropsOf(shopName(inputs.site), inputs.data.entities, catalogUrlOf(inputs));
  return { theme: settings, shop, page: HOME_PAGE };
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

// Разметка трёх списков страницы. Страница политики, пока в шаблоне «Политика» нет видимых секций (блок 8, В8-1 А): в
// <main> — текст от платформы. Исключение — только у политик: пустой шаблон другой записи страниц не даёт (routes.ts,
// templateShown). Отдельной функцией: renderShopPage с бандлом 5б остаётся в пределе 30 строк.
function pageContentOf(
  rendered: PageContent,
  lists: readonly (readonly PlacedSection[])[],
  route: ShopRoute,
): PageContent {
  const content = splitContent(
    rendered,
    lists.map((list) => list.length),
  );
  if (route.record?.type !== 'policy' || (lists[1] ?? []).length > 0) return content;
  return { ...content, sections: [policyTextHtml(route.record.record)] };
}

// Разметка страницы с бандлом (часть 5б): бандл — по тем же видимым экземплярам, его тег — в <head> после стилей
// секций. Возврат — HTML и файл бандла (нет — null: бандл встроен в HTML или его нет).
async function renderWithBundle(
  shown: BuildInputs,
  route: ReturnType<typeof routeOf>,
  theme: ShopTheme,
  page: PageRender,
  pageContent: PageContent,
): Promise<{ html: string; bundle: Awaited<ReturnType<typeof pageBundle>> }> {
  const bundle = await pageBundle(shown, route.id, page, pageContent);
  const withBundle = { ...pageContent, bundleTag: bundle?.tag ?? '' };
  // Страницу 404 (часть 7а) тема рисует маршрутом главной: адрес /404 Astro держит за своей страницей ошибки и маршрут
  // [slug].astro не вызывает. Канонический адрес в head — /404: его считает pageLocals по route.
  const drawPath = route.id === NOT_FOUND_PAGE_ID ? '/' : route.path;
  const html = await theme.render(drawPath, pageLocals(shown, route, theme.tokens, theme.migrations, withBundle));
  return { html, bundle };
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
function pageRowOf(
  inputs: BuildInputs,
  route: ShopRoute,
  content: Buffer,
  recordDeps: readonly string[],
  list: PageList | null,
): PageRow {
  const entity = pageEntity(inputs, route);
  const deps = pageDeps(inputs, route, recordDeps);
  return checkPageRow({
    path: route.path,
    file: route.file,
    hash: sha256(content),
    entity,
    deps,
    dataUpdatedAt: dataUpdatedAt(inputs, deps),
    ...aliasesOf(route),
    // Список страницы (блок 11, Р11а-11) — номер; у страницы без списка поля нет.
    ...(list === null ? {} : { list: { page: list.page } }),
  });
}

// Параметры списка страницы (план 11а-2): выбранное и ответ сервиса product; нет — список из записей сборки.
export interface ListRequest {
  query: ListQuery;
  listed: ListedPage | null;
}

// Чей список у страницы по адресу (план 11а-2 — до запроса к сервису product). Нет страницы — page-unknown.
export function listSourceAt(inputs: BuildInputs, path: string, theme: ShopTheme, mode?: PageMode): ListSource | null {
  const route = routeOf(path, inputs, mode ?? 'live');
  const shown = withoutHidden(inputs);
  const props = { ...pagePropsOf(shown, theme), page: pageInfoOf(route), records: recordIndex(shown) };
  return listSourceOf(shown, route, placedSections(shown, route.id), props);
}

// Номер страницы списка: из запроса, а если он первый — из адреса (страница N).
function listQueryOf(list: ListRequest | undefined, route: ShopRoute): ListQuery {
  if (list === undefined) return { ...EMPTY_LIST_QUERY, page: route.list?.page ?? 1 };
  return { ...list.query, page: list.query.page === 1 ? (route.list?.page ?? 1) : list.query.page };
}

// page.list страницы (Р11а-5): по источнику списка и запросу; нет списка — null.
function pageListAt(
  shown: BuildInputs,
  route: ShopRoute,
  placed: readonly PlacedSection[],
  base: PageProps,
  list: ListRequest | undefined,
): PageList | null {
  const source = listSourceOf(shown, route, placed, base);
  if (source === null) return null;
  return pageListOf(recordIndex(shown), shown, source, listQueryOf(list, route), list?.listed ?? null);
}

// Зависимости списка — карточки этой страницы (Р11а-8): их правки меняют страницу.
function listDepsOf(list: PageList | null): string[] {
  if (list === null) return [];
  const keys = list.items.map((item) => (list.kind === 'products' ? `product:${item.id}` : `publication:${item.id}`));
  return [...new Set(keys)];
}

export async function renderShopPage(
  inputs: BuildInputs,
  path: string,
  theme: ShopTheme,
  page: PageRender = LIVE_PAGE,
  list?: ListRequest,
): Promise<RenderedPage> {
  // Превью конструктора (часть 8б-2) — маршруты превью: страницы всех шаблонов и примеры; сборка — только записи с
  // показанным шаблоном.
  const route = routeOf(path, inputs, page.mode);
  // Скрытые экземпляры убираются здесь, до рендера (п. 22): разметка, CSS секций и список модулей — по видимым.
  const shown = withoutHidden(inputs);
  const lists = pageListsOf(route.id).map((list) => placedSections(shown, list));
  // Страница секций (часть 7а): id и адрес этой страницы; записи магазина — полям с записями (часть 8г).
  const base = { ...pagePropsOf(shown, theme), page: pageInfoOf(route), records: recordIndex(shown) };
  // Список страницы (блок 11 «Секций и SDK», часть 11а): у каждой секции в page.list; нет — ключа нет (Р11а-5).
  const pageList = pageListAt(shown, route, lists[1] ?? [], base, list);
  const props = pageList === null ? base : { ...base, page: { ...base.page, list: pageList } };
  const placed = lists.flat();
  const rendered = await renderPlacedSections(
    placed,
    theme.tokens.dictionary,
    { ...page, props },
    sectionThemeOf(inputs, placed),
  );
  const pageContent = pageContentOf(rendered, lists, route);
  // Сквозные настройки темы — те же значения, что у секций в Astro.props.theme: с PageContent они идут в theme.settings
  // конфига (блок 9 «Секций и SDK», часть 9б; Р9б-14).
  const withTheme = { ...pageContent, themeSettings: props.theme };
  const { html, bundle } = await renderWithBundle(shown, route, theme, page, withTheme);
  checkSeo(route.path, html);
  const content = Buffer.from(html, 'utf8');
  const row = pageRowOf(inputs, route, content, [...recordDepsOf(placed, props), ...listDepsOf(pageList)], pageList);
  const file = bundle?.file ?? null;
  return { row, file: { path: route.file, content }, ...(file === null ? {} : { bundle: file }) };
}
