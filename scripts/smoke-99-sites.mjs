#!/usr/bin/env node
/**
 * Smoke test для всех published Merfy sites. Spec 092 SC-006.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/smoke-99-sites.mjs
 *
 * Поллит все published sites через curl на root URL. Returns JSON report:
 *   { total: 99, pass: 97, fail: 2, errors: [{url, status}, ...] }
 *
 * Exit 1 если хоть один не 200/2xx. Используется в Task 18 deploy verify
 * для подтверждения 100% sites не сломались после migration.
 */
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres:cVA8ECEkmfrJmgTagElGLVxoE5em8CRN7mGisQkAQpotHcurNwdhRyFlu5Ck7l9O@176.57.218.121:54321/sites_service?sslmode=disable';

const client = new pg.Client(DATABASE_URL);
await client.connect();

const sites = (
  await client.query(
    `SELECT id, public_url FROM site WHERE status='published' AND public_url IS NOT NULL ORDER BY public_url`,
  )
).rows;
await client.end();

console.log(`Smoke testing ${sites.length} published sites...`);

const results = { total: sites.length, pass: 0, fail: 0, errors: [] };
const CONCURRENT = 10;

async function probe(s) {
  try {
    const r = await fetch(s.public_url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (r.ok || (r.status >= 200 && r.status < 400)) {
      results.pass++;
    } else {
      results.fail++;
      results.errors.push({ url: s.public_url, status: r.status });
    }
  } catch (e) {
    results.fail++;
    results.errors.push({ url: s.public_url, status: 'ERR', message: String(e?.message ?? e) });
  }
}

for (let i = 0; i < sites.length; i += CONCURRENT) {
  const batch = sites.slice(i, i + CONCURRENT);
  await Promise.all(batch.map(probe));
  const done = Math.min(i + CONCURRENT, sites.length);
  process.stdout.write(`\r  ${done}/${sites.length} (pass ${results.pass}, fail ${results.fail})`);
}
process.stdout.write('\n');

console.log(JSON.stringify(results, null, 2));

if (results.fail > 0) {
  console.error(`\n❌ ${results.fail} sites failed`);
  process.exit(1);
}
console.log(`\n✅ All ${results.pass} sites OK`);
