import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { navigationType, watchPage } from '../src/core/page-events';
import { start, type StartedCore } from '../src/core/start';
import { configTag } from './core-support';

// События страницы (блок 13 «Секций и SDK», 13.1; 13в А): ядро отправляет их на document. Просмотр — один раз на
// загрузку; «Назад» из кеша браузера — restore без нового просмотра. Слушатели каждого теста снимает его сигнал.
const PAGE_EVENTS = [
  'merfy:page:ready',
  'merfy:page:view',
  'merfy:page:hidden',
  'merfy:page:visible',
  'merfy:page:restore',
  'merfy:page:leave',
];

let visibility: DocumentVisibilityState = 'visible';
let listeners = new AbortController();
let core: StartedCore | undefined;

beforeEach(() => {
  listeners = new AbortController();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  listeners.abort();
  core?.stop();
  core = undefined;
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(performance, 'getEntriesByType');
  document.head.replaceChildren();
  document.body.replaceChildren();
});

// pageshow и pagehide с persisted — обычное событие с полем: так тест не зависит от PageTransitionEvent в jsdom.
const transition = (type: string, persisted: boolean): Event => Object.assign(new Event(type), { persisted });

function watched(navigation = 'navigate'): string[] {
  const names: string[] = [];
  watchPage(window, { emit: (name) => void names.push(name) }, listeners.signal, navigation);
  return names;
}

// События ядра на document по порядку.
function recorded(): string[] {
  const names: string[] = [];
  PAGE_EVENTS.forEach((name) => document.addEventListener(name, () => names.push(name), { signal: listeners.signal }));
  return names;
}

describe('события страницы', () => {
  it('вкладку спрятали и вернули — hidden и visible; ушли со страницы — leave', () => {
    const names = watched();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(transition('pagehide', true));
    expect(names).toEqual(['merfy:page:hidden', 'merfy:page:visible', 'merfy:page:leave']);
  });

  it('«Назад» из кеша браузера (pageshow с persisted) — restore; обычный pageshow — ничего', () => {
    const names = watched();
    window.dispatchEvent(transition('pageshow', false));
    window.dispatchEvent(transition('pageshow', true));
    expect(names).toEqual(['merfy:page:restore']);
  });

  it('«Назад» без кеша (тип перехода back_forward) — restore один раз сразу; перезагрузка — ничего', () => {
    expect(watched('back_forward')).toEqual(['merfy:page:restore']);
    expect(watched('reload')).toEqual([]);
  });

  it('сигнал снят — событий больше нет', () => {
    const names = watched();
    listeners.abort();
    window.dispatchEvent(transition('pageshow', true));
    window.dispatchEvent(transition('pagehide', false));
    expect(names).toEqual([]);
  });

  it('тип перехода — из записи navigation; записи или API нет — navigate', () => {
    Object.defineProperty(performance, 'getEntriesByType', {
      configurable: true,
      value: () => [{ type: 'back_forward' }],
    });
    expect(navigationType(window)).toBe('back_forward');
    Object.defineProperty(performance, 'getEntriesByType', { configurable: true, value: () => [] });
    expect(navigationType(window)).toBe('navigate');
    Object.defineProperty(performance, 'getEntriesByType', { configurable: true, value: undefined });
    expect(navigationType(window)).toBe('navigate');
  });

  it('ядро: ready и view при запуске, «Назад» из кеша — restore без второго просмотра; после снятия — тишина', () => {
    document.head.innerHTML = configTag('live');
    const names = recorded();
    core = start({ parts: [], sections: [] }, { window });
    window.dispatchEvent(transition('pageshow', true));
    core.stop();
    core = undefined;
    window.dispatchEvent(transition('pageshow', true));
    expect(names).toEqual(['merfy:page:ready', 'merfy:page:view', 'merfy:page:restore']);
  });
});
