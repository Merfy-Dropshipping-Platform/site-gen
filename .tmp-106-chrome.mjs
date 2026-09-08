// Spec 106 — пруф системного скрытия ХРОМА (Header/Footer/PromoBanner вне <main>).
// Постим reconcile БЕЗ хром-блока (= PreviewFrame на скрытие хрома) → проверяем
// что он визуально скрыт (data-rc-hidden + display:none, переживая display:contents),
// __rcProbe жив (нет релоада), ACK ok; потом показываем обратно.
import { chromium } from 'playwright';
const EMAIL = 'merfy-yookassa-2027@mail.ru', SITE = 'f07e4816-3f6d-4c51-a28c-f7b248b0d6d5';
const out = {};
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1512, height: 950 } });
await ctx.request.post('https://gateway.merfy.ru/api/auth/sign-in/email', { headers: { 'Content-Type': 'application/json' }, data: { email: EMAIL, password: EMAIL } });
const page = await ctx.newPage();
await page.goto(`https://customize.merfy.ru/?siteId=${SITE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(13000);
const f = page.frames().find((fr) => /\/preview/.test(fr.url()));
out.frameFound = !!f;
if (!f) { console.log(JSON.stringify({ FAIL: 'no iframe' })); await b.close(); process.exit(1); }

// все блоки + регион (main = body-секции; вне main = хром)
const allBlocks = await f.evaluate(() => {
  const main = document.querySelector('main');
  return [...document.querySelectorAll('[data-puck-component-id]')].map((e) => ({
    id: e.getAttribute('data-puck-component-id'),
    inMain: main ? main.contains(e) : false,
  }));
});
out.chrome = allBlocks.filter((x) => !x.inMain).map((x) => x.id);
out.body = allBlocks.filter((x) => x.inMain).map((x) => x.id);
const target = out.chrome[0];
out.hideTarget = target;
if (!target) { console.log(JSON.stringify({ FAIL: 'no chrome block', out })); await b.close(); process.exit(1); }

await f.evaluate(() => { window.__rcProbe = 'alive'; });
await page.evaluate(() => { window.__acks = []; window.addEventListener('message', (e) => { if (e.data && e.data.type === 'reconcile-ack') window.__acks.push(e.data); }); });

const inspect = (id) => f.evaluate((id) => {
  const e = document.querySelector('[data-puck-component-id="' + id + '"]');
  if (!e) return { found: false };
  let top = e; while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
  return { found: true, rcHidden: top.getAttribute('data-rc-hidden'), topDisplay: getComputedStyle(top).display, visible: e.offsetWidth > 0 || e.offsetHeight > 0 };
}, id);
const postReconcile = (keptIds, version) => page.evaluate(({ keptIds, version }) => {
  const ifr = document.getElementById('preview-frame');
  if (!ifr) return 'no-iframe';
  ifr.contentWindow.postMessage({ type: 'reconcile', pageId: 'home', version, blocks: keptIds.map((id) => ({ id, type: String(id).split('-')[0], props: {}, propsHash: 'x' })) }, '*');
  return 'posted';
}, { keptIds, version });

out.beforeHide = await inspect(target);
// HIDE хром: reconcile со всеми кроме target
const allIds = allBlocks.map((x) => x.id);
out.postHide = await postReconcile(allIds.filter((id) => id !== target), 2000);
await page.waitForTimeout(1500);
out.afterHide = await inspect(target);
out.probeAfterHide = await f.evaluate(() => window.__rcProbe || null);
// SHOW: reconcile со всеми
out.postShow = await postReconcile(allIds, 2001);
await page.waitForTimeout(1500);
out.afterShow = await inspect(target);
out.probeAfterShow = await f.evaluate(() => window.__rcProbe || null);
out.acks = await page.evaluate(() => window.__acks);

out.PASS_chromeHidden = out.afterHide.found && out.afterHide.rcHidden === '1' && out.afterHide.topDisplay === 'none' && out.afterHide.visible === false;
out.PASS_chromeShown = out.afterShow.found && out.afterShow.rcHidden === null && out.afterShow.topDisplay !== 'none' && out.afterShow.visible === true;
out.PASS_noReload = out.probeAfterHide === 'alive' && out.probeAfterShow === 'alive';
out.PASS_acksOk = Array.isArray(out.acks) && out.acks.length >= 2 && out.acks.every((a) => a.ok === true);
out.ALL_PASS = out.PASS_chromeHidden && out.PASS_chromeShown && out.PASS_noReload && out.PASS_acksOk;
console.log(JSON.stringify(out, null, 2));
await b.close();
