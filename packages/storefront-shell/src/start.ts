import type { StorefrontConfig } from '@merfy/storefront-config';
import { readStorefrontConfig } from '@merfy/storefront-config/read';
import { IDLE_HOOKS, useSectionElement, type ElementHooks } from './element';
import { loadPage, type ImportModule, type LoaderDeps } from './loader';
import { readModuleList, type ModuleEntry } from './modules';
import { listenPreview, type PreviewDeps } from './preview';
import { createRegistry, type SectionRegistry } from './registry';
import { messageOf } from './report';
import { sourceIndex, watchErrors, type SourceIndex } from './sources';

// Запуск ядра (design.md блока 7, раздел 1, шаги 6–7; п. 6). Ядро стартует само после разбора страницы, а если в теме
// роутер Astro — ещё и по его astro:page-load: перечитывает список модулей новой страницы. Секции оживают и снимаются
// элементом <merfy-section> (п. 11), поэтому astro:before-swap ядру не нужен.
export const PAGE_LOAD_EVENT = 'astro:page-load';
export const SHELL_ERROR_ATTRIBUTE = 'data-merfy-shell-error';

export interface ShellEnv {
  window: Window;
  importModule: ImportModule;
  // Перезагрузка превью (preview.ts); по умолчанию — location.reload(). Тест в jsdom даёт свою: навигации там нет.
  reload?: () => void;
}

export interface Shell {
  // Конфиг магазина (блок 3); null — тега нет или он битый (п. 5).
  config: StorefrontConfig | null;
  registry: SectionRegistry;
  // Модули страницы загружены, их секции запущены или помечены «не ожила».
  ready: Promise<void>;
  // Снять слушатели ядра (тесты, превью): элемент <merfy-section> остаётся, но больше ничего не запускает.
  stop: () => void;
}

// Нет конфига (п. 5): на витрине — console.error, страница остаётся рабочей — индексируемый HTML уже на месте. В превью
// (страница в рамке конструктора) — ещё и плашка на странице: режим из битого конфига не прочитать, превью узнаём по
// рамке. Части ядра в этом блоке данных покупателя не поднимают (задача 3), поэтому секции оживают и без конфига.
export function reportConfig(win: Pick<Window, 'parent' | 'document'>, error: unknown): void {
  const text = `Конфиг витрины не прочитан: ${messageOf(error)}`;
  console.error(text);
  if (win.parent === win) return;
  const alert = win.document.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.setAttribute(SHELL_ERROR_ATTRIBUTE, '');
  alert.textContent = text;
  win.document.body.prepend(alert);
}

function readConfig(win: Window): StorefrontConfig | null {
  try {
    return readStorefrontConfig(win.document);
  } catch (error) {
    reportConfig(win, error);
    return null;
  }
}

// Битый список модулей сборка не пишет — значит, страницу правили руками. Секции остаются разметкой.
function readModules(doc: Document): ModuleEntry[] {
  try {
    return readModuleList(doc);
  } catch (error) {
    console.error(`Список модулей страницы не прочитан: ${messageOf(error)}`);
    return [];
  }
}

const hooksOf = (registry: SectionRegistry): ElementHooks => ({
  connect: (element) => void registry.connect(element),
  disconnect: (element) => void registry.disconnect(element),
});

// Превью (С7-22 В): замена кода секции по сообщению конструктора — тем же реестром и загрузчиком, что у страницы.
function previewDeps(env: ShellEnv, registry: SectionRegistry, sources: SourceIndex): PreviewDeps {
  const win = env.window;
  const reload = env.reload ?? ((): void => win.location.reload());
  return { registry, importModule: env.importModule, base: win.document.baseURI, remember: sources.add, reload };
}

function stopShell(win: Window, controller: AbortController): void {
  controller.abort();
  useSectionElement(win.customElements, IDLE_HOOKS);
}

export function startShell(env: ShellEnv): Shell {
  const win = env.window;
  const controller = new AbortController();
  const registry = createRegistry(win);
  const sources = sourceIndex(win.document.baseURI);
  const deps: LoaderDeps = {
    registry,
    importModule: env.importModule,
    document: win.document,
    started: new Set<string>(),
    remember: sources.add,
  };
  useSectionElement(win.customElements, hooksOf(registry));
  watchErrors(win, sources, registry, controller.signal);
  const config = readConfig(win);
  if (config?.mode === 'preview') listenPreview(win, previewDeps(env, registry, sources), controller.signal);
  const load = (): Promise<void> => loadPage(deps, readModules(win.document));
  win.document.addEventListener(PAGE_LOAD_EVENT, () => void load(), { signal: controller.signal });
  return { config, registry, ready: load(), stop: () => stopShell(win, controller) };
}
