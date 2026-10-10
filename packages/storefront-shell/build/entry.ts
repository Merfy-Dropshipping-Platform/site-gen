import { PART_NAMES, type PartName } from '../src/parts/types';

// Вход сборки ядра по списку (С7-3 Б): часть из списка — статический импорт (она в файле ядра), часть вне списка —
// import() (отдельный файл, качается при первом part()). Части идут в порядке PART_NAMES: от порядка в списке не
// зависят ни вход, ни отпечаток ядра.
const fileOf = (name: PartName): string => `./src/parts/${name}.ts`;

function loaderLine(name: PartName, core: ReadonlySet<PartName>): string {
  if (core.has(name)) return `  ${name}: () => Promise.resolve(${name}Part),`;
  return `  ${name}: () => import('${fileOf(name)}'),`;
}

export function shellEntry(core: readonly PartName[]): string {
  const included = new Set(core);
  const statics = PART_NAMES.filter((name) => included.has(name));
  return [
    ...statics.map((name) => `import * as ${name}Part from '${fileOf(name)}';`),
    "import { registerParts } from './src/parts/registry.ts';",
    "import { startBrowserShell } from './src/browser.ts';",
    "export * from './src/index.ts';",
    'registerParts({',
    ...PART_NAMES.map((name) => loaderLine(name, included)),
    '});',
    'startBrowserShell();',
    '',
  ].join('\n');
}
