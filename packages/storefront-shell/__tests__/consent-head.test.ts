import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY } from '../src/core/analytics/consent';
import { CONSENT_CLASS, CONSENT_CSS, CONSENT_HEAD_SCRIPT, CONSENT_ROLE } from '../src/core/behaviors/consent-head';
import { isSectionRole } from '../src/core/roles';

// Скрипт в <head> (19.11): класс на <html>, если ответа о cookie нет; снимается по merfy:page:ready. В Chromium с
// настоящими стилями и бандлом — browser/consent-head.browser.test.ts; здесь — условия класса в jsdom.
// Скрипт выполняется как в <head>: элементом <script> (jsdom запускает его, как браузер).
const run = (): void => {
  const script = document.createElement('script');
  script.textContent = CONSENT_HEAD_SCRIPT;
  document.head.append(script);
  script.remove();
};
const classes = (): string => document.documentElement.className;

afterEach(() => {
  document.documentElement.className = '';
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('скрипт ответа о cookie в <head>', () => {
  it('ответа нет — класс; по merfy:page:ready класс снят, повторное событие ничего не ломает', () => {
    run();
    expect(classes()).toBe(CONSENT_CLASS);
    document.dispatchEvent(new CustomEvent('merfy:page:ready'));
    expect(classes()).toBe('');
    document.dispatchEvent(new CustomEvent('merfy:page:ready'));
    expect(classes()).toBe('');
  });

  it.each(['2026-11-19T10:00:00.000Z', 'declined:2026-11-19T10:00:00.000Z'])('ответ %s есть — класса нет', (stored) => {
    localStorage.setItem(CONSENT_KEY, stored);
    run();
    expect(classes()).toBe('');
  });

  it('хранилище недоступно — ответа нет, класс есть', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    run();
    expect(classes()).toBe(CONSENT_CLASS);
  });

  it('роль — из списка ролей ядра; стиль берётся от неё и от класса скрипта', () => {
    expect(isSectionRole(CONSENT_ROLE)).toBe(true);
    expect(CONSENT_CSS).toContain(`[data-role="${CONSENT_ROLE}"]`);
    expect(CONSENT_CSS).toContain(`html.${CONSENT_CLASS}`);
  });
});
