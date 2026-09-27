/**
 * @jest-environment jsdom
 */
/**
 * Воронка аналитики: «Готов к оплате» (владелец 28.09 — было 0 при оплаченных заказах).
 * Страница оформления всех пяти тем рисует общий CheckoutForm; он шлёт `checkout_start`
 * через трекер витрины один раз, дождавшись его асинхронной загрузки.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHECKOUT_START_ANALYTICS_SOURCE } from '../../../packages/theme-base/runtime/checkout-start-analytics';

type W = Window & { _mfy?: { trackCheckout: () => void }; __merfyCheckoutStartSent?: boolean };
const run = () => new Function(CHECKOUT_START_ANALYTICS_SOURCE)();

describe('checkout_start при открытии оформления', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    delete (window as W)._mfy;
    delete (window as W).__merfyCheckoutStartSent;
  });
  afterEach(() => jest.useRealTimers());

  it('трекер уже загружен — событие уходит один раз', () => {
    const trackCheckout = jest.fn();
    (window as W)._mfy = { trackCheckout };
    run();
    run();
    expect(trackCheckout).toHaveBeenCalledTimes(1);
  });

  it('трекер загрузился позже — дожидаемся и шлём', () => {
    run();
    const trackCheckout = jest.fn();
    jest.advanceTimersByTime(1_500);
    (window as W)._mfy = { trackCheckout };
    jest.advanceTimersByTime(600);
    expect(trackCheckout).toHaveBeenCalledTimes(1);
  });

  it('в превью конструктора (iframe) не шлём', () => {
    const trackCheckout = jest.fn();
    (window as W)._mfy = { trackCheckout };
    const top = Object.getOwnPropertyDescriptor(window, 'top');
    Object.defineProperty(window, 'top', { configurable: true, value: {} });
    try {
      run();
    } finally {
      if (top) Object.defineProperty(window, 'top', top);
    }
    expect(trackCheckout).not.toHaveBeenCalled();
  });

  it('CheckoutForm (оформление всех пяти тем) подключает скрипт', () => {
    const form = readFileSync(resolve(__dirname, '../../../packages/theme-base/blocks/CheckoutForm/CheckoutForm.astro'), 'utf-8');
    expect(form).toContain('set:html={CHECKOUT_START_ANALYTICS_SOURCE}');
    for (const theme of ['rose', 'vanilla', 'bloom', 'satin', 'flux']) {
      const page = readFileSync(resolve(__dirname, '../../../themes', theme, 'src/pages/checkout.astro'), 'utf-8');
      expect(page).toContain('theme-base/blocks/CheckoutForm/CheckoutForm.astro');
    }
  });
});
