// Смоук: логин e2e-аккаунтом → конструктор открывает ОБА сайта (flux и rose),
// ревизии реальные (не localStorage-фолбэк), превью в iframe живое.
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
const login = await ctx.request.post('http://localhost:3110/api/auth/sign-in/email', {
  data: { email: 'flux-e2e-test-local@example.com', password: 'FluxE2ETest2026!', rememberMe: true },
});
console.log('логин:', login.status());
const sites = await ctx.request.get('http://localhost:3110/api/sites');
const list = await sites.json().catch(() => null);
const names = (list?.sites ?? list?.data ?? list ?? []).map?.((s) => `${s.name} (${String(s.id).slice(0, 8)})`) ?? list;
console.log('мои сайты:', JSON.stringify(names));
for (const [label, siteId, page] of [
  ['flux', '132d3a3e-a28f-40b7-98fa-a0200151cfb8', 'home'],
  ['rose', 'e03dd420-febf-4499-9fc4-992412cc1b99', 'home'],
]) {
  const pg = await ctx.newPage();
  await pg.goto(`http://localhost:3200/?siteId=${siteId}&page=${page}`, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => console.log(label, 'goto:', String(e).slice(0, 80)));
  await pg.waitForTimeout(4000);
  const r = await pg.evaluate(() => {
    const iframe = document.querySelector('iframe');
    const secs = iframe?.contentDocument?.querySelectorAll('[data-puck-component-id]')?.length ?? -1;
    const err401 = performance.getEntriesByType('resource').filter((e) => e.responseStatus === 401).length;
    return { iframe: !!iframe, sections: secs, errors401: err401 };
  });
  console.log(label, JSON.stringify(r));
  await pg.screenshot({ path: `/tmp/merfy-local-logs/_smoke-${label}.png` }).catch(() => {});
  await pg.close();
}
await b.close();
