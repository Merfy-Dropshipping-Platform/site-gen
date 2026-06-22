/**
 * @jest-environment jsdom
 *
 * BOGO «Подарок» (Model G) на чекауте rose, сводка заказа:
 *  - isBonus-строка рендерится бейджем «Подарок» и нулевой ценой;
 *  - фоновый серверный синк (server items с НОВЫМИ id + добавленной 0-bonus
 *    строкой) НЕ сбрасывает только что применённый промокод — сигнатура состава
 *    keyed по productId+variant+qty и исключает isBonus, поэтому появление
 *    подарка / remap локального id в серверный id не считается правкой корзины.
 *
 * Inline `is:inline` нельзя импортировать — извлекаем тело <script> из .astro и
 * исполняем в jsdom с blockId (define:vars), как в checkout-order-summary-promo.dom.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(
  __dirname,
  '..',
  'blocks',
  'CheckoutOrderSummary',
  'CheckoutOrderSummary.astro',
);

const RUB = '₽'; // ₽
const GIFT = 'Подарок'; // Подарок

function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> found in CheckoutOrderSummary.astro');
  return m[1];
}

/** SSR markup — bogo badge enabled (matches live CheckoutSummary defaults). */
function mountSummaryDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-summary data-puck-component-id="cos-1"
             data-show-variant-labels="false" data-show-compare-price="true"
             data-bogo-badge="true" data-image-size="96">
      <div data-checkout-loading></div>
      <div data-checkout-empty hidden></div>
      <div data-checkout-items hidden></div>
      <div data-checkout-promo-wrap hidden>
        <div data-checkout-promo data-promo-label="promo">
          <input data-checkout-promo-input autocomplete="off" />
          <button data-checkout-promo-apply disabled>Apply</button>
        </div>
        <div data-checkout-promo-applied hidden>
          <span data-checkout-promo-applied-code></span>
          <button data-checkout-promo-remove>x</button>
        </div>
        <div data-checkout-promo-error role="alert" hidden></div>
      </div>
    </section>`;
  return document.querySelector('[data-checkout-summary]') as HTMLElement;
}

const SRC = readFileSync(ASTRO, 'utf8');
const SCRIPT = inlineScriptBody(SRC);

/** Mutable cart backing window.cartStore.getItems(). */
let cartItems: any[] = [];

function runInlineScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  (window as any).cartStore = {
    getItems: () => cartItems,
    getTotal: () =>
      cartItems.reduce(
        (s, it) => s + (it.unitPriceCents || it.priceCents || 0) * (it.quantity || 1),
        0,
      ),
    syncToServer: jest.fn(async () => 'cart_123'),
  };
  // eslint-disable-next-line no-new-func
  new Function('blockId', SCRIPT)('cos-1');
}

/** Local first-paint item (nt-cart display shape; client-generated id). */
const LOCAL_ITEM = {
  id: 'local-1',
  productId: 'p1',
  name: 'Candle',
  priceCents: 100000,
  unitPriceCents: 100000,
  quantity: 2,
  variantCombinationId: null,
};

/** Server cart after recalc: same paid item (NEW server id) + 0 gift line. */
const SERVER_ITEMS = [
  {
    id: 'srv-paid-1', // server-generated id, differs from local-1
    productId: 'p1',
    name: 'Candle',
    unitPriceCents: 100000,
    totalCents: 200000,
    quantity: 2,
    variantCombinationId: null,
  },
  {
    id: 'srv-bonus-1',
    productId: 'p1',
    name: 'Candle',
    unitPriceCents: 0,
    totalCents: 0,
    quantity: 1,
    isBonus: true,
    bonusDiscountId: 'd-bogo',
    variantCombinationId: null,
  },
];

const appliedHidden = (section: HTMLElement) =>
  (section.querySelector('[data-checkout-promo-applied]') as HTMLElement).hidden;

function applyPromo(section: HTMLElement) {
  localStorage.setItem('merfy:cartId', 'cart_123');
  (window as any).fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ data: { discountCents: 20000 } }) });
  const input = section.querySelector('[data-checkout-promo-input]') as HTMLInputElement;
  const apply = section.querySelector('[data-checkout-promo-apply]') as HTMLButtonElement;
  input.value = 'SALE10';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  apply.click();
}

describe('CheckoutOrderSummary — BOGO gift + signature stability', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    cartItems = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
  });

  it('renders the isBonus line with a gift badge and a zero price', async () => {
    cartItems = SERVER_ITEMS;
    const section = mountSummaryDom();
    runInlineScript(section);

    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    const itemsEl = section.querySelector('[data-checkout-items]') as HTMLElement;
    expect(itemsEl.hidden).toBe(false);
    // Gift badge present exactly once (only the bonus line).
    expect((itemsEl.innerHTML.match(new RegExp(GIFT, 'g')) || []).length).toBe(1);
    // Bonus line forced to a zero price (regular space, NBSP, or &nbsp; entity).
    expect(itemsEl.innerHTML).toMatch(new RegExp('0(?:[\\s\\u00A0]|&nbsp;)*' + RUB));
    // Paid line keeps its price 1 000 ₽ (innerHTML serializes NBSP as &nbsp;).
    expect(itemsEl.innerHTML).toMatch(new RegExp('1(?:[\\s\\u00A0]|&nbsp;)?000(?:[\\s\\u00A0]|&nbsp;)?' + RUB));
  });

  it('background server-sync (new ids + appended gift) does NOT reset an applied promo', async () => {
    // 1. Local first paint.
    cartItems = [LOCAL_ITEM];
    const section = mountSummaryDom();
    runInlineScript(section);
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    // 2. User applies a promo.
    applyPromo(section);
    await new Promise((r) => setTimeout(r, 0));
    expect(appliedHidden(section)).toBe(false);

    // 3. Background sync resolves: server items (new id + gift) replace local.
    cartItems = SERVER_ITEMS;
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    // Promo MUST survive — gift appearing / id remap is not a user cart edit.
    expect(appliedHidden(section)).toBe(false);
    expect(sessionStorage.getItem('merfy:promoCode')).toBe('SALE10');
  });

  it('a REAL cart edit (qty change) DOES reset the applied promo', async () => {
    cartItems = [LOCAL_ITEM];
    const section = mountSummaryDom();
    runInlineScript(section);
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    applyPromo(section);
    await new Promise((r) => setTimeout(r, 0));
    expect(appliedHidden(section)).toBe(false);

    // Real edit: qty 2 -> 3 on the paid line.
    cartItems = [{ ...LOCAL_ITEM, quantity: 3 }];
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    expect(appliedHidden(section)).toBe(true);
    expect(sessionStorage.getItem('merfy:promoCode')).toBeNull();
  });
});
