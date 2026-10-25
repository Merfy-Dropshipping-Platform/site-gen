import { MOTION_CSS, MOTION_HEAD_SCRIPT } from '@merfy/shell/behaviors/motion-css';
import { EXT_USE_PREFIX, type StorefrontExtensions } from '@merfy/storefront-config';
import { bundlePage, type BundleKit, type BundleSection, type PageBundle } from './bundle';
import { kitPlanOf } from './features';
import { sha256 } from './canonical';
import { StorefrontBuildError } from './errors';
import type { BuildInputs, CodeSection, ShellInput } from './inputs';
import { pageListsOf } from './routes';
import type { PageContent, PageRender, PlacedSection } from './sections-render';
import type { ShellBuild, ShellKit } from './shell';

// Код секций в странице и в сборке магазина (design.md блока 7, п. 12, 16, 19; блок 5 «Секций и SDK», раздел 3.10).
// Разметка секции — в HTML страницы, в <merfy-section data-section="<имя>">. В <head> после токенов темы: стили секций
// страницы одним тегом, потом бандл страницы — один <script type="module"> (bundle.ts). Бандл — только у страниц
// опубликованного сайта: ядро секций, его части из core.json и часть аналитики, модули секций страницы со скриптом и
// глобальные скрипты. Превью (часть 5г), стенд и рендер без кода — без бандла.
const HASH_PREFIX = 'sha256:';
// Части без API для секций — в бандле каждой страницы опубликованного сайта (раздел 3.13): аналитика, как трекер в
// HTML каждой страницы на проде.
export const LIVE_PARTS: readonly string[] = ['analytics'];

// id расширений из "ext:<id>" в meta.uses секции (блок 9 «Секций и SDK», часть 9в; Р9в-20): script_meta строки реестра.
const extIdsOf = (section: CodeSection): string[] =>
  (section.meta?.uses ?? []).flatMap((use) =>
    use.startsWith(EXT_USE_PREFIX) ? [use.slice(EXT_USE_PREFIX.length)] : [],
  );

// Сторы и методы расширений для конфига страницы (Р9в-6): расширения из meta.uses секций этой страницы (шапка,
// страница, подвал, глобальные скрипты; со скриптом и без — действие data-action="ext.…" есть и у секции без скрипта),
// только те, что есть в code.extensions (включены у магазина). По алфавиту id.
export function pageExtensions(inputs: BuildInputs, pageId: string): StorefrontExtensions {
  const ids = new Set(pageCode(inputs, pageId).flatMap(extIdsOf));
  return Object.fromEntries(
    Object.entries(inputs.code.extensions ?? {})
      .filter(([id]) => ids.has(id))
      .sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}

// Байты кода, которых нет во входах: сборка ядра, скрипты секций и модули рендера по хешу. Входы называют их хешами,
// сборка сверяет байты с ними.
export interface CodeAssets {
  shell: ShellBuild | null;
  modules: ReadonlyMap<string, Uint8Array>;
  // Модули рендера (блок 1 «Секций и SDK»): текст скомпилированного шаблона по sha256 его байтов.
  renders: ReadonlyMap<string, string>;
}

export const NO_ASSETS: CodeAssets = { shell: null, modules: new Map(), renders: new Map() };

const hexOf = (hash: string): string => hash.slice(HASH_PREFIX.length);

// Секции страницы: места мерчанта по порядку, потом глобальные скрипты; имя — один раз, хоть секция и стоит дважды.
function pageCode(inputs: BuildInputs, pageId: string): CodeSection[] {
  const byName = new Map(inputs.code.sections.map((section): [string, CodeSection] => [section.name, section]));
  // Шапка, страница и подвал (часть 4 блока 1): код секций всех трёх списков — и в стилях, и в бандле страницы.
  const placed = pageListsOf(pageId).flatMap((list) =>
    (inputs.code.pages[list] ?? []).map((instance) => instance.section),
  );
  const names = new Set([...placed, ...inputs.code.globals]);
  return [...names].flatMap((name) => byName.get(name) ?? []);
}

// CSS секций страницы — классы Tailwind из их разметки (section-css.ts). </style внутри CSS закрыл бы тег раньше
// времени: сборка страхует.
function styleTag(css: string): string {
  return `<style id="merfy-sections">${css.replaceAll('</style', '<\\/style')}</style>`;
}

// Код страницы для <head>, после токенов темы: стили секций (секций нет — стилей нет), потом тег бандла страницы.
export function codeHead(inputs: BuildInputs, pageId: string, css: string, bundleTag = ''): string {
  const style = pageCode(inputs, pageId).length === 0 ? '' : styleTag(css);
  return `${style}${bundleTag}`;
}

// Экземпляры секций страницы в порядке мерчанта — для рендера (sections-render.ts). Глобальным скриптам место не
// нужно: скрытый элемент им ставит ядро.
// Входы без скрытых экземпляров (hidden: true, п. 22): у страницы нет ни их разметки, ни модулей, ни CSS. Зовёт её
// только renderShopPage — одна функция для сборки, рендера по запросу и превью; автор секции hidden не проверяет.
export function withoutHidden(inputs: BuildInputs): BuildInputs {
  const pages = Object.fromEntries(
    Object.entries(inputs.code.pages).map(
      ([page, instances]) => [page, instances.filter((instance) => instance.hidden !== true)] as const,
    ),
  );
  return { ...inputs, code: { ...inputs.code, pages } };
}

// script: true — у секции есть скрипт: рендер добавит в обёртку тег входных данных. Флаги section.json (removable,
// uses — 4а блока 1) и меню экземпляра прокидываются дальше без изменений.
export function placedSections(inputs: BuildInputs, pageId: string): PlacedSection[] {
  const byName = new Map(inputs.code.sections.map((section): [string, CodeSection] => [section.name, section]));
  return (inputs.code.pages[pageId] ?? []).map((instance) => {
    const section = byName.get(instance.section);
    const script = section?.script ?? null;
    return {
      id: instance.id,
      name: instance.section,
      hash: section?.render ?? '',
      settings: instance.settings,
      ...(instance.blocks === undefined ? {} : { blocks: instance.blocks }),
      ...(instance.menus === undefined ? {} : { menus: instance.menus }),
      ...(instance.wrapper === undefined ? {} : { wrapper: instance.wrapper }),
      ...placeFlags(inputs, instance.section),
      ...(script === null ? {} : { script: true }),
    };
  });
}

// removable и uses секции (часть 4 блока 1) и классы её скрипта (часть 5в блока 5) — из кода магазина по имени: у
// секции без них ключей нет.
function placeFlags(inputs: BuildInputs, name: string): Pick<PlacedSection, 'removable' | 'uses' | 'classes'> {
  const section = inputs.code.sections.find((candidate) => candidate.name === name);
  const classes = section?.meta?.classes ?? [];
  return {
    ...(section?.removable === undefined ? {} : { removable: section.removable }),
    ...(section?.uses === undefined ? {} : { uses: section.uses }),
    ...(classes.length === 0 ? {} : { classes }),
  };
}

function checkedShell(input: ShellInput, build: ShellBuild | null): ShellBuild {
  if (build === null)
    throw new StorefrontBuildError('shell-missing', 'во входах есть ядро, а его сборки нет', { path: 'shell' });
  if (build.hash !== input.hash)
    throw new StorefrontBuildError('shell-mismatch', `сборка ядра ${build.hash} — не та, что во входах`, {
      path: 'shell.hash',
    });
  return build;
}

function moduleText(hash: string, modules: ReadonlyMap<string, Uint8Array>): string {
  const content = modules.get(hash);
  if (content === undefined || sha256(content) !== hash)
    throw new StorefrontBuildError('code-missing', 'нет файла скрипта секции с этим хешем', { path: hash });
  return Buffer.from(content).toString('utf8');
}

// Байты кода сверяются до рендера: нет сборки ядра, не та сборка, нет скрипта или байты не те — ошибка, рендер не
// начинали, опубликованный сайт не трогаем.
export function checkCodeAssets(inputs: BuildInputs, assets: CodeAssets): void {
  if (inputs.shell !== null) checkedShell(inputs.shell, assets.shell);
  inputs.code.sections.flatMap(withScript).forEach(({ hash }) => moduleText(hash, assets.modules));
}

// Секция со скриптом и хеш её модуля.
interface ScriptSection {
  section: CodeSection;
  hash: string;
}

function withScript(section: CodeSection): ScriptSection[] {
  return section.script === null ? [] : [{ section, hash: section.script }];
}

// Части бандла страницы (design.md блока 5, раздел 3.8): части ядра из core.json — всегда (С7-3 Б), потом части из
// script_meta секций страницы, которых в ядре нет, по алфавиту, последними — части без API для секций (LIVE_PARTS).
export function pageParts(core: readonly string[], sections: readonly CodeSection[]): string[] {
  const known = new Set([...core, ...LIVE_PARTS]);
  const wanted = new Set(sections.flatMap((section) => section.meta?.parts ?? []));
  const extra = [...wanted].filter((part) => !known.has(part)).sort();
  return [...core, ...extra, ...LIVE_PARTS];
}

// Бандл страницы опубликованного сайта (раздел 3.10). Превью, рендер без кода (page.code нет) и входы без ядра — без
// бандла. Секция получает в ctx модули из своего script_meta.uses; у строки до части 5в (meta нет) — все части ядра из
// core.json, как в 5б. Предупреждения — page.notice.
export async function pageBundle(
  inputs: BuildInputs,
  pageId: string,
  page: PageRender,
  content: PageHtml = NO_HTML,
): Promise<PageBundle | null> {
  const shell = inputs.shell;
  const assets = page.code;
  if (page.mode !== 'live' || assets === undefined || shell === null) return null;
  const built = checkedShell(shell, assets.shell);
  const core = built.code;
  const code = pageCode(inputs, pageId);
  const scripts = code.flatMap(withScript);
  const sections = scripts.map(
    ({ section, hash }): BundleSection => ({
      name: section.name,
      kind: section.kind,
      script: hexOf(hash),
      uses: section.meta?.uses ?? shell.parts,
    }),
  );
  const modules = new Map(scripts.map(({ hash }): [string, string] => [hexOf(hash), moduleText(hash, assets.modules)]));
  const kit = kitOf(built.kit, content, [...modules.values()]);
  const source = { core, parts: pageParts(shell.parts, code), sections, modules };
  const bundle = await bundlePage(kit === undefined ? source : { ...source, kit });
  bundle.notices.forEach((notice) => page.notice?.(pageId, notice));
  return kit?.plan.reveal === true ? { ...bundle, tag: `${MOTION_HEAD}${bundle.tag}` } : bundle;
}

// Поведения и анимации страницы (блок 6, часть 6б; Р6б-2, Р6б-5): что нужно — по HTML секций страницы и текстам их
// скриптов. Флаг data-merfy-motion и запасной CSS — только у страницы с data-animate: часть behaviors снимает флаг по
// merfy:page:ready, а через 3 с CSS показывает всё, если ядро не запустилось.
type PageHtml = Pick<PageContent, 'header' | 'sections' | 'footer'>;
const NO_HTML: PageHtml = { sections: [] };
const MOTION_HEAD = `<script>${MOTION_HEAD_SCRIPT}</script><style id="merfy-motion">${MOTION_CSS}</style>`;

function kitOf(kit: ShellKit | undefined, content: PageHtml, scripts: readonly string[]): BundleKit | undefined {
  if (kit === undefined) return undefined;
  const html = [...(content.header ?? []), ...content.sections, ...(content.footer ?? [])];
  return { files: kit.files, plan: kitPlanOf(kit.behaviors, html, scripts) };
}
