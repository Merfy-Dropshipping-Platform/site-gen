import { test, expect } from '@playwright/test';

test('Take homepage screenshots', async ({ page }) => {
  // Desktop view
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:4324/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: './screenshots/homepage-desktop.png', fullPage: true });

  // Mobile view
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: './screenshots/homepage-mobile.png', fullPage: true });
});

test('Take catalog screenshots', async ({ page }) => {
  // Desktop view
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:4324/catalog/textile');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: './screenshots/catalog-desktop.png', fullPage: true });

  // Mobile view
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: './screenshots/catalog-mobile.png', fullPage: true });
});

test('Take product page screenshots', async ({ page }) => {
  // Desktop view
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:4324/products/bag-1');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: './screenshots/product-desktop.png', fullPage: true });

  // Mobile view
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: './screenshots/product-mobile.png', fullPage: true });
});

test('Take auth page screenshots', async ({ page }) => {
  // Desktop view
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:4324/auth/sign-in');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: './screenshots/signin-desktop.png', fullPage: true });

  // Mobile view
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: './screenshots/signin-mobile.png', fullPage: true });
});
