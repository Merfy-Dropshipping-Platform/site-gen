import { describe, expect, it } from 'vitest';
import { SKIPPED_RESOURCES, refuseAll, skipMedia, skipPatterns, type FetchSession } from '../src/design/design-media';

// Пропуск картинок, видео и шрифтов во всём браузере задания: перехват Fetch на уровне браузера и отказ каждому
// перехваченному запросу. Настоящий браузер — в design-browser.test.ts.

type Handler = (event: { requestId: string }) => void;

function fakeSession(failing = false): FetchSession & {
  sent: Array<[string, unknown]>;
  fire: (event: string, payload: { requestId: string }) => void;
} {
  const sent: Array<[string, unknown]> = [];
  const handlers = new Map<string, Handler>();
  return {
    sent,
    fire: (event, payload) => handlers.get(event)?.(payload),
    on: (event, handler) => handlers.set(event, handler),
    send: (method, params) => {
      sent.push([method, params]);
      return failing && method === 'Fetch.failRequest' ? Promise.reject(new Error('вкладки нет')) : Promise.resolve({});
    },
  };
}

describe('пропуск медиа в браузере задания', () => {
  it('перехват только видео и шрифтов — картинки и остальное идут мимо', () => {
    expect(SKIPPED_RESOURCES).toEqual(['Media', 'Font']);
    expect(skipPatterns()).toEqual([
      { urlPattern: '*', resourceType: 'Media' },
      { urlPattern: '*', resourceType: 'Font' },
    ]);
  });

  it('перехваченный запрос — отказ «заблокировано клиентом»; ошибка отказа не роняет процесс', async () => {
    const session = fakeSession(true);
    refuseAll(session);
    session.fire('Fetch.requestPaused', { requestId: 'r1' });
    await Promise.resolve();
    expect(session.sent).toEqual([['Fetch.failRequest', { requestId: 'r1', errorReason: 'BlockedByClient' }]]);
  });

  it('браузерная сессия CDP: перехват включён с образцами', async () => {
    const session = fakeSession();
    await skipMedia({ newBrowserCDPSession: () => Promise.resolve(session) });
    expect(session.sent).toEqual([['Fetch.enable', { patterns: skipPatterns() }]]);
  });
});
