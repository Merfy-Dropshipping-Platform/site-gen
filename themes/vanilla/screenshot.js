import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:4322/');
  await page.getByRole('heading', { name: 'Искусство жить уютно' }).click();
  await page.goto('http://localhost:4322/');
});