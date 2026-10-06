import type { ScriptEntry, ScriptKind } from '../types';

export type ScriptFact = { src: string; type: string; id: string; bytes: number };

// Функции read* уходят в браузер текстом через page.evaluate: всё, что им нужно, — внутри них самих.
// Внутри них нет именованных функций (`const f = () => …`): команды запускает tsx, он оборачивает такие функции
// в __name(…), а в браузере __name нет. Это сторожит тест collect-tsx.test.ts.

export function readScripts(): ScriptFact[] {
  return Array.from(document.scripts, (script) => {
    const timing = performance.getEntriesByName(script.src).find((entry) => entry instanceof PerformanceResourceTiming);
    const loadedBytes = timing instanceof PerformanceResourceTiming ? timing.decodedBodySize : 0;
    const bytes = script.src === '' ? new Blob([script.text]).size : loadedBytes;
    return { src: script.src, type: script.type, id: script.id, bytes };
  });
}

export function readGlobals(): Record<string, string> {
  const names = Object.getOwnPropertyNames(window).filter((name) => /^__MERFY_\w+__$/.test(name));
  return Object.fromEntries(names.map((name) => [name, JSON.stringify(Reflect.get(window, name)) ?? 'null']));
}

export function readStorage(): string[] {
  const local = Object.keys(localStorage).map((key) => `local:${key}`);
  const session = Object.keys(sessionStorage).map((key) => `session:${key}`);
  return [...local, ...session];
}

export function readTokens(names: readonly string[]): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const pairs = names.map((name): [string, string] => [name, style.getPropertyValue(name).trim()]);
  return Object.fromEntries(pairs.filter(([, value]) => value !== ''));
}

export async function readFonts(): Promise<string[]> {
  await document.fonts.ready;
  const loaded = Array.from(document.fonts).filter((font) => font.status === 'loaded');
  return loaded.map((font) => `${font.family.replaceAll('"', '')} ${font.weight} ${font.style}`);
}

export function readSections(): string[] {
  return Array.from(document.querySelectorAll('[data-stand]'), (element) => element.getAttribute('data-stand') ?? '');
}

// Дальше — чистые функции в Node: сырые факты страницы → записи паспорта.

const SCRIPT_KIND = new Map<string, ScriptKind>([
  ['module', 'module'],
  ['application/json', 'json'],
  ['application/ld+json', 'json'],
  ['importmap', 'json'],
]);

// Свой адрес — путь (порт preview от прогона к прогону может меняться), чужой — целиком.
export function relativeToOrigin(url: string, origin: string): string {
  const parsed = new URL(url);
  return parsed.origin === origin ? `${parsed.pathname}${parsed.search}` : parsed.href;
}

function scriptKey(fact: ScriptFact, origin: string, inlineNumber: number): string {
  if (fact.src !== '') return relativeToOrigin(fact.src, origin);
  if (fact.id !== '') return `#${fact.id}`;
  return `inline:${inlineNumber}`;
}

// Ключ скрипта: адрес; у встроенного — #id; без id — inline:N по порядку на странице.
export function scriptEntries(facts: readonly ScriptFact[], origin: string): ScriptEntry[] {
  const keyless = facts.filter((fact) => fact.src === '' && fact.id === '');
  return facts.map((fact) => ({
    src: scriptKey(fact, origin, keyless.indexOf(fact) + 1),
    kind: SCRIPT_KIND.get(fact.type) ?? (fact.src === '' ? 'inline' : 'external'),
    bytes: fact.bytes,
  }));
}
