/**
 * @jest-environment jsdom
 *
 * CheckoutTotals со стекингом BOGO-подарок + ручной промокод (Model G):
 *  - subtotal включает 0₽-подарок как 0 (т.е. = оплачиваемые юниты);
 *  - discountCents (промокод) пришёл через checkout:discount-applied;
 *  - total = max(0, subtotal − discountCents + delivery);
 *  - фоновый серверный синк (новые id позиций + добавленный подарок) НЕ обнуляет
 *    discountCents — сигнатура keyed по productId+variant+qty, isBonus исключён.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(__dirname, '..', 'blocks', 'CheckoutTotals', 'CheckoutTotals.astro');

function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> found in CheckoutTotals.astro');
  return m[1];
}

function mountTotalsDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-totals data-puck-component-id="ct-1" data-free-text="Бесплатно" hidden>
      <div data-totals-row="delivery"><span>Доставка</span><span data-totals-delivery>Бесплатно</span></div>
      <div data-totals-row="discount" hidden><span>Скидка</span><span data-totals-discount>0 ₽</span></div>
      <div data-totals-row="total"><span>Итого</span><span data-totals-total>0 ₽</span></div>
    </section>`;
  return document.querySelector('[data-checkout-totals]') as HTMLElement;
}

const SRC = readFileSync(ASTRO, 'utf8');
const SCRIPT = inlineScriptBody(SRC);

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
  };
  // eslint-disable-next-line no-new-func
  new Function('blockId', SCRIPT)('ct-1');
}

const LOCAL_ITEM = {
  id: 'local-1',
  productId: 'p1',
  unitPriceCents: 100000,
  quantity: 2,
  variantCombinationId: null,
};

// Server cart: paid line (new id, 2×1000₽) + 0₽ gift line.
const SERVER_ITEMS = [
  { id: 'srv-1', productId: 'p1', unitPriceCents: 100000, totalCents: 200000, quantity: 2, variantCombinationId: null },
  { id: 'srv-bonus', productId: 'p1', unitPriceCents: 0, totalCents: 0, quantity: 1, isBonus: true, variantCombinationId: null },
];

const txt = (el: Element | null) => (el ? (el.textContent || '').replace(/\s/g, '') : '');

describe('CheckoutTotals — BOGO gift stacking + signature stability', () => {
  beforeEach(() => {
    cartItems = [];
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).cartStore;
    delete (window as any).__merfyRoot;
  });

  it('subtotal counts the 0₽ gift as 0; total = subtotal − promo + delivery', async () => {
    cartItems = SERVER_ITEMS;
    const section = mountTotalsDom();
    runInlineScript(section);

    // promo 10% of 2000₽ = 200₽
    document.dispatchEvent(
      new CustomEvent('checkout:discount-applied', { detail: { code: 'SALE10', discountCents: 20000 } }),
    );
    await new Promise((r) => setTimeout(r, 0));

    const discountRow = section.querySelector('[data-totals-row="discount"]') as HTMLElement;
    expect(discountRow.hidden).toBe(false);
    expect(txt(section.querySelector('[data-totals-discount]'))).toContain('200');
    // total = 2000 − 200 + 0 = 1800₽
    expect(txt(section.querySelector('[data-totals-total]'))).toMatch(/1800₽/);
  });

  it('background sync (new ids + gift) keeps the applied promo discount', async () => {
    cartItems = [LOCAL_ITEM];
    const section = mountTotalsDom();
    runInlineScript(section);

    document.dispatchEvent(
      new CustomEvent('checkout:discount-applied', { detail: { code: 'SALE10', discountCents: 20000 } }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(txt(section.querySelector('[data-totals-total]'))).toMatch(/1800₽/);

    // Background sync: server items replace local (new id + gift appended).
    cartItems = SERVER_ITEMS;
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    // discount must survive → total still 1800₽ (not reset to 2000₽).
    expect((section.querySelector('[data-totals-row="discount"]') as HTMLElement).hidden).toBe(false);
    expect(txt(section.querySelector('[data-totals-total]'))).toMatch(/1800₽/);
  });

  it('a REAL cart edit (qty change) zeroes the discount', async () => {
    cartItems = [LOCAL_ITEM];
    const section = mountTotalsDom();
    runInlineScript(section);
    document.dispatchEvent(
      new CustomEvent('checkout:discount-applied', { detail: { code: 'SALE10', discountCents: 20000 } }),
    );
    await new Promise((r) => setTimeout(r, 0));

    cartItems = [{ ...LOCAL_ITEM, quantity: 3 }]; // 2 → 3
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: cartItems } }));
    await new Promise((r) => setTimeout(r, 0));

    // discount reset → row hidden, total = 3×1000 = 3000₽
    expect((section.querySelector('[data-totals-row="discount"]') as HTMLElement).hidden).toBe(true);
    expect(txt(section.querySelector('[data-totals-total]'))).toMatch(/3000₽/);
  });
});
