import { vi } from 'vitest';
import type {
  CoreHandle,
  Json,
  Mode,
  SdkPart,
  SectionDef,
  SectionEntry,
  SectionFailureDetail,
} from '../src/core/types';

// Общее для тестов ядра секций (блок 5, часть 5а): конфиг страницы, секции в <body>, строка списка бандла, события сбоя.
// Имя события сбоя — строкой: это договор с журналом ошибок и блоком 9, тест его закрепляет.
export const FAILURE_EVENT = 'merfy:section:error';
export const SHOP_ID = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
export const API_URL = 'https://gateway.dev.merfy.ru/api';
export const hash = (char: string): string => char.repeat(64);

// Конфиг витрины v1 (блок 3) в <head>.
export function configTag(mode: Mode): string {
  const config = {
    v: 1,
    mode,
    shop: { id: SHOP_ID, name: 'Шарфы', url: 'https://scarves.example' },
    currency: 'RUB',
    locale: 'ru-RU',
    api: { url: API_URL },
    theme: { id: 'nova', version: '0.0.4' },
    page: { id: 'home', path: '/' },
  };
  return `<script type="application/json" id="merfy-config">${JSON.stringify(config)}</script>`;
}

// Тег входных данных — как его пишет сборка (часть 5б).
export const inputTag = (input: Json): string =>
  `<script type="application/json" data-merfy-input>${JSON.stringify(input)}</script>`;

// <merfy-section data-section data-section-id> в конце <body>.
export function placeSection(name: string, id: string, html = ''): HTMLElement {
  const element = document.createElement('merfy-section');
  element.setAttribute('data-section', name);
  element.setAttribute('data-section-id', id);
  element.innerHTML = html;
  document.body.append(element);
  return element;
}

// Строка списка секций бандла. definition — SectionDef по умолчанию: тогда defineSection прямо в вызове выводит ctx со
// всеми модулями, а не Ctx<object, never> строки списка.
export function entry(
  name: string,
  definition: SectionDef,
  fields: Partial<Pick<SectionEntry, 'kind' | 'script' | 'uses'>> = {},
): SectionEntry {
  return { name, kind: 'section', script: hash('a'), uses: [], definition, ...fields };
}

// События merfy:section:error на document и заглушённая консоль: тесты сбоев не засоряют вывод.
export function watchFailures() {
  const details: SectionFailureDetail[] = [];
  const listener = (event: Event): void => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;
    if (isFailure(detail)) details.push(detail);
  };
  document.addEventListener(FAILURE_EVENT, listener);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const stop = (): void => {
    document.removeEventListener(FAILURE_EVENT, listener);
    consoleError.mockRestore();
  };
  return { details, consoleError, stop };
}

function isFailure(value: unknown): value is SectionFailureDetail {
  return typeof value === 'object' && value !== null && 'section' in value && 'stage' in value;
}

// Часть-шпион: отдаёт тесту CoreHandle — так тест отправляет события ядра (merfy:page:visible и другие).
export function corePart() {
  const box: { core: CoreHandle | null } = { core: null };
  const part: SdkPart<'spy', null> = {
    name: 'spy',
    create: (core) => {
      box.core = core;
      return null;
    },
  };
  return { box, part };
}

// Дождаться микрозадач: снятие экземпляра ядро проверяет микрозадачей позже (раздел 3.6, шаг 5).
export async function tick(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

// Ошибка, которую бросил вызов, — чтобы сверить код ShellError.
export function errorOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}
