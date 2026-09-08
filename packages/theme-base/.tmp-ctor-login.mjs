import { chromium } from 'playwright';
const URL = 'https://customize.merfy.ru/?siteId=ef6e5979-c4ea-41d7-a70f-50d79af03ace';
const EMAIL = 'merkul.shop+131@gmail.com';
const PASS = 'merkul.shop+131@gmail.com';
const browser = await chromium.launch({
  headless: true,
  args: ['--host-resolver-rules=MAP *.merfy.ru 176.57.218.121', '--ignore-certificate-errors', '--disable-http2', '--disable-quic'],
});
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
const out = {};
const shot = (n) => page.screenshot({ path: `/tmp/ctor-${n}.png` }).catch(() => {});
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);
  out.urlAfterGoto = page.url();
  await shot('1-initial');

  const email = await page.$('input[type="email"], input[name="email"], input[autocomplete="email"]');
  if (email) {
    out.loginForm = true;
    await email.fill(EMAIL);
    const pass = await page.$('input[type="password"], input[name="password"]');
    if (pass) await pass.fill(PASS);
    await shot('2-filled');
    const btn = await page.$('button[type="submit"]');
    if (btn) await btn.click();
    else if (pass) await pass.press('Enter');
    await page.waitForTimeout(7000);
  } else {
    out.loginForm = false;
  }
  out.urlAfterLogin = page.url();
  await shot('3-afterlogin');

  // ждём редактор: iframe превью + левый outline
  await page.waitForSelector('iframe', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(10000);
  out.iframeCount = (await page.$$('iframe')).length;
  out.title = await page.title();
  // текст верхней панели (дропдаун страниц) + левого outline
  out.topText = await page.$$eval('header *, [class*="EditorHeader" i] *', (els) =>
    Array.from(new Set(els.map((e) => (e.childElementCount === 0 ? (e.textContent || '').trim() : '')).filter((t) => t && t.length < 30))).slice(0, 25),
  ).catch(() => []);
  out.leftText = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('button, [role="button"], li, div'))
      .filter((e) => { const r = e.getBoundingClientRect(); return r.left < 360 && r.width > 40 && r.width < 360 && r.height > 10 && r.height < 60 && e.childElementCount <= 3; })
      .map((e) => (e.textContent || '').trim())
      .filter((t) => t && t.length > 0 && t.length < 40);
    return Array.from(new Set(items)).slice(0, 40);
  }).catch(() => []);
  await shot('4-editor');
  out.ok = true;
} catch (e) {
  out.ok = false; out.error = String(e).slice(0, 300);
}
out.consoleErrors = errs.slice(0, 6);
console.log(JSON.stringify(out, null, 1));
await browser.close();
