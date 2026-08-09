import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
const login = await ctx.request.post('http://localhost:3110/api/auth/sign-in/email', {
  data: { email: 'flux-e2e-test-local@example.com', password: 'FluxE2ETest2026!', rememberMe: true },
});
console.log('логин:', login.status());
for (const path of ['/api/sites/e03dd420-febf-4499-9fc4-992412cc1b99', '/api/auth/get-session']) {
  const r = await ctx.request.get('http://localhost:3110' + path);
  const body = await r.text();
  console.log(path, r.status(), body.slice(0, 140));
}
const pg = await ctx.newPage();
const statuses = [];
pg.on('response', (r) => { if (r.status() >= 400) statuses.push(r.status() + ' ' + r.url().slice(21, 100)); });
await pg.goto('http://localhost:3200/?siteId=e03dd420-febf-4499-9fc4-992412cc1b99&page=home', { waitUntil: 'networkidle', timeout: 90000 });
await pg.waitForTimeout(9000);
console.log('4xx/5xx:', JSON.stringify(statuses.slice(0, 8)));
const modal = await pg.evaluate(() => document.body.innerText.includes('Нет активной сессии'));
console.log('модалка «нет сессии»:', modal, '· iframe:', await pg.evaluate(() => !!document.querySelector('iframe')));
await pg.screenshot({ path: '/tmp/merfy-local-logs/_smoke-rose2.png' });
await b.close();
