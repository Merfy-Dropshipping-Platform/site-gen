/**
 * @jest-environment jsdom
 *
 * CheckoutDeliveryMethod — нейтрализация секции доставки для цифровых товаров
 * (window.__MERFY_CONFIG__.checkout.addressRequired === false):
 *  - по событию checkout:config-ready секция прячется (section.hidden) и
 *    диспатчится синтетический checkout:delivery-changed {type:'none',costCents:0};
 *  - recalculate НЕ бьёт в логистику (нет fetch к /delivery/calculate);
 *  - дефолт / addressRequired=true → секция видима, синтетика НЕ диспатчится
 *    (нулевая регрессия).
 * Скрипт извлекается из .astro и исполняется в jsdom (как в submit-тестах).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(__dirname, '..', 'blocks', 'CheckoutDeliveryMethod', 'CheckoutDeliveryMethod.astro');

function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> in CheckoutDeliveryMethod.astro');
  return m[1];
}

const SCRIPT = inlineScriptBody(readFileSync(ASTRO, 'utf8'));

function mountDeliveryDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-delivery-method data-puck-component-id="dm-1"
             data-cdek-enabled="true" data-pickup-enabled="true" data-pickup-label="Самовывоз"
             data-cdek-door-label="Курьер" data-cdek-pvz-label="ПВЗ" data-cdek-postamat-label="Постамат"
             data-free-shipping-threshold="">
      <h2>Способ доставки</h2>
      <div data-checkout-delivery-empty></div>
      <div data-checkout-delivery-loading hidden></div>
      <div data-checkout-delivery-error hidden></div>
      <div data-checkout-delivery-list hidden></div>
      <div data-cdek-pvz-picker hidden></div>
    </section>`;
  return document.querySelector('[data-checkout-delivery-method]') as HTMLElement;
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  // eslint-disable-next-line no-new-func
  new Function('blockId', SCRIPT)('dm-1');
}

function setConfig(checkout?: Record<string, unknown>) {
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api', checkout };
}

describe('CheckoutDeliveryMethod — цифровой режим (addressRequired=false)', () => {
  let fetchMock: jest.Mock;
  let captured: any[];

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    (window as any).cartStore = {
      getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
      getTotal: () => 100000,
    };
    fetchMock = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ success: true, data: {} }) }));
    (window as any).fetch = fetchMock;
    captured = [];
    document.addEventListener('checkout:delivery-changed', (e: any) => captured.push(e.detail));
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  it('config-ready: прячет секцию + диспатчит синтетический {type:"none",costCents:0}', () => {
    setConfig({ addressRequired: false });
    const section = mountDeliveryDom();
    runScript(section);

    document.dispatchEvent(new CustomEvent('checkout:config-ready'));

    expect(section.hidden).toBe(true);
    const none = captured.find((d) => d.type === 'none');
    expect(none).toBeDefined();
    expect(none.costCents).toBe(0);
    expect(none.tariffCode).toBeNull();
    expect(none.pickupPointCode).toBeNull();
  });

  it('синтетический метод не повторяется при повторных триггерах (идемпотентно)', () => {
    setConfig({ addressRequired: false });
    const section = mountDeliveryDom();
    runScript(section);

    // Первая нейтрализация — метод «none» ушёл (проверено соседним кейсом).
    document.dispatchEvent(new CustomEvent('checkout:config-ready'));
    captured.length = 0; // считаем только ПОСЛЕДУЮЩИЕ дисатчи
    // Повторные триггеры не должны слать «none» снова.
    document.dispatchEvent(new CustomEvent('checkout:config-ready'));
    document.dispatchEvent(new CustomEvent('checkout:address-changed', { detail: { cityFiasId: 'f1' } }));

    expect(captured.filter((d) => d.type === 'none').length).toBe(0);
    expect(section.hidden).toBe(true);
  });

  it('recalculate (через checkout:address-changed) НЕ бьёт в /delivery/calculate', () => {
    setConfig({ addressRequired: false });
    const section = mountDeliveryDom();
    runScript(section);

    document.dispatchEvent(new CustomEvent('checkout:address-changed', { detail: { cityFiasId: 'f1', postalCode: '101000' } }));

    expect(fetchMock.mock.calls.some((c) => /\/delivery\/calculate/.test(String(c[0])))).toBe(false);
    expect(section.hidden).toBe(true);
  });
});

describe('CheckoutDeliveryMethod — физический режим (дефолт) — регресс', () => {
  let fetchMock: jest.Mock;
  let captured: any[];

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    (window as any).cartStore = {
      getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
      getTotal: () => 100000,
    };
    fetchMock = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ success: true, data: {} }) }));
    (window as any).fetch = fetchMock;
    captured = [];
    document.addEventListener('checkout:delivery-changed', (e: any) => captured.push(e.detail));
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  it('дефолт (нет checkout-конфига): секция видима, синтетика НЕ диспатчится', () => {
    setConfig(undefined);
    const section = mountDeliveryDom();
    runScript(section);

    document.dispatchEvent(new CustomEvent('checkout:config-ready'));

    expect(section.hidden).toBe(false);
    expect(captured.some((d) => d.type === 'none')).toBe(false);
  });

  it('addressRequired=true: секция видима, синтетика НЕ диспатчится', () => {
    setConfig({ addressRequired: true });
    const section = mountDeliveryDom();
    runScript(section);

    document.dispatchEvent(new CustomEvent('checkout:config-ready'));

    expect(section.hidden).toBe(false);
    expect(captured.some((d) => d.type === 'none')).toBe(false);
  });
});

// ── FIX 3: первичный рендер отложен до конфига + safety-net ───────────────────
// Регрессия: initialDeliveryRender бежал на ~300мс (до прихода конфига). Цифровой
// товар успевал сходить в логистику и мигнуть секцией, потом config-ready
// нейтрализовал. Теперь первичный рендер ждёт checkout:config-ready; если события
// нет за ~1500мс — safety-net рендерит с дефолтами (доставка не зависает).
describe('CheckoutDeliveryMethod — FIX 3: отложенный первичный рендер + safety-net', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    (window as any).cartStore = {
      getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
      getTotal: () => 100000,
    };
    fetchMock = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ success: true, data: {} }) }));
    (window as any).fetch = fetchMock;
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  const hitCalculate = () =>
    fetchMock.mock.calls.some((c) => /\/delivery\/calculate/.test(String(c[0])));

  it('addressRequired=false приходит ПОЗДНО (config-ready): рендер отложен → логистика НЕ дёргается', () => {
    // На init конфига ещё нет (checkout undefined → дефолт физ). Магазин на самом деле
    // цифровой: addressRequired:false прилетит позже через config-ready. Корзина готова —
    // будь первичный рендер физическим, он ушёл бы в /delivery/calculate (мигание).
    localStorage.setItem('merfy:cartId', 'cart_1');
    setConfig(undefined);
    const section = mountDeliveryDom();
    runScript(section);

    // Старый код бил в логистику на ~300мс (до конфига). Новый — ждёт config-ready.
    jest.advanceTimersByTime(500);
    expect(hitCalculate()).toBe(false);

    // Поздний конфиг: магазин цифровой.
    (window as any).__MERFY_CONFIG__.checkout = { addressRequired: false };
    document.dispatchEvent(new CustomEvent('checkout:config-ready'));

    // Первичный рендер отработал ПО КОНФИГУ → нейтрализация, без запроса в логистику.
    expect(hitCalculate()).toBe(false);
    expect(section.hidden).toBe(true);

    // safety-net снят config-ready — поздний тик его не воскрешает.
    jest.advanceTimersByTime(2000);
    expect(hitCalculate()).toBe(false);
  });

  it('config-ready НЕ пришёл: safety-net (~1500мс) рендерит с дефолтами (доставка не зависает)', () => {
    // Дефолт физ, корзина готова, событие config-ready НЕ диспатчим.
    localStorage.setItem('merfy:cartId', 'cart_1');
    setConfig(undefined);
    const section = mountDeliveryDom();
    runScript(section);

    // До срабатывания safety-net — тишина (первичный рендер отложен).
    jest.advanceTimersByTime(1000);
    expect(hitCalculate()).toBe(false);

    // Safety-net срабатывает (суммарно > 1500мс) → первичный рендер с дефолтами
    // (физ) → расчёт уходит, доставка не зависает навсегда.
    jest.advanceTimersByTime(600);
    expect(hitCalculate()).toBe(true);
    expect(section.hidden).toBe(false);
  });
});
