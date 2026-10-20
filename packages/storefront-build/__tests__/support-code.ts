import { hashOf, sha256 } from '../src/canonical';
import { modulePath, type CodeAssets, type ShellBuild } from '../src/code';
import type { BuildInputs, CodeInput, CodeSection } from '../src/inputs';
import { changedInputs } from './support';

// Код секций для тестов (блок 7; SDK 1 — блок 1 «Секций и SDK»): сборка ядра из двух файлов, три скрипта, модули
// рендера и четыре секции разных авторов — две своих секции магазина (наши, п. 1), расширения и глобальный скрипт
// расширения.
const bytes = (text: string): Uint8Array => Buffer.from(text, 'utf8');

const SHELL_FILES = [
  { path: 'part-AB12CD34.js', content: bytes('export const cart = { lines: [] };') },
  {
    path: 'shell.js',
    content: bytes('import "./part-AB12CD34.js"; export const defineSection = (definition) => definition;'),
  },
];

export const SHELL_BUILD: ShellBuild = {
  version: '0.1.0',
  hash: hashOf(Object.fromEntries(SHELL_FILES.map((file): [string, string] => [file.path, sha256(file.content)]))),
  preload: ['shell.js', 'part-AB12CD34.js'],
  files: SHELL_FILES,
};

// Ядро во входах — без файлов: версия, отпечаток и подсказки.
export const SHELL = { version: SHELL_BUILD.version, hash: SHELL_BUILD.hash, preload: SHELL_BUILD.preload };

const SCRIPTS = {
  badge: bytes('export default { mount() {} }; // значок корзины'),
  reviews: bytes('export default { mount() {}, unmount() {} }; // отзывы'),
  geo: bytes('export default { mount() {} }; // город'),
};

export const MODULES: ReadonlyMap<string, Uint8Array> = new Map(
  Object.values(SCRIPTS).map((content): [string, Uint8Array] => [sha256(content), content]),
);

// Адрес модуля на странице — от корня сайта.
export const SRC = {
  badge: `/${modulePath(sha256(SCRIPTS.badge))}`,
  reviews: `/${modulePath(sha256(SCRIPTS.reviews))}`,
  geo: `/${modulePath(sha256(SCRIPTS.geo))}`,
};

// Модули рендера — текст по отпечатку; в тестах страницы их рисует подставная функция рендера.
const RENDER_MODULES = {
  hero: 'export default "hero"; // первый экран',
  badge: 'export default "badge"; // значок корзины',
  reviews: 'export default "reviews"; // отзывы',
};

export const RENDERS: ReadonlyMap<string, string> = new Map(
  Object.values(RENDER_MODULES).map((module): [string, string] => [sha256(bytes(module)), module]),
);

function section(name: string, kind: CodeSection['kind'], render: string | null, script: Uint8Array | null): CodeSection {
  const renderHash = render === null ? null : sha256(bytes(render));
  const scriptHash = script === null ? null : sha256(script);
  return { name, kind, hash: hashOf({ name, render: renderHash, script: scriptHash }), render: renderHash, script: scriptHash };
}

export const GEO = section('geo:locate', 'global', null, SCRIPTS.geo);
export const HERO = section('shop:hero', 'section', RENDER_MODULES.hero, null);
export const BADGE = section('shop:cart-badge', 'section', RENDER_MODULES.badge, SCRIPTS.badge);
export const REVIEWS = section('reviews:list', 'section', RENDER_MODULES.reviews, SCRIPTS.reviews);

// Код магазина: секции — по имени, как их отдаёт реестр; на главной отзывы стоят дважды.
export const CODE: CodeInput = {
  sections: [GEO, HERO, BADGE, REVIEWS],
  pages: {
    home: [
      { id: 'cart-badge-1', section: 'shop:cart-badge', settings: {} },
      { id: 'hero-1', section: 'shop:hero', settings: { heading: 'Шарфы к первым холодам' } },
      { id: 'list-1', section: 'reviews:list', settings: {} },
      { id: 'list-2', section: 'reviews:list', settings: {} },
    ],
  },
  globals: ['geo:locate'],
};

// Секция без скрипта: ядро не нужно, shell остаётся null.
export const NO_SCRIPT: CodeInput = {
  sections: [HERO],
  pages: { home: [{ id: 'hero-1', section: 'shop:hero', settings: {} }] },
  globals: [],
};

export const ASSETS: CodeAssets = { shell: SHELL_BUILD, modules: MODULES, renders: RENDERS };

// Входы стенда с ядром и кодом; change — правка поверх.
export function codeInputs(change: (inputs: BuildInputs) => void = () => undefined): BuildInputs {
  return changedInputs((inputs) => {
    inputs.shell = structuredClone(SHELL);
    inputs.code = structuredClone(CODE);
    change(inputs);
  });
}
