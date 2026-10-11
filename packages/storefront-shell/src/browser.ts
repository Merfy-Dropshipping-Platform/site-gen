import { startShell } from './start';

// Родной загрузчик браузера: адреса модулей — из списка страницы, имя @merfy/shell внутри них разрешает import map.
async function importModule(src: string): Promise<unknown> {
  const module: unknown = await import(/* @vite-ignore */ src);
  return module;
}

// Его зовёт собранное ядро (build/entry.ts) — один раз на страницу.
export function startBrowserShell(): void {
  startShell({ window, importModule });
}
