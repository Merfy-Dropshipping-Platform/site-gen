/**
 * Tests that Bloom theme store pages use CSS variable references
 * for border-radius instead of hardcoded `border-radius: 0`.
 *
 * Allowed patterns:
 *   - var(--radius-button)
 *   - var(--radius-card)
 *   - var(--radius-input, var(--radius-button))
 *   - Compound values like `border-radius: 0 0 12px 12px` (partial radii)
 *   - border-radius: 50% (circles like spinners)
 *   - border-radius with non-zero fixed values (e.g., 4px) in non-store elements
 *
 * Disallowed:
 *   - border-radius: 0  (bare zero — should use a CSS variable)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BLOOM_PAGES = path.resolve(__dirname, '../../pages');

/**
 * Matches `border-radius: 0` that is NOT part of a compound value
 * like `0 0 12px 12px`.  We look for `border-radius:\s*0` followed
 * by a terminator (`;`, `"`, `'`, `}`, end-of-line) — meaning the
 * value is just the single token `0`.
 */
const HARDCODED_ZERO_RE = /border-radius:\s*0\s*[;"'}\n]/g;

/** Files that must be checked */
const TARGET_FILES = [
  'cart.astro',
  'login.astro',
  'register.astro',
  'reset-password.astro',
  'contacts.astro',
  'checkout-result.astro',
  'checkout/result.astro',
];

function readFile(relPath: string): string {
  const full = path.join(BLOOM_PAGES, relPath);
  return fs.readFileSync(full, 'utf-8');
}

function findHardcodedZeroRadius(content: string): { line: number; text: string }[] {
  const lines = content.split('\n');
  const hits: { line: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Reset regex state
    HARDCODED_ZERO_RE.lastIndex = 0;

    if (HARDCODED_ZERO_RE.test(line)) {
      hits.push({ line: i + 1, text: line.trim() });
    }
  }

  return hits;
}

describe('Bloom theme: no hardcoded border-radius: 0', () => {
  for (const file of TARGET_FILES) {
    it(`${file} should have no hardcoded border-radius: 0`, () => {
      const content = readFile(file);
      const hits = findHardcodedZeroRadius(content);

      if (hits.length > 0) {
        const details = hits
          .map((h) => `  Line ${h.line}: ${h.text}`)
          .join('\n');
        expect.fail(
          `Found ${hits.length} hardcoded border-radius: 0 in ${file}:\n${details}`,
        );
      }
    });
  }

  it('cart.astro should use var(--radius-button) for checkout button', () => {
    const content = readFile('cart.astro');
    expect(content).toContain('var(--radius-button)');
  });

  it('cart.astro should use var(--radius-card) for cart item images', () => {
    const content = readFile('cart.astro');
    expect(content).toContain('var(--radius-card)');
  });

  it('login.astro should use var(--radius-button) for submit button in style block', () => {
    const content = readFile('login.astro');
    // The .login-submit-btn CSS rule should use the variable
    expect(content).toMatch(/\.login-submit-btn[\s\S]*?border-radius:\s*var\(--radius-button\)/);
  });

  it('login.astro should use var(--radius-input) for input fields', () => {
    const content = readFile('login.astro');
    expect(content).toContain('var(--radius-input');
  });

  it('register.astro should use var(--radius-button) for submit button in style block', () => {
    const content = readFile('register.astro');
    expect(content).toMatch(/\.login-submit-btn[\s\S]*?border-radius:\s*var\(--radius-button\)/);
  });

  it('register.astro should use var(--radius-input) for input fields', () => {
    const content = readFile('register.astro');
    expect(content).toContain('var(--radius-input');
  });

  it('reset-password.astro should use var(--radius-button) for submit button in style block', () => {
    const content = readFile('reset-password.astro');
    expect(content).toMatch(/\.login-submit-btn[\s\S]*?border-radius:\s*var\(--radius-button\)/);
  });

  it('reset-password.astro should use var(--radius-input) for input fields', () => {
    const content = readFile('reset-password.astro');
    expect(content).toContain('var(--radius-input');
  });

  it('contacts.astro should use var(--radius-button) for submit button', () => {
    const content = readFile('contacts.astro');
    expect(content).toContain('var(--radius-button)');
  });

  it('contacts.astro should use var(--radius-input) for input/textarea fields', () => {
    const content = readFile('contacts.astro');
    expect(content).toContain('var(--radius-input');
  });

  it('checkout-result.astro should use var(--radius-card) for tracking container', () => {
    const content = readFile('checkout-result.astro');
    expect(content).toContain('var(--radius-card)');
  });

  it('checkout/result.astro should use var(--radius-button) for action buttons', () => {
    const content = readFile('checkout/result.astro');
    expect(content).toContain('var(--radius-button)');
  });

  it('checkout/result.astro should use var(--radius-card) for order number display', () => {
    const content = readFile('checkout/result.astro');
    expect(content).toContain('var(--radius-card)');
  });
});
