#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const SITES = {
  rose:    '214dd73c-0f5d-4913-b72f-a25ed5bcd976',
  vanilla: '63ccb1eb-079e-433a-9ddb-f22c9af3f265',
  bloom:   '203bf7c0-a92e-4a55-982e-0a8d2b162ebf',
  satin:   'ccb2f528-10ff-4a26-bd25-e06a65ac09f0',
  flux:    '6c4b7a56-a46b-4960-befb-fa2505a9da71',
};
const BASE = 'https://gateway.merfy.ru';
const OUT = '/tmp/theme-previews';
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
for (const [theme, id] of Object.entries(SITES)) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tab = await ctx.newPage();
  try {
    const resp = await tab.goto(`${BASE}/api/sites/${id}/preview?page=home`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    await tab.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
    await tab.waitForTimeout(1500);
    const buf = await tab.screenshot({ fullPage: true, timeout: 15000 });
    const out = path.join(OUT, `${theme}.png`);
    await fs.writeFile(out, buf);
    console.log(`${theme}: HTTP ${resp?.status()}, ${buf.length} bytes → ${out}`);
  } catch (e) {
    console.log(`${theme}: FAIL - ${e.message}`);
  }
  await ctx.close();
}
await browser.close();
