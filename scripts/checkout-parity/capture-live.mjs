#!/usr/bin/env node
// Capture live screenshots of /checkout via Playwright.
// Output: docs/checkout-parity/live-crops/<Block>.png — clipped to each
// data-checkout-slot region for direct side-by-side with figma-crops/.
//
// Usage: node scripts/checkout-parity/capture-live.mjs [--site URL] [--product PID]

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE = process.argv.includes('--site')
  ? process.argv[process.argv.indexOf('--site') + 1]
  : 'https://51f7c94c2da6.merfy.ru';
const PID = process.argv.includes('--product')
  ? process.argv[process.argv.indexOf('--product') + 1]
  : '87';

// Map slot id (used in data-checkout-slot) → block file name (matches figma-crops/)
const SLOT_TO_BLOCK = {
  header: 'CheckoutHeader',
  contact: 'CheckoutContactForm',
  delivery: 'CheckoutDeliveryForm',
  'delivery-method': 'CheckoutDeliveryMethod',
  payment: 'CheckoutPayment',
  'order-summary': 'CheckoutOrderSummary',
  totals: 'CheckoutTotals',
  submit: 'CheckoutSubmit',
  terms: 'CheckoutTerms',
};

const OUT_DIR = resolve(process.cwd(), 'docs/checkout-parity/live-crops');
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
});

const page = await ctx.newPage();

// Seed cart with product+variant via localStorage before navigating
await page.addInitScript(({ pid }) => {
  const cart = {
    id: `verify-${Date.now()}`,
    items: [
      {
        id: 'item-1',
        productId: pid,
        name: 'Сумка',
        unitPriceCents: 549000,
        compareAtPriceCents: 899000,
        quantity: 1,
        imageUrl: '',
        variants: { 'Цвет': 'Бежевый', 'Размер': 'One-size', 'Материал': 'Кожа' },
      },
      {
        id: 'item-2',
        productId: pid,
        name: 'Сумка',
        unitPriceCents: 549000,
        compareAtPriceCents: 899000,
        quantity: 1,
        imageUrl: '',
        variants: { 'Цвет': 'Бежевый', 'Размер': 'One-size', 'Материал': 'Кожа' },
      },
    ],
  };
  localStorage.setItem('merfy:cart', JSON.stringify(cart));
  localStorage.setItem('merfy:cartId', cart.id);
}, { pid: PID });

const url = `${SITE}/checkout?productId=${PID}`;
console.log(`→ navigate ${url}`);
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000); // let React hydrate

// Full-page screenshot
const fullPath = resolve(OUT_DIR, '_full-page.png');
await page.screenshot({ path: fullPath, fullPage: true });
console.log(`✓ saved ${fullPath}`);

// Per-slot screenshots
for (const [slot, blockName] of Object.entries(SLOT_TO_BLOCK)) {
  const sel = `[data-checkout-slot="${slot}"]`;
  const el = await page.$(sel);
  if (!el) {
    console.warn(`  ⊘ slot=${slot} not found`);
    continue;
  }
  const out = resolve(OUT_DIR, `${blockName}.png`);
  try {
    await el.screenshot({ path: out });
    console.log(`✓ ${blockName} (slot=${slot})`);
  } catch (e) {
    console.warn(`  ✗ ${blockName}: ${e.message}`);
  }
}

await browser.close();
console.log(`\nDone. ${Object.keys(SLOT_TO_BLOCK).length} blocks captured to ${OUT_DIR}`);
