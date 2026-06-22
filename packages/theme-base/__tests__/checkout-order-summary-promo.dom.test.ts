/**
 * @jest-environment jsdom
 *
 * Integration test for the CheckoutOrderSummary inline hydration script.
 * `<script is:inline>` cannot be imported (Astro inlines it verbatim, no bundle),
 * so — following the preview-nav-agent precedent — we extract the script body from
 * the .astro source and execute it in jsdom with `blockId` injected (as Astro's
 * `define:vars` would), then drive the promo apply / error / remove flows.
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

/** Body of the first <script>…</script> in the .astro source. */
function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> found in CheckoutOrderSummary.astro');
  return m[1];
}

/** SSR markup that mirrors the .astro section (promo enabled). */
function mountSummaryDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-summary data-puck-component-id="cos-1"
             data-show-variant-labels="false" data-show-compare-price="false"
             data-bogo-badge="false" data-image-size="96">
      <div data-checkout-loading></div>
      <div data-checkout-empty hidden></div>
      <div data-checkout-items hidden></div>
      <div data-checkout-promo-wrap hidden>
        <div data-checkout-promo data-promo-label="Промокод">
          <input data-checkout-promo-input autocomplete="off" />
          <button data-checkout-promo-apply disabled>Применить</button>
        </div>
        <div data-checkout-promo-applied hidden>
          <span data-checkout-promo-applied-code></span>
          <button data-checkout-promo-remove>Убрать ×</button>
        </div>
        <div data-checkout-promo-error role="alert" hidden></div>
      </div>
    </section>`;
  return document.querySelector('[data-checkout-summary]') as HTMLElement;
}

function runInlineScript(section: HTMLElement, body: string) {
  (window as any).__merfyRoot = () => section;
  // Inject blockId the way Astro's define:vars would, then run the IIFE body.
  // eslint-disable-next-line no-new-func
  new Function('blockId', body)('cos-1');
}

const SRC = readFileSync(ASTRO, 'utf8');
const SCRIPT = inlineScriptBody(SRC);

describe('CheckoutOrderSummary inline promo flow', () => {
  let fetchMock: jest.Mock;
  let dispatched: any[];

  beforeEach(() => {
    dispatched = [];
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem('merfy:cartId', 'cart_123');

    (window as any).cartStore = {
      getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
      getTotal: () => 100000,
      syncToServer: jest.fn(async () => 'cart_123'),
    };

    fetchMock = jest.fn();
    (window as any).fetch = fetchMock;

    const orig = document.dispatchEvent.bind(document);
    jest.spyOn(document, 'dispatchEvent').mockImplementation((e: Event) => {
      if (e.type === 'checkout:discount-applied') dispatched.push((e as CustomEvent).detail);
      return orig(e);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
  });

  function applyPromo(section: HTMLElement, code: string) {
    const input = section.querySelector('[data-checkout-promo-input]') as HTMLInputElement;
    const apply = section.querySelector('[data-checkout-promo-apply]') as HTMLButtonElement;
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    apply.click();
  }

  it('POSTs body with `promoCode` (NOT `code`) on apply', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { discountCents: 5000 } }) });
    const section = mountSummaryDom();
    runInlineScript(section, SCRIPT);

    applyPromo(section, 'SALE10');
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/orders\/cart\/cart_123\/promo$/);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ promoCode: 'SALE10' });
  });

  it('on success: dispatches discount-applied, switches to applied-state, persists sessionStorage', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { discountCents: 5000 } }) });
    const section = mountSummaryDom();
    runInlineScript(section, SCRIPT);

    applyPromo(section, 'SALE10');
    await new Promise((r) => setTimeout(r, 0));

    expect(dispatched).toContainEqual({ code: 'SALE10', discountCents: 5000 });
    expect(sessionStorage.getItem('merfy:promoCode')).toBe('SALE10');
    const applied = section.querySelector('[data-checkout-promo-applied]') as HTMLElement;
    const promoRow = section.querySelector('[data-checkout-promo]') as HTMLElement;
    expect(applied.hidden).toBe(false);
    expect(promoRow.hidden).toBe(true);
    expect(
      (section.querySelector('[data-checkout-promo-applied-code]') as HTMLElement).textContent,
    ).toBe('SALE10');
  });

  it('on !res.ok: shows backend json.message, leaves discount unchanged', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ statusCode: 400, message: 'Промокод недействителен' }),
    });
    const section = mountSummaryDom();
    runInlineScript(section, SCRIPT);

    applyPromo(section, 'BAD');
    await new Promise((r) => setTimeout(r, 0));

    const err = section.querySelector('[data-checkout-promo-error]') as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe('Промокод недействителен');
    expect(dispatched).toHaveLength(0); // discount untouched
    expect(sessionStorage.getItem('merfy:promoCode')).toBeNull();
  });

  it('calls syncToServer when merfy:cartId is empty before applying', async () => {
    localStorage.removeItem('merfy:cartId');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { discountCents: 1000 } }) });
    const section = mountSummaryDom();
    runInlineScript(section, SCRIPT);

    applyPromo(section, 'SALE10');
    await new Promise((r) => setTimeout(r, 0));

    expect((window as any).cartStore.syncToServer).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/orders\/cart\/cart_123\/promo$/);
  });

  it('remove: DELETEs promo, clears sessionStorage, dispatches zero discount, restores input', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { discountCents: 5000 } }) });
    const section = mountSummaryDom();
    runInlineScript(section, SCRIPT);

    applyPromo(section, 'SALE10');
    await new Promise((r) => setTimeout(r, 0));
    fetchMock.mockClear();
    dispatched.length = 0;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { discountCents: 0 } }) });

    (section.querySelector('[data-checkout-promo-remove]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/orders\/cart\/cart_123\/promo$/);
    expect(opts.method).toBe('DELETE');
    expect(sessionStorage.getItem('merfy:promoCode')).toBeNull();
    expect(dispatched).toContainEqual({ code: '', discountCents: 0 });
    const applied = section.querySelector('[data-checkout-promo-applied]') as HTMLElement;
    const promoRow = section.querySelector('[data-checkout-promo]') as HTMLElement;
    expect(applied.hidden).toBe(true);
    expect(promoRow.hidden).toBe(false);
  });
});
