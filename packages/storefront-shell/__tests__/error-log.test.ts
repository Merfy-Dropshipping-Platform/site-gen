import { describe, expect, it } from 'vitest';
import {
  FLUSH_DELAY_MS,
  MAX_MESSAGE_LENGTH,
  MAX_RECORDS,
  listenSectionErrors,
  recordOf,
  type ErrorLogDeps,
} from '../src/error-log';
import { SECTION_FAILURE_EVENT } from '../src/core/events';
import type { SectionFailureDetail } from '../src/core/types';

// Часть 15е (Р15е-3): только событие ядра merfy:section:error на document, хеш — поле script.

const HASH = 'a'.repeat(64);
const SHOP_ID = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const ENDPOINT = 'https://gateway.dev.merfy.ru/api/storefront/section-errors';

const failure = (fields: Partial<SectionFailureDetail> = {}): SectionFailureDetail => ({
  section: 'nova:scarf-colors',
  id: 'scarf-1',
  script: HASH,
  stage: 'mount',
  message: 'сломалась при запуске',
  ...fields,
});

// Документ страницы без jsdom: видимость меняет сам тест.
class Page extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';

  hide(): void {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

// Канал с подставными отправкой и таймером: тест сам решает, когда «прошли» 2 с.
function openChannel() {
  const page = new Page();
  const sent: Array<{ url: string; body: unknown }> = [];
  const timers: Array<{ run: () => void; ms: number }> = [];
  const controller = new AbortController();
  const deps: ErrorLogDeps = {
    document: page,
    send: (url, body) => {
      sent.push({ url, body: JSON.parse(body) });
    },
    later: (run, ms) => {
      timers.push({ run, ms });
    },
    url: ENDPOINT,
    shopId: SHOP_ID,
    signal: controller.signal,
  };
  listenSectionErrors(deps);
  const report = (fields: Partial<SectionFailureDetail> = {}, event = SECTION_FAILURE_EVENT): void => {
    page.dispatchEvent(new CustomEvent(event, { detail: failure(fields) }));
  };
  const runTimers = (): void => timers.splice(0).forEach((timer) => timer.run());
  return { sent, timers, page, report, runTimers, stop: () => controller.abort() };
}

describe('запись об ошибке секции', () => {
  it('хеш — из поля script; id экземпляра в запись не идёт', () => {
    expect(recordOf(failure())).toEqual({
      section: 'nova:scarf-colors',
      script: HASH,
      stage: 'mount',
      message: 'сломалась при запуске',
    });
  });

  it.each([
    ['хеш из адреса старого каркаса', { section: 'nova:a', src: `/_merfy/m/${HASH}.js`, stage: 'mount', message: 'x' }],
    ['стадия старого каркаса load', { ...failure(), stage: 'load' }],
    ['стадия старого каркаса define', { ...failure(), stage: 'define' }],
    ['чужая стадия', { ...failure(), stage: 'boot' }],
    ['не объект', null],
  ])('%s — записи нет', (_case, detail) => {
    expect(recordOf(detail)).toBeNull();
  });

  it('текст — не длиннее 300 знаков', () => {
    const record = recordOf(failure({ message: 'я'.repeat(500) }));
    expect(record?.message).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});

describe('канал ошибок', () => {
  it('две ошибки — одна пачка через 2 с: адрес шлюза, v, shopId и записи', () => {
    const channel = openChannel();
    channel.report();
    channel.report({ section: 'reviews:list', stage: 'runtime', message: 'x is not a function' });
    expect(channel.sent).toEqual([]);
    expect(channel.timers.map((timer) => timer.ms)).toEqual([FLUSH_DELAY_MS]);
    channel.runTimers();
    expect(channel.sent).toEqual([
      {
        url: ENDPOINT,
        body: {
          v: 1,
          shopId: SHOP_ID,
          errors: [
            { section: 'nova:scarf-colors', script: HASH, stage: 'mount', message: 'сломалась при запуске' },
            { section: 'reviews:list', script: HASH, stage: 'runtime', message: 'x is not a function' },
          ],
        },
      },
    ]);
  });

  it('событие старого каркаса merfy:section-error — не читается', () => {
    const channel = openChannel();
    channel.report({}, 'merfy:section-error');
    channel.runTimers();
    expect(channel.sent).toEqual([]);
    expect(channel.timers).toEqual([]);
  });

  it('повтор той же ошибки не шлётся', () => {
    const channel = openChannel();
    channel.report();
    channel.runTimers();
    channel.report();
    channel.runTimers();
    expect(channel.sent).toHaveLength(1);
    expect(channel.timers).toEqual([]);
  });

  it('на страницу — не больше 10 записей', () => {
    const channel = openChannel();
    Array.from({ length: 12 }, (_, index) => channel.report({ message: `ошибка ${index}` }));
    channel.runTimers();
    channel.report({ message: 'ошибка после пачки' });
    channel.runTimers();
    const first = Array.from({ length: MAX_RECORDS }, (_, index) => ({ message: `ошибка ${index}` }));
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]?.body).toMatchObject({ errors: first });
  });

  it('страница ушла в фон — пачка уходит сразу, пустая не уходит', () => {
    const channel = openChannel();
    channel.report();
    channel.page.hide();
    channel.page.hide();
    expect(channel.sent).toHaveLength(1);
    channel.runTimers();
    expect(channel.sent).toHaveLength(1);
  });

  it('ядро остановлено — ошибки не копятся', () => {
    const channel = openChannel();
    channel.stop();
    channel.report();
    channel.page.hide();
    expect(channel.timers).toEqual([]);
    expect(channel.sent).toEqual([]);
  });
});
