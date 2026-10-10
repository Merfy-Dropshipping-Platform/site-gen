// Копирует исходники пакета @merfy/forms в theme-base: pnpm forms:sync [путь к корню пакета].
// Источник один — пакет; копию руками не правим, её хеш из VERSION.json проверяет
// packages/theme-base/__tests__/forms-vendor.test.ts.
// Берём src/*.ts, а не dist: jest theme-base гоняет только TS и не читает ESM .js.
// Импорт zod всегда заменяется на zod/v4: он есть и в zod 3.25+, и в 4.x, поэтому копия
// (и её хеш) не зависит от того, какой zod поставила установка.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const DEFAULT_SOURCE = '../merfy-forms';
const TARGET_DIR = 'packages/theme-base/runtime/forms-vendor';
const THEME_BASE_DIR = 'packages/theme-base';
const PACKAGE_NAME = '@merfy-dropshipping-platform/forms';
const VERSION_FILE = 'VERSION.json';
const TS_FILE = /\.ts$/;
const ZOD_IMPORT = /from "zod"/g;
const ZOD_V4_IMPORT = 'from "zod/v4"';
const MIN_ZOD_WITH_V4 = [3, 25];

const packageRoot = resolve(process.argv[2] ?? DEFAULT_SOURCE);
const target = resolve(TARGET_DIR);

// Только файлы верхнего уровня: каталог __tests__ в копию не попадает.
const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

const useZodV4 = (_name, body) => body.replace(ZOD_IMPORT, ZOD_V4_IMPORT);

const keepAsIs = (_name, body) => body;

const copyFiles = (fromDir, toDir, accepts, transform) => {
  mkdirSync(toDir, { recursive: true });
  for (const name of listFiles(fromDir).filter(accepts)) {
    const body = readFileSync(join(fromDir, name), 'utf8');
    writeFileSync(join(toDir, name), transform(name, body));
  }
};

// zod, который увидит theme-base: свой node_modules или тот, что выше по дереву (как резолвит Node).
const findZodVersion = () => {
  const requireFromThemeBase = createRequire(join(resolve(THEME_BASE_DIR), 'package.json'));
  return JSON.parse(readFileSync(requireFromThemeBase.resolve('zod/package.json'), 'utf8')).version;
};

const assertZodHasV4 = () => {
  const version = findZodVersion();
  const [major, minor] = version.split('.').map(Number);
  const [minMajor, minMinor] = MIN_ZOD_WITH_V4;
  const hasV4 = major > minMajor || (major === minMajor && minor >= minMinor);
  if (!hasV4) throw new Error(`zod ${version} в theme-base ниже 3.25: нет zod/v4, копию @merfy/forms не собрать`);
};

const listTargetFiles = (dir, prefix = '') =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listTargetFiles(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );

// Путь по сортировке, для каждого `путь\n` + содержимое — так же считает сторож.
const hashTarget = () => {
  const paths = listTargetFiles(target)
    .filter((path) => path !== VERSION_FILE)
    .sort();
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(`${path}\n`);
    hash.update(readFileSync(join(target, path)));
  }
  return hash.digest('hex');
};

assertZodHasV4();
const { version } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

rmSync(target, { recursive: true, force: true });
copyFiles(join(packageRoot, 'src'), target, (name) => TS_FILE.test(name), useZodV4);
copyFiles(join(packageRoot, 'cases'), join(target, 'cases'), (name) => name.endsWith('.json'), keepAsIs);

const sha256 = hashTarget();
writeFileSync(join(target, VERSION_FILE), `${JSON.stringify({ package: PACKAGE_NAME, version, sha256 }, null, 2)}\n`);
console.log(`forms-vendor синхронизирован: ${version}, sha256:${sha256}`);
