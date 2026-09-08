import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 1400 } })).newPage();
try {
  await p.goto('https://1dw339dxomuy.merfy.ru/checkout', { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await p.waitForTimeout(2500);
  const hasFooter = await p.locator('footer').count();
  const hasNewsletter = await p.getByText('РАССЫЛКУ', { exact: false }).count();
  console.log('live checkout — <footer> count:', hasFooter, '| РАССЫЛКУ text count:', hasNewsletter);
  await p.screenshot({ path: '.tmp-checkout-live.png', fullPage: true });
  console.log('screenshot saved');
} catch (e) { console.log('ERR', String(e).slice(0,200)); } finally { await b.close(); }
