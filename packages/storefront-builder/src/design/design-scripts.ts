import { readFileSync } from 'node:fs';

// Скрипты страницы «Дизайна по ссылке» (`browser/*.js`) строкой для `page.evaluate`: тело скрипта с общими помощниками
// blocks.js (кроме probe — он сам по себе). Код исполняется в Chromium, модулем не подключается.

export type ScriptName = 'own' | 'contour' | 'content' | 'probe';

const read = (file: string): string => readFileSync(new URL(`./browser/${file}.js`, import.meta.url), 'utf8');
const cache = new Map<ScriptName, string>();

export function pageScript(name: ScriptName): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const helpers = name === 'probe' ? '' : read('blocks');
  // Строку Playwright вычисляет как выражение, а не зовёт как функцию: поэтому функция сразу вызывается.
  const script = `(() => {\n${helpers}\n${read(name)}\n})()`;
  cache.set(name, script);
  return script;
}

export const scriptSource = (names: string[]): string => names.map(read).join('');
