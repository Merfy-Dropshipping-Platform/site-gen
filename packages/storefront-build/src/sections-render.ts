import type { Dictionary } from '@merfy/tokens';
import { sha256 } from './canonical';
import { StorefrontBuildError } from './errors';
import { sectionCss } from './section-css';
import { EMPTY_SHOP, type ShopProps } from './shop-props';

// Рендер секций страницы (блок 1 «Секций и SDK», Р1, Р2): модуль шаблона по отпечатку и значения настроек → HTML
// секции. Пакет Astro и компилятор не подключает: функцию рендера даёт сборщик — процесс рендера storefront-sections
// (render.ts). Обёртка — <merfy-section data-section data-section-id class="py-section">: по data-section-id превью
// выбирает и заменяет секцию. CSS секций — классы Tailwind из их разметки (section-css.ts).
export type SettingValues = Readonly<Record<string, string | boolean>>;

// Блок секции в шаблоне (часть 3): показанный блок со значениями настроек.
export interface RenderBlock {
  id: string;
  type: string;
  settings: SettingValues;
}

// Дерево меню в шаблоне (часть 4, Р1-4-3): пункт — подпись, адрес и вложенные пункты (всегда список, до трёх уровней).
export interface MenuTreeItem {
  label: string;
  url: string;
  items: MenuTreeItem[];
}

export interface MenuTree {
  title: string;
  items: MenuTreeItem[];
}

// Что страница даёт секциям сверх их настроек (часть 4, Р1-4-4, Р1-4-6): настройки темы и данные магазина. Получает
// только секция, которая объявила их в "uses".
export type PropsUse = 'theme' | 'shop';

export interface PageProps {
  theme: SettingValues;
  shop: ShopProps;
}

export const NO_PAGE_PROPS: PageProps = { theme: {}, shop: EMPTY_SHOP };

export interface SectionRenderRequest {
  section: string;
  hash: string;
  module: string;
  settings: SettingValues;
  // Часть 3: показанные блоки секции и режим превью (метки блоков); нет — блоков нет, режим — витрина.
  blocks?: readonly RenderBlock[];
  preview?: boolean;
  // Часть 4: деревья меню по id настройки вида menu, настройки темы и данные магазина — только секциям с "uses".
  menus?: Readonly<Record<string, MenuTree>>;
  theme?: SettingValues;
  shop?: ShopProps;
}

export type RenderSection = (request: SectionRenderRequest) => Promise<string>;

// Модули рендера по отпечатку и функция рендера.
export interface SectionsRender {
  modules: ReadonlyMap<string, string>;
  render: RenderSection;
}

// live — сборка и дорисовка опубликованного сайта; preview — превью конструктора.
export type PageMode = 'live' | 'preview';

// Стадии отказа рендера секции (блок 2 «Секций и SDK», «Решил сам» п. 8): render — секция бросила исключение или
// процесс упал на ней, render-timeout — дольше срока, render-output — ответ больше предела, render-memory — не хватило
// памяти, render-denied — отказ прав процесса рендера (ERR_ACCESS_DENIED). Стадию даёт ошибка рендера (поле stage);
// ошибка без стадии — сбой не секции, а процесса рендера: он не запустился или его нет.
export const RENDER_STAGES = ['render', 'render-timeout', 'render-output', 'render-memory', 'render-denied'] as const;
export type RenderStage = (typeof RENDER_STAGES)[number];

// Секция упала при рендере на опубликованном сайте: на странице её нет, сборщик пишет журнал и строку таблицы ошибок.
export interface SectionFailure {
  id: string;
  section: string;
  hash: string;
  stage: RenderStage;
  message: string;
}

export type SectionFailed = (failure: SectionFailure) => void;

export interface PageRender {
  sections: SectionsRender;
  mode: PageMode;
  // Кому сообщить об упавшей секции опубликованного сайта; нет — без сообщения.
  failed?: SectionFailed;
  // Настройки темы и данные магазина страницы (часть 4); нет — пустые.
  props?: PageProps;
}

// Экземпляр секции на странице: id, полное имя, отпечаток модуля рендера и значения всех настроек.
export interface PlacedSection {
  id: string;
  name: string;
  hash: string;
  settings: SettingValues;
  // Показанные блоки по порядку (часть 3): только у секций с blocks в section.json.
  blocks?: readonly RenderBlock[];
  // false — секцию нельзя пропустить (шапка, подвал): её ошибка — ошибка сборки, на сайте остаётся прежняя сборка (блок
  // 2, «Решил сам» п. 7). Флаг — "removable" из section.json (часть 4 блока 1); нет — секцию можно пропустить.
  removable?: boolean;
  // Часть 4: деревья меню по id настройки вида menu; что шаблон читает сверх settings и blocks ("uses").
  menus?: Readonly<Record<string, MenuTree>>;
  uses?: readonly PropsUse[];
}

// HTML секций одной страницы, байт (блок 2, «Решил сам» п. 3): секция, которая не влезает, не рендерится (render-output).
export const PAGE_SECTIONS_BYTES = 4 * 1024 * 1024;

// sections — секции страницы; header и footer — шапка и подвал (часть 4); нет — пусто.
export interface PageContent {
  header?: string[];
  sections: string[];
  footer?: string[];
  sectionsCss: string;
  mode: PageMode;
}

export const WRAPPER_CLASS = 'py-section';

// Без процесса рендера: страница без секций рисуется, страница с секцией — ошибка render-failed.
export const NO_SECTIONS: SectionsRender = {
  modules: new Map(),
  render: () => Promise.reject(new Error('нет процесса рендера секций')),
};
export const LIVE_PAGE: PageRender = { sections: NO_SECTIONS, mode: 'live' };
export const EMPTY_PAGE_CONTENT: PageContent = { sections: [], sectionsCss: '', mode: 'live' };

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
};
const escapeHtml = (text: string): string => text.replace(/[&"<>']/g, (char) => ESCAPES[char] ?? char);
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const isRenderStage = (value: unknown): value is RenderStage => RENDER_STAGES.some((stage) => stage === value);

function stageOf(error: unknown): RenderStage | null {
  const stage: unknown = Reflect.get(Object(error), 'stage');
  return isRenderStage(stage) ? stage : null;
}

const failureOf = (placed: PlacedSection, stage: RenderStage, error: unknown): SectionFailure => ({
  id: placed.id,
  section: placed.name,
  hash: placed.hash,
  stage,
  message: errorText(error),
});

const wrapper = (placed: PlacedSection, html: string): string =>
  `<merfy-section data-section="${escapeHtml(placed.name)}" data-section-id="${escapeHtml(placed.id)}" class="${WRAPPER_CLASS}">${html}</merfy-section>`;

// Ошибка рендера секции. На опубликованном сайте (В2-1 А, «Решил сам» п. 7) упавшей секции нет, об ошибке сообщается;
// секция с removable: false и сбой процесса рендера (ошибка без стадии) — ошибка сборки render-failed, сборку не
// выкладываем, на сайте остаётся прежняя. В превью — блок с именем секции и текстом ошибки в красной рамке.
const ON_RENDER_ERROR: Record<PageMode, (placed: PlacedSection, error: unknown, failed?: SectionFailed) => string> = {
  live: (placed, error, failed) => {
    const stage = stageOf(error);
    if (stage !== null) failed?.(failureOf(placed, stage, error));
    if (stage !== null && placed.removable !== false) return '';
    throw new StorefrontBuildError('render-failed', `секция ${placed.name} не отрисовалась: ${errorText(error)}`, {
      path: placed.id,
      cause: error,
    });
  },
  preview: (placed, error) =>
    `<div data-merfy-error style="border:2px solid #dc2626;padding:16px;color:#dc2626;font:14px/1.4 system-ui,sans-serif">Секция ${escapeHtml(placed.name)} не отрисовалась: ${escapeHtml(errorText(error))}</div>`,
};

// Пропущенная секция — пустая строка, без обёртки.
function failedHtml(placed: PlacedSection, mode: PageMode, error: unknown, failed?: SectionFailed): string {
  const html = ON_RENDER_ERROR[mode](placed, error, failed);
  return html === '' ? '' : wrapper(placed, html);
}

// Сверх settings и blocks (часть 4, Р1-4-5): меню — у секции с настройками вида menu; theme и shop — только тем, кто их
// объявил в "uses": данные магазина не уходят в модуль секции без спроса.
const propsOf = (placed: PlacedSection, props: PageProps): Pick<SectionRenderRequest, 'menus' | 'theme' | 'shop'> => ({
  ...(placed.menus === undefined ? {} : { menus: placed.menus }),
  ...(placed.uses?.includes('theme') === true ? { theme: props.theme } : {}),
  ...(placed.uses?.includes('shop') === true ? { shop: props.shop } : {}),
});

export async function renderSection(
  placed: PlacedSection,
  sections: SectionsRender,
  mode: PageMode,
  failed?: SectionFailed,
  props: PageProps = NO_PAGE_PROPS,
): Promise<string> {
  const module = sections.modules.get(placed.hash);
  if (module === undefined || sha256(Buffer.from(module, 'utf8')) !== placed.hash)
    throw new StorefrontBuildError('code-missing', 'нет модуля рендера секции с этим отпечатком', {
      path: placed.hash,
    });
  try {
    const html = await sections.render({
      section: placed.name,
      hash: placed.hash,
      module,
      settings: placed.settings,
      blocks: placed.blocks ?? [],
      preview: mode === 'preview',
      ...propsOf(placed, props),
    });
    return wrapper(placed, html);
  } catch (error) {
    return failedHtml(placed, mode, error, failed);
  }
}

const overflow = (): Error =>
  Object.assign(new Error(`HTML секций страницы больше ${PAGE_SECTIONS_BYTES} байт`), { stage: 'render-output' });

// Секция в остаток предела страницы; не влезла — отказ render-output, как у секции с большим ответом.
async function withinPage(placed: PlacedSection, page: PageRender, left: number): Promise<string> {
  if (left <= 0) return failedHtml(placed, page.mode, overflow(), page.failed);
  const html = await renderSection(placed, page.sections, page.mode, page.failed, page.props);
  return Buffer.byteLength(html) <= left ? html : failedHtml(placed, page.mode, overflow(), page.failed);
}

// Секции страницы по порядку и CSS их классов. Секций нет — процесс рендера не нужен, Tailwind не собирается. Секции
// рендерятся по одной: процесс рендера держит в работе один запрос, предел страницы считается по порядку.
export async function renderPlacedSections(
  placed: readonly PlacedSection[],
  dictionary: Dictionary,
  page: PageRender,
): Promise<PageContent> {
  if (placed.length === 0) return { ...EMPTY_PAGE_CONTENT, mode: page.mode };
  const sections: string[] = [];
  let left = PAGE_SECTIONS_BYTES;
  for (const entry of placed) {
    const html = await withinPage(entry, page, left);
    left -= Buffer.byteLength(html);
    sections.push(html);
  }
  return { sections, sectionsCss: await sectionCss(sections.join(''), dictionary), mode: page.mode };
}
