/**
 * @jest-environment jsdom
 *
 * CheckoutPayment — вид чекаута по активной платёжке магазина (спец 3а.1).
 *
 * Источник — GET .../billing/shops/:shopId/payment-config/public → data.activeProvider:
 *   'yookassa'                              → «карта у нас»: форма карты на этой
 *                                              странице, SDK ЮKassa грузится и
 *                                              вызывается (поведение НЕ меняется).
 *   'tochka' | 'robokassa' | 'prodamus'     → «страница платёжки»: полей карты
 *                                              нет, SDK ЮKassa не грузится и не
 *                                              вызывается; способ — только подсказка.
 *   null (явно)                             → «онлайн-оплата не подключена» —
 *                                              поведение КАК РАНЬШЕ (до 3а.1):
 *                                              форма карты видна, ошибка не
 *                                              показывается заранее, SDK молча
 *                                              не грузится (yookassaShopId пуст).
 *   activeProvider отсутствует в ответе (прод ещё не обновлён) → прежнее
 *   правило: yookassaEnabled → 'yookassa', иначе как null-кейс выше.
 *
 * Скрипт извлекается из .astro и исполняется в jsdom (как в checkout-submit-*).
 */
import { join } from 'path';
import { astroInlineRunners } from './helpers/astro-inline-script';

const ASTRO = join(__dirname, '..', 'blocks', 'CheckoutPayment', 'CheckoutPayment.astro');
const SDK_SRC = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js';

function mountPaymentDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-block="checkout-payment" data-puck-component-id="cp-1">
      <div data-checkout-payment-list>
        <label data-payment-key="bank_card" data-payment-method="bank_card" data-payment-selected="true">
          <input type="radio" name="paymentMethod" value="bank_card" checked data-payment-radio />
          <span data-payment-radio-dot></span>
        </label>
        <div data-card-form-wrapper data-checkout-card-form>
          <input data-card-field="number" />
          <input data-card-field="expiry" />
          <input data-card-field="cvc" />
          <input data-card-field="nameOnCard" />
          <p data-payment-sdk-status hidden></p>
        </div>
        <label data-payment-key="sbp" data-payment-method="sbp" data-payment-selected="false">
          <input type="radio" name="paymentMethod" value="sbp" data-payment-radio />
          <span data-payment-radio-dot></span>
        </label>
      </div>
    </section>`;
  return document.querySelector('[data-block="checkout-payment"]') as HTMLElement;
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  astroInlineRunners(ASTRO)[0].run({ blockId: 'cp-1' });
}

function setConfig() {
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
}

/** Мок fetch payment-config/public — один и тот же ответ на каждый вызов (у блока их несколько). */
function mockPaymentConfig(data: Record<string, unknown> | null) {
  (window as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ success: true, data }) }),
  );
}

function flush() {
  return new Promise((r) => setTimeout(r, 10));
}

function cleanup() {
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).__checkoutTokenizeCard;
  delete (window as any).__YOOKASSA_SDK_READY__;
  delete (window as any).__YOOKASSA_SDK_LOADING__;
  delete (window as any).__YOOKASSA_SHOP_ID__;
  document.head.querySelectorAll(`script[src="${SDK_SRC}"]`).forEach((el) => el.remove());
}

describe('CheckoutPayment — вид «карта у нас» (activeProvider=yookassa)', () => {
  afterEach(cleanup);

  it('форма карты видна, SDK ЮKassa грузится (script в head)', async () => {
    setConfig();
    mockPaymentConfig({ yookassaEnabled: true, yookassaShopId: 'yk_1', enabledMethods: ['bank_card', 'sbp'], activeProvider: 'yookassa' });
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    const cardWrapper = section.querySelector('[data-card-form-wrapper]') as HTMLElement;
    expect(cardWrapper.hidden).toBe(false);
    expect(document.head.querySelector(`script[src="${SDK_SRC}"]`)).not.toBeNull();
  });
});

describe('CheckoutPayment — вид «страница платёжки» (Точка/Робокасса/Prodamus)', () => {
  afterEach(cleanup);

  it.each(['tochka', 'robokassa', 'prodamus'])(
    'activeProvider=%s → полей карты нет, SDK ЮKassa не грузится',
    async (provider) => {
      setConfig();
      mockPaymentConfig({ yookassaEnabled: false, yookassaShopId: null, activeProvider: provider });
      const section = mountPaymentDom();
      runScript(section);
      await flush();

      const cardWrapper = section.querySelector('[data-card-form-wrapper]') as HTMLElement;
      expect(cardWrapper.hidden).toBe(true);
      expect(document.head.querySelector(`script[src="${SDK_SRC}"]`)).toBeNull();
      expect((window as any).__YOOKASSA_SDK_READY__).toBeUndefined();
    },
  );

  it('способ (СБП) всё равно выбирается — это подсказка платёжке, не блокируется', async () => {
    setConfig();
    mockPaymentConfig({ yookassaEnabled: false, yookassaShopId: null, activeProvider: 'tochka' });
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    const sbpRadio = section.querySelector('input[value="sbp"]') as HTMLInputElement;
    sbpRadio.checked = true;
    sbpRadio.dispatchEvent(new Event('change'));

    const sbpLabel = section.querySelector('[data-payment-key="sbp"]') as HTMLElement;
    expect(sbpLabel.getAttribute('data-payment-selected')).toBe('true');
    // Форма карты по-прежнему скрыта — выбор способа её не открывает у этого вида.
    const cardWrapper = section.querySelector('[data-card-form-wrapper]') as HTMLElement;
    expect(cardWrapper.hidden).toBe(true);
  });

  it('переключение обратно на «Банковская карта» НЕ открывает форму и не грузит SDK', async () => {
    setConfig();
    mockPaymentConfig({ yookassaEnabled: false, yookassaShopId: null, activeProvider: 'robokassa' });
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    const cardRadio = section.querySelector('input[value="bank_card"]') as HTMLInputElement;
    cardRadio.checked = true;
    cardRadio.dispatchEvent(new Event('change'));
    await flush();

    const cardWrapper = section.querySelector('[data-card-form-wrapper]') as HTMLElement;
    expect(cardWrapper.hidden).toBe(true);
    expect(document.head.querySelector(`script[src="${SDK_SRC}"]`)).toBeNull();
  });
});

describe('CheckoutPayment — «онлайн-оплата не подключена» (activeProvider=null) — поведение как раньше', () => {
  afterEach(cleanup);

  it('форма карты видна (как обычный способ), ошибка заранее НЕ показывается, SDK молча не грузится', async () => {
    setConfig();
    mockPaymentConfig({ yookassaEnabled: false, yookassaShopId: null, activeProvider: null });
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    const cardWrapper = section.querySelector('[data-card-form-wrapper]') as HTMLElement;
    expect(cardWrapper.hidden).toBe(false);
    expect(document.head.querySelector(`script[src="${SDK_SRC}"]`)).toBeNull();
    const sdkStatus = section.querySelector('[data-payment-sdk-status]') as HTMLElement;
    expect(sdkStatus.hidden).toBe(true);
    expect(sdkStatus.textContent).toBe('');
  });
});

describe('CheckoutPayment — прод без поля activeProvider (шлюз ещё не обновлён) — правило yookassaEnabled', () => {
  afterEach(cleanup);

  it('yookassaEnabled=true → как «карта у нас»: форма видна, SDK грузится, методы фильтруются', async () => {
    setConfig();
    // Реальный прод отдаёт объект БЕЗ ключа activeProvider вовсе (а не undefined-значением).
    mockPaymentConfig({ yookassaEnabled: true, yookassaShopId: 'yk_prod', enabledMethods: ['bank_card'] });
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    const cardWrapper = section.querySelector('[data-card-form-wrapper]') as HTMLElement;
    expect(cardWrapper.hidden).toBe(false);
    expect(document.head.querySelector(`script[src="${SDK_SRC}"]`)).not.toBeNull();
    // enabledMethods=['bank_card'] → sbp скрыт (регресс существовавшей фильтрации).
    const sbpLabel = section.querySelector('[data-payment-key="sbp"]') as HTMLElement;
    expect(sbpLabel.style.display).toBe('none');
  });

  it('yookassaEnabled=false → как «не подключено»: форма видна, SDK не грузится, без ошибки', async () => {
    setConfig();
    mockPaymentConfig({ yookassaEnabled: false, yookassaShopId: null });
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    const cardWrapper = section.querySelector('[data-card-form-wrapper]') as HTMLElement;
    expect(cardWrapper.hidden).toBe(false);
    expect(document.head.querySelector(`script[src="${SDK_SRC}"]`)).toBeNull();
  });
});
