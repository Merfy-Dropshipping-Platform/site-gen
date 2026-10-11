import { vi } from 'vitest';
import { SECTION_ERROR_EVENT } from '../src/report';

// Записи merfy:section-error, которые увидел window, и заглушённая консоль: тесты сбоев не засоряют вывод.
export function watchFailures() {
  const failures: unknown[] = [];
  const listener = (event: Event): void => {
    if (event instanceof CustomEvent) failures.push(event.detail);
  };
  window.addEventListener(SECTION_ERROR_EVENT, listener);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const stop = (): void => {
    window.removeEventListener(SECTION_ERROR_EVENT, listener);
    consoleError.mockRestore();
  };
  return { failures, consoleError, stop };
}

// Элемент секции в <body>: <merfy-section data-section="<имя>">.
export function sectionElement(name: string, html = ''): HTMLElement {
  const element = document.createElement('merfy-section');
  element.setAttribute('data-section', name);
  element.innerHTML = html;
  document.body.append(element);
  return element;
}
