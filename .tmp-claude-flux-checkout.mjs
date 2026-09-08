import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 1300 } })).newPage();
try {
  await p.goto('https://9j3ukmiyyajt.merfy.ru/checkout', { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await p.waitForTimeout(2500);
  console.log('flux checkout <footer>:', await p.locator('footer').count(), '| РАССЫЛКУ:', await p.getByText('РАССЫЛКУ',{exact:false}).count());
  await p.screenshot({ path: '.tmp-flux-checkout.png', fullPage: true });
} catch(e){console.log('ERR',String(e).slice(0,150));} finally { await b.close(); }
