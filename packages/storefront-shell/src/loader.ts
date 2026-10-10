import { isSectionDefinition, type SectionDefinition } from './define';
import { SECTION_TAG } from './element';
import { ShellError } from './errors';
import type { ModuleEntry } from './modules';
import { NAME_ATTRIBUTE, type SectionRegistry } from './registry';
import type { FailureStage } from './report';

// Модули страницы (design.md блока 7, С7-19 А): все сразу, без ожидания видимости или касания. Не загрузился — одна
// повторная попытка с другим адресом (п. 6): браузер может запомнить неудачный модуль до перезагрузки, поэтому к адресу
// добавляется ?merfy-retry=1. Вторая неудача — секция «не ожила» (С7-16 А), остальные модули грузятся своим ходом.
export type ImportModule = (src: string) => Promise<unknown>;
export const RETRY_PARAM = 'merfy-retry';
// Глобальный скрипт (С7-21 А) — секция без места: ядро ставит ей скрытый элемент в конце <body>.
export const GLOBAL_ATTRIBUTE = 'data-merfy-global';

export interface LoaderDeps {
  registry: SectionRegistry;
  importModule: ImportModule;
  document: Document;
  // Имена, чей модуль уже начали грузить: модуль грузится один раз за жизнь ядра, при переходах роутера тоже.
  started: Set<string>;
  // Адрес и имя модуля — для поиска виновника ошибок после запуска (sources.ts).
  remember: (src: string, name: string) => void;
}

export function retryUrl(src: string, base: string): string {
  const url = new URL(src, base);
  url.searchParams.set(RETRY_PARAM, '1');
  return url.href;
}

export async function importWithRetry(importModule: ImportModule, src: string, base: string): Promise<unknown> {
  try {
    return await importModule(src);
  } catch {
    return importModule(retryUrl(src, base));
  }
}

// Определение секции — export default её модуля; при приёме его наличие проверяет сборка скрипта (задача 7).
export function definitionOf(module: unknown, src: string): SectionDefinition {
  const definition: unknown =
    typeof module === 'object' && module !== null ? Reflect.get(module, 'default') : undefined;
  if (isSectionDefinition(definition)) return definition;
  throw new ShellError('section-invalid', 'нет export default defineSection({ mount })', { path: src });
}

const stageOf = (error: unknown): FailureStage =>
  error instanceof ShellError && error.code === 'section-invalid' ? 'define' : 'load';

function placeGlobal(doc: Document, name: string): void {
  const placed = [...doc.querySelectorAll(`${SECTION_TAG}[${GLOBAL_ATTRIBUTE}]`)];
  if (placed.some((element) => element.getAttribute(NAME_ATTRIBUTE) === name)) return;
  const element = doc.createElement(SECTION_TAG);
  element.setAttribute(NAME_ATTRIBUTE, name);
  element.setAttribute(GLOBAL_ATTRIBUTE, '');
  element.hidden = true;
  doc.body.append(element);
}

async function loadEntry(deps: LoaderDeps, entry: ModuleEntry): Promise<void> {
  if (entry.kind === 'global') placeGlobal(deps.document, entry.name);
  if (deps.started.has(entry.name)) return;
  deps.started.add(entry.name);
  deps.remember(entry.src, entry.name);
  try {
    const module = await importWithRetry(deps.importModule, entry.src, deps.document.baseURI);
    await deps.registry.define(entry.name, definitionOf(module, entry.src), entry.src);
  } catch (error) {
    deps.registry.fail(entry.name, stageOf(error), error, entry.src);
  }
}

// Все модули страницы — сразу и параллельно; сбой одного не задерживает и не роняет остальные.
export async function loadPage(deps: LoaderDeps, entries: readonly ModuleEntry[]): Promise<void> {
  await Promise.all(entries.map((entry) => loadEntry(deps, entry)));
}
