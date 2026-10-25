import { describe, expect, it } from 'vitest';
import {
  HIDE_AFTER_MS,
  NOTICES_MAX,
  closedNotices,
  roleOf,
  shownNotices,
  type Notice,
} from '../sections/notices/notices';

// Список секции «Уведомления» (блок 9 «Секций и SDK», п. 10; часть 9б): чистые функции. Таймеры, наведение, фокус и
// разметку проверяет тест Chromium (browser/notices.browser.test.ts).
const error = (message: string): Notice => ({ level: 'error', message });
const warning = (message: string): Notice => ({ level: 'warning', message });

describe('список уведомлений', () => {
  it('пределы — три сразу, 8 с', () => {
    expect([NOTICES_MAX, HIDE_AFTER_MS]).toEqual([3, 8000]);
  });

  it('новое — в конец', () => {
    expect(shownNotices([error('а')], warning('б'))).toEqual([error('а'), warning('б')]);
  });

  it('четвёртое — самое старое уходит', () => {
    const list = [error('а'), error('б'), error('в')];
    expect(shownNotices(list, error('г'))).toEqual([error('б'), error('в'), error('г')]);
  });

  it('одинаковый текст — одно уведомление на своём месте, уровень — нового', () => {
    const list = [error('а'), error('б')];
    expect(shownNotices(list, warning('а'))).toEqual([warning('а'), error('б')]);
  });

  it('закрыть — убирает по тексту; чужой текст — список тот же', () => {
    const list = [error('а'), warning('б')];
    expect(closedNotices(list, 'а')).toEqual([warning('б')]);
    expect(closedNotices(list, 'в')).toEqual(list);
  });

  it('роль: error — alert, warning — status', () => {
    expect([roleOf('error'), roleOf('warning')]).toEqual(['alert', 'status']);
  });
});
