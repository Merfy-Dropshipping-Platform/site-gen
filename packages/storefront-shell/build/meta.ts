import { basename } from 'node:path';
import type { Metafile } from 'esbuild';

// Что ядро грузит сразу: его файл и статические зависимости по цепочке — их сборка магазина пишет подсказками
// modulepreload (design.md блока 7, п. 6 и 12). Части вне ядра (import()) сюда не входят.
const staticImports = (metafile: Metafile, path: string): string[] =>
  (metafile.outputs[path]?.imports ?? [])
    .filter((item) => item.kind === 'import-statement' && item.external !== true)
    .map((item) => item.path);

function collect(metafile: Metafile, path: string, seen: Set<string>): void {
  if (seen.has(path)) return;
  seen.add(path);
  staticImports(metafile, path).forEach((next) => collect(metafile, next, seen));
}

export function preloadOf(metafile: Metafile, entryFile: string): string[] {
  const entry = Object.keys(metafile.outputs).find((path) => basename(path) === entryFile);
  if (entry === undefined) return [];
  const seen = new Set<string>();
  collect(metafile, entry, seen);
  return [...seen].map((path) => basename(path));
}
