import { escapeScriptJson } from '@merfy/storefront-config';
import { sha256 } from './canonical';
import type { BuildFile } from './client-files';
import { StorefrontBuildError } from './errors';
import type { BuildInputs, CodeSection, ShellInput } from './inputs';
import type { PageMode, PlacedSection } from './sections-render';

// Код секций в странице и в сборке магазина (design.md блока 7, п. 12, 16, 19; С7-7 Г, С7-10 Б). Разметка секции — в
// HTML страницы, в <merfy-section data-section="<имя>">. В <head> после токенов темы: стили секций страницы одним
// тегом, список модулей страницы (#merfy-modules), import map с единственным именем @merfy/shell, modulepreload ядра и
// модулей, само ядро. Файлы: ядро — в _merfy/shell/<16 знаков отпечатка>/, скрипт секции — _merfy/m/<sha256>.js: тот же
// код — тот же файл и адрес во всех магазинах. Нет скриптов на странице — нет и ядра (п. 16).
export const SHELL_ENTRY = 'shell.js';
const SHELL_DIR = '_merfy/shell';
const MODULES_DIR = '_merfy/m';
const SHELL_DIR_HASH_LENGTH = 16;
const HASH_PREFIX = 'sha256:';
const MODULES_VERSION = 1;
const SHELL_IMPORT = '@merfy/shell';
// Секция — блочный элемент; скрытый элемент глобального скрипта не виден, даже если тема задала свой display.
const BASE_CSS = 'merfy-section{display:block}merfy-section[hidden]{display:none}';

// Сборка ядра @merfy/shell для сборки магазина: версия, отпечаток файлов, подсказки и сами файлы (shell.ts).
export interface ShellBuild {
  version: string;
  hash: string;
  preload: string[];
  files: BuildFile[];
}

// Байты кода, которых нет во входах: сборка ядра, скрипты секций и модули рендера по отпечатку. Входы называют их
// отпечатками, сборка сверяет байты с ними.
export interface CodeAssets {
  shell: ShellBuild | null;
  modules: ReadonlyMap<string, Uint8Array>;
  // Модули рендера (блок 1 «Секций и SDK»): текст скомпилированного шаблона по sha256 его байтов.
  renders: ReadonlyMap<string, string>;
}

export const NO_ASSETS: CodeAssets = { shell: null, modules: new Map(), renders: new Map() };

interface ModuleLine {
  kind: CodeSection['kind'];
  name: string;
  src: string;
}

const hexOf = (hash: string): string => hash.slice(HASH_PREFIX.length);

export const shellDir = (hash: string): string => `${SHELL_DIR}/${hexOf(hash).slice(0, SHELL_DIR_HASH_LENGTH)}`;
export const modulePath = (hash: string): string => `${MODULES_DIR}/${hexOf(hash)}.js`;
const shellSrc = (shell: ShellInput, file: string): string => `/${shellDir(shell.hash)}/${file}`;

// Секции страницы: места мерчанта по порядку, потом глобальные скрипты; имя — один раз, хоть секция и стоит дважды.
function pageCode(inputs: BuildInputs, pageId: string): CodeSection[] {
  const byName = new Map(inputs.code.sections.map((section): [string, CodeSection] => [section.name, section]));
  const placed = (inputs.code.pages[pageId] ?? []).map((instance) => instance.section);
  const names = new Set([...placed, ...inputs.code.globals]);
  return [...names].flatMap((name) => byName.get(name) ?? []);
}

const moduleLines = (sections: readonly CodeSection[]): ModuleLine[] =>
  sections.flatMap(({ kind, name, script }) =>
    script === null ? [] : [{ kind, name, src: `/${modulePath(script)}` }],
  );

// CSS секций страницы — классы Tailwind из их разметки (section-css.ts). </style внутри CSS закрыл бы тег раньше
// времени: сборка страхует.
function styleTag(css: string): string {
  return `<style id="merfy-sections">${(BASE_CSS + css).replaceAll('</style', '<\\/style')}</style>`;
}

const jsonTag = (attributes: string, value: unknown): string =>
  `<script ${attributes}>${escapeScriptJson(JSON.stringify(value))}</script>`;

const preloadLink = (href: string): string => `<link rel="modulepreload" href="${href}">`;

function scriptTags(shell: ShellInput, modules: readonly ModuleLine[]): string[] {
  return [
    jsonTag('type="application/json" id="merfy-modules"', { v: MODULES_VERSION, modules }),
    jsonTag('type="importmap"', { imports: { [SHELL_IMPORT]: shellSrc(shell, SHELL_ENTRY) } }),
    ...shell.preload.map((file) => preloadLink(shellSrc(shell, file))),
    ...modules.map((line) => preloadLink(line.src)),
    `<script type="module" src="${shellSrc(shell, SHELL_ENTRY)}"></script>`,
  ];
}

// Код страницы для <head>, после токенов темы. Секций нет — пусто; скриптов нет или превью — только стили (Р1: в превью
// списка модулей, карты импортов и ядра нет, скрипты секций в превью — блок 5).
export function codeHead(inputs: BuildInputs, pageId: string, css: string, mode: PageMode): string {
  const sections = pageCode(inputs, pageId);
  const modules = moduleLines(sections);
  if (sections.length === 0) return '';
  if (mode === 'preview' || inputs.shell === null || modules.length === 0) return styleTag(css);
  return [styleTag(css), ...scriptTags(inputs.shell, modules)].join('');
}

// Экземпляры секций страницы в порядке мерчанта — для рендера (sections-render.ts). Глобальным скриптам место не
// нужно: скрытый элемент им ставит ядро.
export function placedSections(inputs: BuildInputs, pageId: string): PlacedSection[] {
  const renders = new Map(inputs.code.sections.map((section): [string, string] => [section.name, section.render ?? '']));
  return (inputs.code.pages[pageId] ?? []).map((instance) => ({
    id: instance.id,
    name: instance.section,
    hash: renders.get(instance.section) ?? '',
    settings: instance.settings,
  }));
}

function shellFiles(shell: ShellInput | null, build: ShellBuild | null): BuildFile[] {
  if (shell === null) return [];
  if (build === null)
    throw new StorefrontBuildError('shell-missing', 'во входах есть ядро, а его сборки нет', { path: 'shell' });
  if (build.hash !== shell.hash)
    throw new StorefrontBuildError('shell-mismatch', `сборка ядра ${build.hash} — не та, что во входах`, {
      path: 'shell.hash',
    });
  return build.files.map((file) => ({ path: `${shellDir(shell.hash)}/${file.path}`, content: file.content }));
}

function moduleFile(hash: string, modules: ReadonlyMap<string, Uint8Array>): BuildFile {
  const content = modules.get(hash);
  if (content === undefined || sha256(content) !== hash)
    throw new StorefrontBuildError('code-missing', 'нет файла скрипта секции с этим отпечатком', { path: hash });
  return { path: modulePath(hash), content };
}

// Файлы кода сборки: ядро, если оно во входах, и по файлу на отпечаток скрипта. Нет файла или байты не те — ошибка до
// рендера: живой сайт не трогаем.
export function codeFiles(inputs: BuildInputs, assets: CodeAssets): BuildFile[] {
  const scripts = new Set(inputs.code.sections.flatMap((section) => section.script ?? []));
  return [...shellFiles(inputs.shell, assets.shell), ...[...scripts].map((hash) => moduleFile(hash, assets.modules))];
}
