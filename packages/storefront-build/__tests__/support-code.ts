import { hashOf, sha256 } from '../src/canonical';
import { modulePath, type CodeAssets, type ShellBuild } from '../src/code';
import type { BuildInputs, CodeInput, CodeSection } from '../src/inputs';
import { changedInputs } from './support';

// Код секций для тестов (блок 7): сборка ядра из двух файлов, три скрипта и четыре секции разных авторов — платформы,
// темы, расширения и глобальный скрипт расширения.
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

function section(
  name: string,
  kind: CodeSection['kind'],
  html: string,
  css: string,
  script: Uint8Array | null,
): CodeSection {
  return { name, kind, hash: hashOf({ name, html, css }), html, css, script: script === null ? null : sha256(script) };
}

export const GEO = section('geo:locate', 'global', '', '', SCRIPTS.geo);
export const SCARF = section(
  'nova:scarf-colors',
  'section',
  '<button data-color="чёрный">Чёрный</button>',
  '.colors{gap:8px}',
  null,
);
export const BADGE = section(
  'platform:cart-badge',
  'section',
  '<a class="badge" href="/cart">Корзина <span data-count>0</span></a>',
  '.badge{color:#1f6feb}',
  SCRIPTS.badge,
);
export const REVIEWS = section(
  'reviews:list',
  'section',
  '<button data-buy="scarf-1">Купить такой же</button>',
  '',
  SCRIPTS.reviews,
);

// Код магазина: секции — по имени, как их отдаёт реестр; на главной отзывы стоят дважды.
export const CODE: CodeInput = {
  sections: [GEO, SCARF, BADGE, REVIEWS],
  pages: { home: ['platform:cart-badge', 'nova:scarf-colors', 'reviews:list', 'reviews:list'] },
  globals: ['geo:locate'],
};

// Секция без скрипта: ядро не нужно, shell остаётся null.
export const STYLE_ONLY: CodeInput = { sections: [SCARF], pages: { home: ['nova:scarf-colors'] }, globals: [] };

export const ASSETS: CodeAssets = { shell: SHELL_BUILD, modules: MODULES };

// Входы стенда с ядром и кодом; change — правка поверх.
export function codeInputs(change: (inputs: BuildInputs) => void = () => undefined): BuildInputs {
  return changedInputs((inputs) => {
    inputs.shell = structuredClone(SHELL);
    inputs.code = structuredClone(CODE);
    change(inputs);
  });
}
