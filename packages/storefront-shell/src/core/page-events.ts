import type { EventBus } from './events';

// События страницы (design.md блока 13 «Секций и SDK», 13.1; 13в А): ядро отправляет их на document после
// merfy:page:view. hidden и visible — по visibilitychange, leave — по pagehide, restore — по pageshow из кеша браузера
// («Назад», persisted) и один раз сразу, если страницу открыли «Назад» без кеша (тип перехода back_forward). Просмотр
// на «Назад» из кеша не повторяется: страница та же. Снятие — сигнал ядра.
const BACK_FORWARD = 'back_forward';
const NAVIGATE = 'navigate';

// Тип перехода текущей страницы (Navigation Timing); нет API или записи — navigate.
export function navigationType(win: Window): string {
  const read: unknown = Reflect.get(win.performance, 'getEntriesByType');
  const entries: unknown = typeof read === 'function' ? win.performance.getEntriesByType('navigation') : [];
  const first: unknown = Array.isArray(entries) ? entries[0] : undefined;
  const type: unknown = typeof first === 'object' && first !== null ? Reflect.get(first, 'type') : undefined;
  return typeof type === 'string' ? type : NAVIGATE;
}

export function watchPage(win: Window, bus: Pick<EventBus, 'emit'>, signal: AbortSignal, navigation: string): void {
  const doc = win.document;
  const visibility = (): void =>
    bus.emit(doc.visibilityState === 'hidden' ? 'merfy:page:hidden' : 'merfy:page:visible', {});
  doc.addEventListener('visibilitychange', visibility, { signal });
  win.addEventListener('pagehide', () => bus.emit('merfy:page:leave', {}), { signal });
  win.addEventListener('pageshow', (event) => void (event.persisted ? bus.emit('merfy:page:restore', {}) : undefined), {
    signal,
  });
  if (navigation === BACK_FORWARD) bus.emit('merfy:page:restore', {});
}
