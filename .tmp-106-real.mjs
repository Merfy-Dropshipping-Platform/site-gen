// Spec 106 US1 — РЕАЛЬНЫЙ E2E: клик «Скрыть секцию» в аутлайне (сценарий юзера).
// Проверяет полный путь PreviewFrame(классификация)→reconcile→runtime: body-секция
// исчезает из <main> БЕЗ релоада (__rcProbe жив), приходит reconcile-ack, потом
// «Показать» возвращает её. Это закрывает T008+T013 настоящим кликом, не postMessage.
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
if (!f) { console.log(JSON.stringify({ FAIL: 'no iframe', out })); await b.close(); process.exit(1); }
const mainIds = () => f.evaluate(() => { const m = document.querySelector('main'); return m ? [...m.querySelectorAll('[data-puck-component-id]')].map((e) => e.getAttribute('data-puck-component-id')) : []; });

out.idsBefore = await mainIds();
await f.evaluate(() => { window.__rcProbe = 'alive'; });
await page.evaluate(() => { window.__acks = []; window.addEventListener('message', (e) => { if (e.data && e.data.type === 'reconcile-ack') window.__acks.push(e.data); }); });

// hover body-секцию (drag-handle nth(1)) — controls (скрыть/удалить) могут
// conditionally-рендериться по hover.
try {
  const drags = page.locator('[aria-label="Перетащить секцию"]');
  out.dragCount = await drags.count();
  if (out.dragCount >= 2) { await drags.nth(1).hover({ timeout: 4000 }); await page.waitForTimeout(800); }
} catch (e) { out.hoverErr = String(e).slice(0, 60); }

// === РЕАЛЬНЫЙ клик «Скрыть секцию» для body-секции ===
out.hideClick = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button[aria-label="Скрыть секцию"]')];
  if (!btns.length) return 'no-btn';
  const idx = btns.length >= 2 ? 1 : 0; // body: Header=0, body=1, Footer=2
  btns[idx].click();
  return 'clicked idx=' + idx + ' of ' + btns.length;
});
await page.waitForTimeout(2500);
out.idsAfterHide = await mainIds();
out.probeAfterHide = await f.evaluate(() => window.__rcProbe || null);
out.acksAfterHide = await page.evaluate(() => window.__acks.length);

// === РЕАЛЬНЫЙ клик «Показать секцию» ===
out.showClick = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button[aria-label="Показать секцию"]')];
  if (!btns.length) return 'no-show-btn';
  btns[0].click();
  return 'clicked of ' + btns.length;
});
await page.waitForTimeout(2500);
out.idsAfterShow = await mainIds();
out.probeAfterShow = await f.evaluate(() => window.__rcProbe || null);
out.acks = await page.evaluate(() => window.__acks);

await page.screenshot({ path: '/tmp/106-real.png' });

out.PASS_hideRemoved = out.idsAfterHide.length === out.idsBefore.length - 1;
out.PASS_hideSentReconcile = out.acksAfterHide >= 1;
out.PASS_noReloadHide = out.probeAfterHide === 'alive';
out.PASS_showRestored = out.idsAfterShow.length === out.idsBefore.length;
out.PASS_noReloadShow = out.probeAfterShow === 'alive';
out.PASS_acksOk = Array.isArray(out.acks) && out.acks.length >= 1 && out.acks.every((a) => a.ok === true);
out.ALL_PASS = out.PASS_hideRemoved && out.PASS_hideSentReconcile && out.PASS_noReloadHide && out.PASS_showRestored && out.PASS_noReloadShow && out.PASS_acksOk;
console.log(JSON.stringify(out, null, 2));
await b.close();
