/**
 * @jest-environment jsdom
 *
 * Integration test for the Product deep-link variant anchor (Phase 1) wired
 * into the Product.astro `<script is:inline>` hydration script.
 *
 * `<script is:inline>` cannot be imported (Astro inlines it verbatim, no bundle),
 * so — following the CheckoutOrderSummary / preview-nav-agent precedent — we
 * extract the hydration script body from the .astro source and execute it in
 * jsdom with the `define:vars` (siteId, apiBase, productId, blockId) injected,
 * then drive the two flows:
 *   • URL → auto-select  (parse ?opt.* on load, dispatch synthetic chip/select events)
 *   • select → URL       (writeVariantAnchor → history.replaceState on every pick)
 *
 * ANTI-DRIFT: the inline mirror's produced URL is asserted EQUAL to the pure
 * module `variantAnchor.ts` output (imported below as the oracle). If the inline
 * copy and the module diverge (prefix, encoding, merge rules), these fail.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseVariantAnchor,
  serializeVariantAnchor,
  writeVariantAnchorToSearch,
} from '../blocks/Product/variantAnchor';

const ASTRO = join(__dirname, '..', 'blocks', 'Product', 'Product.astro');

/** Body of the `is:inline define:vars` hydration script (not the JSON-LD one). */
function hydrationScriptBody(src: string): string {
  const m = /<script\b[^>]*\bdefine:vars[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('hydration <script define:vars> not found in Product.astro');
  return m[1];
}

const SCRIPT = hydrationScriptBody(readFileSync(ASTRO, 'utf8'));

/** SSR-like markup: Цвет as chips (Белый default-active, Нет out-of-stock), Размер as <select>. */
function mountDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-block="product" data-puck-component-id="prod-1">
      <div data-product-variants>
        <div data-variant-group data-variant-key="Цвет">
          <button type="button" data-variant-chip data-variant-key="Цвет" data-variant-value="Белый" data-variant-active="true">Белый</button>
          <button type="button" data-variant-chip data-variant-key="Цвет" data-variant-value="Синий" data-variant-active="false">Синий</button>
          <button type="button" data-variant-chip data-variant-key="Цвет" data-variant-value="Нет" data-variant-available="false" data-variant-active="false">Нет</button>
        </div>
        <div data-variant-group data-variant-key="Размер">
          <select data-variant-select data-variant-key="Размер">
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
          </select>
        </div>
      </div>
    </section>`;
  return document.querySelector('[data-puck-component-id="prod-1"]') as HTMLElement;
}

/** Execute the hydration IIFE the way Astro's define:vars would. */
function run(section: HTMLElement): void {
  (window as any).__merfyRoot = () => section;
  // The script's bare `fetch(...)` resolves against globalThis (node has global fetch).
  (globalThis as any).fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  // define:vars order: siteId, apiBase, productId, blockId.
  // eslint-disable-next-line no-new-func
  new Function('siteId', 'apiBase', 'productId', 'blockId', SCRIPT)('', '', '', 'prod-1');
}

function chip(section: HTMLElement, key: string, val: string): HTMLButtonElement {
  const found = (Array.from(section.querySelectorAll('[data-variant-chip]')) as HTMLButtonElement[]).find(
    (c) => c.getAttribute('data-variant-key') === key && c.getAttribute('data-variant-value') === val,
  );
  if (!found) throw new Error(`chip not found: ${key}=${val}`);
  return found;
}

function active(section: HTMLElement, key: string, val: string): string | null {
  return chip(section, key, val).getAttribute('data-variant-active');
}

describe('apply: URL ?opt.* → auto-select on load', () => {
  beforeEach(() => window.history.replaceState({}, '', '/product/tshirt'));

  it('selects the anchored chip and dropdown value', () => {
    const search = serializeVariantAnchor({ Цвет: 'Синий', Размер: 'M' });
    window.history.replaceState({}, '', '/product/tshirt?' + search);
    const section = mountDom();
    run(section);
    expect(active(section, 'Цвет', 'Синий')).toBe('true');
    expect(active(section, 'Цвет', 'Белый')).toBe('false');
    expect((section.querySelector('[data-variant-select]') as HTMLSelectElement).value).toBe('M');
  });

  it('does NOT rewrite the URL while applying (reading must not push params)', () => {
    const search = serializeVariantAnchor({ Цвет: 'Синий' });
    window.history.replaceState({}, '', '/product/tshirt?' + search);
    const section = mountDom();
    run(section);
    expect(window.location.search).toBe('?' + search);
  });

  it('soft: unknown/renamed value is ignored (default stays), no throw', () => {
    window.history.replaceState({}, '', '/product/tshirt?opt.Цвет=НетТакого&opt.Размер=M');
    const section = mountDom();
    expect(() => run(section)).not.toThrow();
    expect(active(section, 'Цвет', 'Белый')).toBe('true'); // SSR default kept
    expect((section.querySelector('[data-variant-select]') as HTMLSelectElement).value).toBe('M'); // known axis applied
  });

  it('soft: out-of-stock anchored value is not selected', () => {
    window.history.replaceState({}, '', '/product/tshirt?opt.Цвет=Нет');
    const section = mountDom();
    run(section);
    expect(active(section, 'Цвет', 'Нет')).toBe('false');
    expect(active(section, 'Цвет', 'Белый')).toBe('true');
  });

  it('no ?opt.* → nothing selected beyond SSR default, no throw', () => {
    const section = mountDom();
    expect(() => run(section)).not.toThrow();
    expect(active(section, 'Цвет', 'Белый')).toBe('true');
    expect(active(section, 'Цвет', 'Синий')).toBe('false');
  });
});

describe('write: variant pick → URL via history.replaceState', () => {
  beforeEach(() => window.history.replaceState({}, '', '/product/tshirt'));

  it('writes ?opt.* preserving pathname + foreign params, matching the module', () => {
    window.history.replaceState({}, '', '/product/tshirt?ref=keep');
    const section = mountDom();
    run(section);
    chip(section, 'Цвет', 'Синий').click();
    const expected = writeVariantAnchorToSearch('ref=keep', { Цвет: 'Синий' });
    expect(window.location.pathname).toBe('/product/tshirt');
    expect(window.location.search).toBe('?' + expected); // inline output === module oracle
    expect(new URLSearchParams(window.location.search).get('ref')).toBe('keep');
  });

  it('merges a second axis (dropdown) without dropping the first', () => {
    const section = mountDom();
    run(section);
    chip(section, 'Цвет', 'Синий').click();
    const sel = section.querySelector('[data-variant-select]') as HTMLSelectElement;
    sel.value = 'M';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(parseVariantAnchor(window.location.search)).toEqual({ Цвет: 'Синий', Размер: 'M' });
    expect(window.location.search).toBe('?' + writeVariantAnchorToSearch('', { Цвет: 'Синий', Размер: 'M' }));
  });

  it('re-selecting an axis replaces it (no duplicate opt.* keys)', () => {
    const section = mountDom();
    run(section);
    chip(section, 'Цвет', 'Синий').click();
    chip(section, 'Цвет', 'Белый').click();
    expect(new URLSearchParams(window.location.search).getAll('opt.Цвет')).toEqual(['Белый']);
  });

  it('uses replaceState — does not grow history length', () => {
    const section = mountDom();
    run(section);
    const before = window.history.length;
    chip(section, 'Цвет', 'Синий').click();
    chip(section, 'Цвет', 'Белый').click();
    expect(window.history.length).toBe(before);
  });
});

describe('preview iframe: URL untouched (Phase 2 territory)', () => {
  afterEach(() => Object.defineProperty(window, 'parent', { value: window, configurable: true }));

  it('does not write to the URL on select when inside an iframe', () => {
    window.history.replaceState({}, '', '/product/tshirt');
    Object.defineProperty(window, 'parent', { get() { throw new Error('cross-origin'); }, configurable: true });
    const section = mountDom();
    run(section);
    chip(section, 'Цвет', 'Синий').click();
    expect(window.location.search).toBe('');
  });

  it('does not auto-select from the URL when inside an iframe', () => {
    window.history.replaceState({}, '', '/product/tshirt?' + serializeVariantAnchor({ Цвет: 'Синий' }));
    Object.defineProperty(window, 'parent', { value: {}, configurable: true });
    const section = mountDom();
    run(section);
    expect(active(section, 'Цвет', 'Синий')).toBe('false');
    expect(active(section, 'Цвет', 'Белый')).toBe('true');
  });
});
