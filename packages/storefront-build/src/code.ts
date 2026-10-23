import { bundlePage, type BundleSection, type PageBundle } from './bundle';
import { sha256 } from './canonical';
import { StorefrontBuildError } from './errors';
import type { BuildInputs, CodeSection, ShellInput } from './inputs';
import type { PageRender, PlacedSection } from './sections-render';
import type { ShellBuild } from './shell';

// Код секций в странице и в сборке магазина (design.md блока 7, п. 12, 16, 19; блок 5 «Секций и SDK», раздел 3.10).
// Разметка секции — в HTML страницы, в <merfy-section data-section="<имя>">. В <head> после токенов темы: стили секций
// страницы одним тегом, потом бандл страницы — один <script type="module"> (bundle.ts). Бандл — только у страниц
// опубликованного сайта: ядро секций, его части из core.json и часть аналитики, модули секций страницы со скриптом и
// глобальные скрипты. Превью (часть 5г), стенд и рендер без кода — без бандла.
const HASH_PREFIX = 'sha256:';
// Части без API для секций — в бандле каждой страницы опубликованного сайта (раздел 3.13): аналитика, как трекер в
// HTML каждой страницы на проде.
export const LIVE_PARTS: readonly string[] = ['analytics'];

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
  const placed = (inputs.code.pages[pageId] ?? []).map((instance) => instance.section);
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
      ...placeFlags(inputs, instance.section),
      ...(script === null ? {} : { script: true }),
    };
  });
}

function placeFlags(inputs: BuildInputs, name: string): Pick<PlacedSection, 'removable' | 'uses'> {
  const section = inputs.code.sections.find((candidate) => candidate.name === name);
  return {
    ...(section?.removable === undefined ? {} : { removable: section.removable }),
    ...(section?.uses === undefined ? {} : { uses: section.uses }),
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

// Бандл страницы опубликованного сайта (раздел 3.10). Превью, рендер без кода (page.code нет) и входы без ядра — без
// бандла. Каждой секции — все части ядра из core.json (до части 5в, где их выберет uses). Предупреждения — page.notice.
export async function pageBundle(inputs: BuildInputs, pageId: string, page: PageRender): Promise<PageBundle | null> {
  const shell = inputs.shell;
  const assets = page.code;
  if (page.mode !== 'live' || assets === undefined || shell === null) return null;
  const core = checkedShell(shell, assets.shell).code;
  const scripts = pageCode(inputs, pageId).flatMap(withScript);
  const sections = scripts.map(
    ({ section, hash }): BundleSection => ({
      name: section.name,
      kind: section.kind,
      script: hexOf(hash),
      uses: shell.parts,
    }),
  );
  const modules = new Map(scripts.map(({ hash }): [string, string] => [hexOf(hash), moduleText(hash, assets.modules)]));
  const bundle = await bundlePage({ core, parts: [...shell.parts, ...LIVE_PARTS], sections, modules });
  bundle.notices.forEach((notice) => page.notice?.(pageId, notice));
  return bundle;
}
