// Очистка тестового мусора flux-сайта 10caf133:
// 1) ВСЕ товары+коллекции под tenantId 3c6ae641 (осиротевшие дубли от первой попытки с неверным shopId + ПРОБА)
// 2) ТЕСТ-SITE Phone под siteId 10caf133 (пробный)
// Оставляет 60 реальных товаров + 8 коллекций под siteId 10caf133 (storefront-канон).
// Запуск: node .tmp-cleanup-flux-products.cjs

const TENANT = '3c6ae641-f9de-4fff-997e-80a9ac90245e'; // осиротевший shopId (дубли)
const SITE = '10caf133-cb75-4bb9-875e-a429b201b8a7';   // канон storefront

async function api(method, base, path) {
  const res = await fetch(`http://176.57.218.121:3113/${base}${path}`, { method });
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { ok: res.ok, status: res.status, json, txt };
}

async function listAll(shopId, kind) {
  const r = await api('GET', shopId, `/${kind}?limit=500`);
  const d = r.json;
  const items = Array.isArray(d) ? d : (d.items || d.data || d.products || d.collections || []);
  return Array.isArray(items) ? items : [];
}

(async () => {
  let delP = 0, delC = 0, fail = 0;

  // 1) Товары под tenantId (все — это дубли + ПРОБА)
  const tProds = await listAll(TENANT, 'products');
  console.log(`Под tenantId: ${tProds.length} товаров → удаляю`);
  for (const p of tProds) {
    const r = await api('DELETE', TENANT, `/products/${p.id}`);
    if (r.ok) delP++; else { fail++; if (fail <= 3) console.log('  ✗', p.title, r.status, String(r.txt).slice(0, 80)); }
  }

  // 2) Коллекции под tenantId
  const tColls = await listAll(TENANT, 'collections');
  console.log(`Под tenantId: ${tColls.length} коллекций → удаляю`);
  for (const c of tColls) {
    const r = await api('DELETE', TENANT, `/collections/${c.id}`);
    if (r.ok) delC++; else { fail++; if (fail <= 6) console.log('  ✗ coll', c.name, r.status); }
  }

  // 3) ТЕСТ-SITE Phone под siteId
  const sProds = await listAll(SITE, 'products');
  const tests = sProds.filter((p) => /^ТЕСТ-SITE/.test(p.title || ''));
  console.log(`Под siteId: ${tests.length} пробных (ТЕСТ-SITE) → удаляю`);
  for (const p of tests) {
    const r = await api('DELETE', SITE, `/products/${p.id}`);
    if (r.ok) delP++; else fail++;
  }

  // Итог
  const remain = await listAll(SITE, 'products');
  const remainC = await listAll(SITE, 'collections');
  console.log('\n=== ИТОГ ===');
  console.log(`Удалено товаров: ${delP} | коллекций: ${delC} | ошибок: ${fail}`);
  console.log(`Осталось под siteId: ${remain.length} товаров, ${remainC.length} коллекций`);
})().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
