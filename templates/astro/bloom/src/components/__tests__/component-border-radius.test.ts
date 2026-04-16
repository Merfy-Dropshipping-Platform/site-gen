/**
 * Tests that Bloom theme COMPONENT files use CSS variable references
 * for border-radius instead of hardcoded `border-radius: 0`.
 *
 * Allowed patterns:
 *   - var(--radius-button)
 *   - var(--radius-card)
 *   - var(--radius-input, var(--radius-button))
 *   - Compound values like `border-radius: 0 0 12px 12px` (partial radii)
 *   - border-radius: 50% (circles like spinners)
 *   - border-radius: 100px (pill shapes like counters)
 *
 * Disallowed:
 *   - border-radius: 0  (bare zero -- should use a CSS variable)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BLOOM_COMPONENTS = path.resolve(__dirname, '..');

/**
 * Matches `border-radius: 0` that is NOT part of a compound value.
 * Looks for border-radius:\s*0 followed by a terminator (;, ", ', }, EOL).
 */
const HARDCODED_ZERO_RE = /border-radius:\s*0\s*[;"'}\n]/g;

function readComponent(fileName: string): string {
  const full = path.join(BLOOM_COMPONENTS, fileName);
  return fs.readFileSync(full, 'utf-8');
}

function findHardcodedZeroRadius(content: string): { line: number; text: string }[] {
  const lines = content.split('\n');
  const hits: { line: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    HARDCODED_ZERO_RE.lastIndex = 0;

    if (HARDCODED_ZERO_RE.test(line)) {
      // Skip compound values like "0 0 12px 12px"
      if (/border-radius:\s*0\s+\d/.test(line)) continue;
      hits.push({ line: i + 1, text: line.trim() });
    }
  }

  return hits;
}

// ----------------------------------------------------------------
// 1. Product.astro  (10 occurrences expected to be fixed)
// ----------------------------------------------------------------
describe('Product.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0', () => {
    const content = readComponent('Product.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in Product.astro:\n${details}`);
    }
  });

  it('should use var(--radius-card) for image containers', () => {
    const content = readComponent('Product.astro');
    // Image containers in two-columns, carousel/thumbnail, stacked layouts
    const imageContainerMatches = (content.match(/border-radius:\s*var\(--radius-card/g) || []).length;
    expect(imageContainerMatches).toBeGreaterThanOrEqual(5);
  });

  it('should use var(--radius-button) for variant tabs', () => {
    const content = readComponent('Product.astro');
    expect(content).toContain('var(--radius-button)');
  });

  it('should use var(--radius-button) for quantity controls', () => {
    const content = readComponent('Product.astro');
    // The qty -/+ buttons should reference var(--radius-button)
    const qtySection = content.split('Количество')[1] || '';
    expect(qtySection).toContain('var(--radius-button)');
  });

  it('should use var(--radius-button) for add-to-cart button', () => {
    const content = readComponent('Product.astro');
    // Find the button element that contains the add-to-cart text
    const lines = content.split('\n');
    const addToCartIdx = lines.findIndex(l => l.includes('Добавить в корзину'));
    // The button style is on a line above the text
    if (addToCartIdx > 0) {
      const surroundingLines = lines.slice(Math.max(0, addToCartIdx - 5), addToCartIdx + 1).join('\n');
      expect(surroundingLines).toContain('var(--radius-button)');
    }
  });

  it('should use var(--radius-button) for buy-now button', () => {
    const content = readComponent('Product.astro');
    const buyNowLine = content.split('\n').find(l => l.includes('buyNow') && l.includes('border-radius'));
    if (buyNowLine) {
      expect(buyNowLine).toContain('var(--radius-button)');
    }
  });
});

// ----------------------------------------------------------------
// 2. CheckoutSection.astro  (18 occurrences in style block)
// ----------------------------------------------------------------
describe('CheckoutSection.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0 (excluding compound values)', () => {
    const content = readComponent('CheckoutSection.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in CheckoutSection.astro:\n${details}`);
    }
  });

  it('.checkout-input should use var(--radius-input)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-input\s*\{[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('.checkout-submit-btn should use var(--radius-button)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-submit-btn\s*\{[\s\S]*?border-radius:\s*var\(--radius-button\)/);
  });

  it('.checkout-shipping-option should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-shipping-option\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-promo-row should use var(--radius-input)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-promo-row\s*\{[\s\S]*?border-radius:\s*var\(--radius-input/);
  });

  it('.checkout-promo-btn should use var(--radius-button)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-promo-btn\s*\{[\s\S]*?border-radius:\s*var\(--radius-button\)/);
  });

  it('.checkout-promo-applied should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-promo-applied\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-product-img should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-product-img\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-dadata-suggestions should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-dadata-suggestions\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-address-selected should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-address-selected\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-pvz-item should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-pvz-item\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-pvz-badge should use var(--radius-button)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-pvz-badge\s*\{[\s\S]*?border-radius:\s*var\(--radius-button/);
  });

  it('.checkout-pvz-error should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-pvz-error\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-shipping-badge should use var(--radius-button)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-shipping-badge\s*\{[\s\S]*?border-radius:\s*var\(--radius-button/);
  });

  it('delivery placeholder/error/unavailable should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-delivery-placeholder[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-delivery-loading should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-delivery-loading\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-dadata-item:first-child should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-dadata-item:first-child\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });

  it('.checkout-dadata-item:only-child should use var(--radius-card)', () => {
    const content = readComponent('CheckoutSection.astro');
    expect(content).toMatch(/\.checkout-dadata-item:only-child\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });
});

// ----------------------------------------------------------------
// 3. CartSection.astro  (1 occurrence)
// ----------------------------------------------------------------
describe('CartSection.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0', () => {
    const content = readComponent('CartSection.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in CartSection.astro:\n${details}`);
    }
  });

  it('checkout link button should use var(--radius-button)', () => {
    const content = readComponent('CartSection.astro');
    expect(content).toContain('var(--radius-button)');
  });
});

// ----------------------------------------------------------------
// 4. Newsletter.astro  (2 occurrences)
// ----------------------------------------------------------------
describe('Newsletter.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0', () => {
    const content = readComponent('Newsletter.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in Newsletter.astro:\n${details}`);
    }
  });

  it('form wrapper should use var(--radius-input)', () => {
    const content = readComponent('Newsletter.astro');
    // The <form> element border-radius
    const formLine = content.split('\n').find(l => l.includes('form') || l.includes('<form'));
    // Check that somewhere the form uses var(--radius-input)
    expect(content).toMatch(/border-radius:\s*var\(--radius-input/);
  });

  it('submit button should use var(--radius-button)', () => {
    const content = readComponent('Newsletter.astro');
    expect(content).toContain('var(--radius-button)');
  });
});

// ----------------------------------------------------------------
// 5. AccountNav.astro  (2 occurrences)
// ----------------------------------------------------------------
describe('AccountNav.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0', () => {
    const content = readComponent('AccountNav.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in AccountNav.astro:\n${details}`);
    }
  });

  it('email-verify-banner should use var(--radius-card)', () => {
    const content = readComponent('AccountNav.astro');
    expect(content).toMatch(/email-verify-banner[\s\S]*?var\(--radius-card/);
  });

  it('.account-nav-link CSS rule should use var(--radius-card)', () => {
    const content = readComponent('AccountNav.astro');
    expect(content).toMatch(/\.account-nav-link\s*\{[\s\S]*?border-radius:\s*var\(--radius-card/);
  });
});

// ----------------------------------------------------------------
// 6. ImageWithText.astro  (1 occurrence)
// ----------------------------------------------------------------
describe('ImageWithText.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0', () => {
    const content = readComponent('ImageWithText.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in ImageWithText.astro:\n${details}`);
    }
  });

  it('CTA button outline variant should use var(--radius-button)', () => {
    const content = readComponent('ImageWithText.astro');
    // The button with border style should use var(--radius-button)
    const buttonLines = content.split('\n').filter(l => l.includes('border-radius') && l.includes('border:'));
    for (const line of buttonLines) {
      expect(line).toContain('var(--radius-button)');
    }
  });
});

// ----------------------------------------------------------------
// 7. MultiRows.astro  (2 occurrences in JS ternary)
// ----------------------------------------------------------------
describe('MultiRows.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0', () => {
    const content = readComponent('MultiRows.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in MultiRows.astro:\n${details}`);
    }
  });

  it('both button style variants should use var(--radius-button)', () => {
    const content = readComponent('MultiRows.astro');
    // Find the ternary that sets buttonStyle
    const ternaryLine = content.split('\n').find(l => l.includes('buttonStyle') && l.includes('border-radius'));
    if (ternaryLine) {
      // Both sides of the ternary should have var(--radius-button)
      const matches = ternaryLine.match(/var\(--radius-button\)/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ----------------------------------------------------------------
// 8. TextBlock.astro  (1 occurrence)
// ----------------------------------------------------------------
describe('TextBlock.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0', () => {
    const content = readComponent('TextBlock.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in TextBlock.astro:\n${details}`);
    }
  });

  it('CTA button should use var(--radius-button)', () => {
    const content = readComponent('TextBlock.astro');
    expect(content).toContain('var(--radius-button)');
  });
});

// ----------------------------------------------------------------
// 9. ProductGrid.astro  (1 occurrence in style block)
// ----------------------------------------------------------------
describe('ProductGrid.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0', () => {
    const content = readComponent('ProductGrid.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in ProductGrid.astro:\n${details}`);
    }
  });

  it('.view-btn should use var(--radius-button)', () => {
    const content = readComponent('ProductGrid.astro');
    expect(content).toMatch(/\.view-btn\s*\{[\s\S]*?border-radius:\s*var\(--radius-button\)/);
  });
});

// ----------------------------------------------------------------
// 10. Hero.astro  (verify both buttons are fixed)
// ----------------------------------------------------------------
describe('Hero.astro: no hardcoded border-radius: 0', () => {
  it('should have no hardcoded border-radius: 0', () => {
    const content = readComponent('Hero.astro');
    const hits = findHardcodedZeroRadius(content);
    if (hits.length > 0) {
      const details = hits.map((h) => `  Line ${h.line}: ${h.text}`).join('\n');
      expect.fail(`Found ${hits.length} hardcoded border-radius: 0 in Hero.astro:\n${details}`);
    }
  });

  it('both primary and secondary buttons should use var(--radius-button)', () => {
    const content = readComponent('Hero.astro');
    const buttonRadiusMatches = (content.match(/border-radius:\s*var\(--radius-button/g) || []).length;
    // 4 total: container-primary, container-secondary, non-container-primary, non-container-secondary
    expect(buttonRadiusMatches).toBeGreaterThanOrEqual(4);
  });
});
