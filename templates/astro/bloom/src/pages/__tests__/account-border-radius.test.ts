/**
 * Tests that Bloom theme account pages use CSS variable references
 * for border-radius instead of hardcoded `border-radius: 0`.
 *
 * Rules:
 * - Buttons: var(--radius-button)
 * - Cards, containers, order cards: var(--radius-card)
 * - Input fields: var(--radius-input, var(--radius-button))
 * - Modals: var(--radius-card)
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const accountDir = resolve(__dirname, '..');

function readPage(name: string): string {
  return readFileSync(resolve(accountDir, name), 'utf-8');
}

describe('Account pages: no hardcoded border-radius: 0', () => {
  const pages = [
    'account/index.astro',
    'account/profile.astro',
    'account/orders.astro',
    'account/order.astro',
  ];

  for (const page of pages) {
    it(`${page} must not contain border-radius: 0 or border-radius:0`, () => {
      const content = readPage(page);
      // Match both spaced and unspaced variants, but not var(...) references
      const matches = content.match(/border-radius\s*:\s*0[^.0-9]/g) || [];
      expect(
        matches.length,
        `Found ${matches.length} hardcoded border-radius:0 in ${page}:\n${matches.join('\n')}`,
      ).toBe(0);
    });
  }
});

describe('account/index.astro uses correct CSS variables', () => {
  it('welcome card div uses var(--radius-card)', () => {
    const content = readPage('account/index.astro');
    expect(content).toContain('border-radius: var(--radius-card)');
  });

  it('"Мои заказы" button uses var(--radius-button)', () => {
    const content = readPage('account/index.astro');
    // The button linking to orders in the welcome section (in JS innerHTML)
    expect(content).toMatch(/border-radius:var\(--radius-button\)">Мои заказы/);
  });

  it('"Профиль" button uses var(--radius-button)', () => {
    const content = readPage('account/index.astro');
    expect(content).toMatch(/border-radius:var\(--radius-button\);color.*">Профиль/);
  });

  it('recent order cards use var(--radius-card)', () => {
    const content = readPage('account/index.astro');
    // The order link cards in JS template literal
    expect(content).toMatch(/class="block p-4[^"]*"[^>]*border-radius:var\(--radius-card\)/);
  });
});

describe('account/profile.astro uses correct CSS variables', () => {
  it('email input uses var(--radius-input)', () => {
    const content = readPage('account/profile.astro');
    expect(content).toMatch(/id="profile-email"[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('name input uses var(--radius-input)', () => {
    const content = readPage('account/profile.astro');
    expect(content).toMatch(/id="profile-name"[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('phone input uses var(--radius-input)', () => {
    const content = readPage('account/profile.astro');
    expect(content).toMatch(/id="profile-phone"[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('city input uses var(--radius-input)', () => {
    const content = readPage('account/profile.astro');
    expect(content).toMatch(/id="addr-city"[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('street input uses var(--radius-input)', () => {
    const content = readPage('account/profile.astro');
    expect(content).toMatch(/id="addr-street"[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('building input uses var(--radius-input)', () => {
    const content = readPage('account/profile.astro');
    expect(content).toMatch(/id="addr-building"[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('apartment input uses var(--radius-input)', () => {
    const content = readPage('account/profile.astro');
    expect(content).toMatch(/id="addr-apartment"[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('postal code input uses var(--radius-input)', () => {
    const content = readPage('account/profile.astro');
    expect(content).toMatch(/id="addr-postal"[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('save button uses var(--radius-button)', () => {
    const content = readPage('account/profile.astro');
    // id="btn-save" is after style= in the attribute order
    expect(content).toMatch(/border-radius:\s*var\(--radius-button\);[^>]*id="btn-save"/);
  });
});

describe('account/orders.astro uses correct CSS variables', () => {
  it('catalog link button uses var(--radius-button)', () => {
    const content = readPage('account/orders.astro');
    expect(content).toMatch(/href="\/catalog"[^>]*border-radius:\s*var\(--radius-button\)/);
  });

  it('retry button uses var(--radius-button)', () => {
    const content = readPage('account/orders.astro');
    // The "Попробовать снова" button
    expect(content).toMatch(/onclick="window\.location\.reload\(\)"[^>]*border-radius:\s*var\(--radius-button\)/);
  });

  it('order cards in JS use var(--radius-card)', () => {
    const content = readPage('account/orders.astro');
    // card.style.cssText assignment in JS
    expect(content).toMatch(/style\.cssText\s*=\s*'[^']*border-radius:\s*var\(--radius-card\)/);
  });

  it('load-more button in JS uses var(--radius-button)', () => {
    const content = readPage('account/orders.astro');
    // loadMoreBtn.style.cssText assignment in JS
    expect(content).toMatch(/loadMoreBtn\.style\.cssText\s*=\s*'[^']*border-radius:\s*var\(--radius-button\)/);
  });
});

describe('account/order.astro uses correct CSS variables', () => {
  it('order info card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    // infoHtml is multi-line string concat; just check the relevant line
    expect(content).toMatch(/infoHtml\s*=[\s\S]*?border-radius:var\(--radius-card\)/);
  });

  it('items card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    // itemsHtml opening tag
    expect(content).toMatch(/var itemsHtml = '<div[^']*border-radius:var\(--radius-card\)/);
  });

  it('totals card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    expect(content).toMatch(/var totalsHtml = '<div[^']*border-radius:var\(--radius-card\)/);
  });

  it('customer info card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    expect(content).toMatch(/customerHtml = '<div[^']*border-radius:var\(--radius-card\)/);
  });

  it('address card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    expect(content).toMatch(/addressHtml =[\s\S]*?border-radius:var\(--radius-card\)/);
  });

  it('CDEK delivery card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    // CDEK section: "Доставка СДЭК" heading follows the border-radius assignment
    expect(content).toMatch(/Delivery tracking card \(CDEK\)[\s\S]*?border-radius:var\(--radius-card\)/);
  });

  it('pickup delivery card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    // Pickup section: "Самовывоз" heading follows the border-radius assignment
    expect(content).toMatch(/T030: Pickup delivery info[\s\S]*?border-radius:var\(--radius-card\)/);
  });

  it('custom delivery card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    // Custom delivery section (line with Доставка heading that is NOT CDEK)
    expect(content).toMatch(/T031: Custom delivery[\s\S]*?border-radius:var\(--radius-card\)/);
  });

  it('history card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    expect(content).toMatch(/historyHtml = '<div[^']*border-radius:var\(--radius-card\)/);
  });

  it('cancel card uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    expect(content).toMatch(/cancelHtml =[\s\S]*?border-radius:var\(--radius-card\)/);
  });

  it('modal container uses var(--radius-card)', () => {
    const content = readPage('account/order.astro');
    // modal div with shadow-xl + max-w-md in class, radius in style
    expect(content).toMatch(/class="shadow-xl max-w-md[^"]*"[^>]*border-radius:var\(--radius-card\)/);
  });

  it('modal does not have the border-radius:0 max-w-md syntax error', () => {
    const content = readPage('account/order.astro');
    // Previously had "border-radius:0 max-w-md" which mixes CSS value with Tailwind class
    expect(content).not.toContain('border-radius:0 max-w-md');
  });
});
