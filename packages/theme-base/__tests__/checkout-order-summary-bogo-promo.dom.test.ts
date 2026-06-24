/**
 * @jest-environment jsdom
 *
 * Промокод-BOGO «1+1=3» на чекауте rose, сводка заказа (spec §4):
 *  - после УСПЕШНОГО apply (POST /promo вернул плоский order с items, где есть
 *    0₽-подарок item.isBonus=true) сводка ре-синкается из json.data.items и
 *    подарок РЕНДЕРИТСЯ позицией; applied-state выставлен и НЕ сбрасывается
 *    (cartSignature исключает isBonus);
 *  - после remove (DELETE /promo вернул order БЕЗ подарка промокод-BOGO) сводка
 *    ре-синкается и подарок ИСЧЕЗАЕТ;
 *  - codeless авто-BOGO подарок при remove ОСТАЁТСЯ (сервер его сохраняет —
 *    моделируем тем, что DELETE-ответ всё ещё содержит свой авто-подарок).
 *
 * Inline `is:inline` нельзя импортировать — извлекаем тело <script> из .astro и
 * исполняем в jsdom с blockId (define:vars), как в checkout-order-summary-bogo.dom.
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

const RUB = '₽';
const GIFT = 'Подарок';

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

/**
 * cartStore mock with a REAL syncFromCartData: replaces the backing array from
 * cartData.items and re-emits cart:updated (mirrors the live cart-store private
 * syncFromCartData that the new public method delegates to).
 */
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
    syncFromCartData: (cartData: any) => {
      if (cartData && Array.isArray(cartData.items)) cartItems = cartData.items;
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    },
  };
  // eslint-disable-next-line no-new-func
  new Function('blockId', SCRIPT)('cos-1');
}

/** Paid line (2×1000₽) before promo applied. */
const PAID_LINE = {
  id: 'srv-paid-1',
  productId: 'p1',
  name: 'Candle',
  unitPriceCents: 100000,
  totalCents: 200000,
  quantity: 2,
  variantCombinationId: null,
};

/** 0₽ gift line of a CODED BOGO (promocode-BOGO). */
const CODED_GIFT_LINE = {
  id: 'srv-bonus-coded',
  productId: 'p1',
  name: 'Candle',
  unitPriceCents: 0,
  totalCents: 0,
  quantity: 1,
  isBonus: true,
  bonusDiscountId: 'd-bogo-coded',
  variantCombinationId: null,
};

/** Flat order returned by POST /promo for a promocode-BOGO (gift present). */
const APPLY_ORDER = {
  id: 'cart_123',
  subtotalCents: 200000,
  discountCents: 0,
  totalCents: 200000,
  promoCode: 'ТЕСТ',
  appliedDiscountId: 'd-bogo-coded',
  items: [PAID_LINE, CODED_GIFT_LINE],
};

/** Flat order returned by DELETE /promo (gift gone, promo cleared). */
const REMOVE_ORDER = {
  id: 'cart_123',
  subtotalCents: 200000,
  discountCents: 0,
  totalCents: 200000,
  promoCode: null,
  appliedDiscountId: null,
  items: [PAID_LINE],
};

const giftCount = (section: HTMLElement) => {
  const itemsEl = section.querySelector('[data-checkout-items]') as HTMLElement;
  return (itemsEl.innerHTML.match(new RegExp(GIFT, 'g')) || []).length;
};
const appliedHidden = (section: HTMLElement) =>
  (section.querySelector('[data-checkout-promo-applied]') as HTMLElement).hidden;

function applyPromoCode(section: HTMLElement, code: string) {
  const input = section.querySelector('[data-checkout-promo-input]') as HTMLInputElement;
  const apply = section.querySelector('[data-checkout-promo-apply]') as HTMLButtonElement;
  input.value = code;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  apply.click();
}

describe('CheckoutOrderSummary — promocode-BOGO gift line apply/remove', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem('merfy:cartId', 'cart_123');
    cartItems = [PAID_LINE]; // only the paid line before the code is entered
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
  });

  it('after applying a promocode-BOGO the 0₽ gift line renders (synced from json.data.items)', async () => {
    (window as any).fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: APPLY_ORDER }) });
    const section = mountSummaryDom();
    runInlineScript(section);
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(giftCount(section)).toBe(0); // no gift yet

    applyPromoCode(section, 'тест');
    await new Promise((r) => setTimeout(r, 0));

    // Gift line now rendered exactly once.
    expect(giftCount(section)).toBe(1);
    const itemsEl = section.querySelector('[data-checkout-items]') as HTMLElement;
    expect(itemsEl.innerHTML).toMatch(new RegExp('0(?:[\\s\\u00A0]|&nbsp;)*' + RUB));
    // applied-state survives the gift-line sync (isBonus excluded from signature).
    expect(appliedHidden(section)).toBe(false);
    expect(sessionStorage.getItem('merfy:promoCode')).toBe('тест');
  });

  it('after removing the promocode-BOGO the gift line disappears (synced from DELETE json.data.items)', async () => {
    const fetchMock = jest.fn();
    (window as any).fetch = fetchMock;
    const section = mountSummaryDom();
    runInlineScript(section);
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    // Apply first (gift appears).
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: APPLY_ORDER }) });
    applyPromoCode(section, 'тест');
    await new Promise((r) => setTimeout(r, 0));
    expect(giftCount(section)).toBe(1);

    // Remove: DELETE returns order without the gift.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: REMOVE_ORDER }) });
    (section.querySelector('[data-checkout-promo-remove]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    const [url, opts] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(url).toMatch(/\/orders\/cart\/cart_123\/promo$/);
    expect(opts.method).toBe('DELETE');
    // Gift line gone, applied-state cleared.
    expect(giftCount(section)).toBe(0);
    expect(appliedHidden(section)).toBe(true);
    expect(sessionStorage.getItem('merfy:promoCode')).toBeNull();
  });

  it('removing a SIMPLE promo while a codeless auto-BOGO gift is present keeps that gift', async () => {
    // Server keeps the codeless auto-BOGO gift in the DELETE response.
    const REMOVE_WITH_AUTO_GIFT = {
      ...REMOVE_ORDER,
      items: [
        PAID_LINE,
        { ...CODED_GIFT_LINE, id: 'srv-bonus-auto', bonusDiscountId: 'd-bogo-auto' },
      ],
    };
    const fetchMock = jest.fn();
    (window as any).fetch = fetchMock;
    const section = mountSummaryDom();
    runInlineScript(section);
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    // Apply a simple money promo (discountCents>0, gift stays auto on server).
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { ...APPLY_ORDER, discountCents: 5000, items: [PAID_LINE, { ...CODED_GIFT_LINE, id: 'srv-bonus-auto', bonusDiscountId: 'd-bogo-auto' }] },
      }),
    });
    applyPromoCode(section, 'ЧЕК');
    await new Promise((r) => setTimeout(r, 0));
    expect(giftCount(section)).toBe(1);

    // Remove the simple promo: server keeps the codeless auto-BOGO gift.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: REMOVE_WITH_AUTO_GIFT }) });
    (section.querySelector('[data-checkout-promo-remove]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    // Auto-BOGO gift survives the simple-promo removal.
    expect(giftCount(section)).toBe(1);
  });

  it('cartSignature is unaffected by the gift line appearing on apply (no false reset)', async () => {
    (window as any).fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: APPLY_ORDER }) });
    const section = mountSummaryDom();
    runInlineScript(section);
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    applyPromoCode(section, 'тест');
    await new Promise((r) => setTimeout(r, 0));
    // applied stays on through the gift-line sync...
    expect(appliedHidden(section)).toBe(false);

    // ...and a subsequent benign cart:updated (same composition + gift) still keeps it.
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(appliedHidden(section)).toBe(false);
    expect(sessionStorage.getItem('merfy:promoCode')).toBe('тест');
  });
});
