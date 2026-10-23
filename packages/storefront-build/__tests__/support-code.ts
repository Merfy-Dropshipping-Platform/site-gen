import { hashOf, sha256 } from '../src/canonical';
import type { CodeAssets } from '../src/code';
import type { BuildInputs, CodeInput, CodeSection } from '../src/inputs';
import type { ShellBuild } from '../src/shell';
import { changedInputs } from './support';

// Код секций для тестов (блок 7; SDK 1 — блок 1 «Секций и SDK»; бандл страницы — блок 5, часть 5б): ядро секций с
// теми же экспортами, что у dist/core.js, три скрипта, модули рендера и четыре секции разных авторов — две своих
// секции магазина (наши, п. 1), расширения и глобальный скрипт расширения. Ядро тяжелее 4096 Б: бандл страницы идёт
// файлом _merfy/b/<sha256>.js, как с настоящим ядром.
const bytes = (text: string): Uint8Array => Buffer.from(text, 'utf8');

const CORE = [
  `export const start = (options) => { globalThis.merfyStarted = [options, '${'x'.repeat(5000)}']; };`,
  'export const defineSection = (definition) => definition;',
  "export const auth = { name: 'auth' };",
  "export const cart = { name: 'cart' };",
  "export const favorites = { name: 'favorites' };",
  "export const analytics = { name: 'analytics' };",
].join('\n');

export const SHELL_BUILD: ShellBuild = {
  version: '0.1.0',
  hash: sha256(CORE),
  parts: ['auth', 'cart', 'favorites'],
  code: CORE,
};

// Ядро во входах — без текста: версия, хеш и части.
export const SHELL = { version: SHELL_BUILD.version, hash: SHELL_BUILD.hash, parts: SHELL_BUILD.parts };

const SCRIPTS = {
  badge: bytes(
    'import{defineSection as e}from"@merfy/shell";export default e({mount(){globalThis.badge="badge-mounted"}});',
  ),
  reviews: bytes('export default {mount(){globalThis.reviews="reviews-mounted"}};'),
  geo: bytes('export default {mount(){globalThis.geo="geo-mounted"}};'),
};

export const MODULES: ReadonlyMap<string, Uint8Array> = new Map(
  Object.values(SCRIPTS).map((content): [string, Uint8Array] => [sha256(content), content]),
);

// Модули рендера — текст по хешу; в тестах страницы их рендерит подставная функция рендера.
const RENDER_MODULES = {
  hero: 'export default "hero"; // первый экран',
  badge: 'export default "badge"; // значок корзины',
  reviews: 'export default "reviews"; // отзывы',
};

export const RENDERS: ReadonlyMap<string, string> = new Map(
  Object.values(RENDER_MODULES).map((module): [string, string] => [sha256(bytes(module)), module]),
);

function section(
  name: string,
  kind: CodeSection['kind'],
  render: string | null,
  script: Uint8Array | null,
): CodeSection {
  const renderHash = render === null ? null : sha256(bytes(render));
  const scriptHash = script === null ? null : sha256(script);
  return {
    name,
    kind,
    hash: hashOf({ name, render: renderHash, script: scriptHash }),
    render: renderHash,
    script: scriptHash,
  };
}

export const GEO = section('geo:locate', 'global', null, SCRIPTS.geo);
export const HERO = section('shop:hero', 'section', RENDER_MODULES.hero, null);
export const BADGE = section('shop:cart-badge', 'section', RENDER_MODULES.badge, SCRIPTS.badge);
export const REVIEWS = section('reviews:list', 'section', RENDER_MODULES.reviews, SCRIPTS.reviews);

// Код магазина: секции — по имени, как их отдаёт таблица секций; на главной отзывы стоят дважды.
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

// Секция без скрипта: в бандле страницы — только ядро и части.
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
