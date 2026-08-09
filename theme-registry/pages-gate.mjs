#!/usr/bin/env node
// Гейт СТРАНИЧНОЙ логики (не секционной): «страницы берутся из админки и
// автосоздаются; ссылка без страницы → создаётся дефолтная со секцией
// „Страница“» (логика rose, тема-агностичная — гейтом фиксируем, что она
// работает у каждой темы).
//
//   node theme-registry/pages-gate.mjs --theme rose|flux
//
// Шаги (тот же RPC-канал, что у конструктора при клике по несуществующей
// ссылке — ConstructorContext.createPage(explicitSlug) → sites.pages.create):
//   1. pages.create {name, slug} → success
//   2. ревизия: pages[] содержит запись isCustom; pagesData[<id>].content =
//      Header + Page («Страница») + Footer — дефолтный сид (pages.service.ts:118)
//   3. превью новой страницы отвечает 200 и НЕСЁТ Page-блок в композиции
//   4. pages.delete → страница исчезла из ревизии
// Красное на rose = логика сломана (гейт), на теме = прогрех темы/композиции.
import amqplib from 'amqplib';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
);
const THEME = args.theme;
if (!THEME) {
  console.error('usage: node theme-registry/pages-gate.mjs --theme <rose|flux>');
  process.exit(2);
}
const sites = JSON.parse(readFileSync(path.join(import.meta.dirname, 'sites.json'), 'utf-8'));
if (!sites[THEME]) {
  console.error(`sites.json: нет сайта для темы "${THEME}"`);
  process.exit(2);
}
const { siteId, tenantId } = sites[THEME];
const SLUG = `/proba-gate-${Date.now().toString(36)}`;
const NAME = 'Проба гейта страниц';

const url = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:password@localhost:5672';
const conn = await amqplib.connect(url);
const ch = await conn.createChannel();
const { queue: replyTo } = await ch.assertQueue('', { exclusive: true });
// ОДИН consumer на reply-очередь + маршрутизация по correlationId: несколько
// consumer'ов на одну exclusive-очередь воруют чужие ответы (ловил таймаут).
const pending = new Map();
await ch.consume(replyTo, (m) => {
  const r = pending.get(m?.properties.correlationId);
  if (r) { pending.delete(m.properties.correlationId); r(JSON.parse(m.content.toString())); }
}, { noAck: true });
async function rpc(pattern, data) {
  const correlationId = randomUUID();
  const answer = new Promise((res, rej) => {
    const t = setTimeout(() => { pending.delete(correlationId); rej(new Error(`RPC timeout: ${pattern}`)); }, 30000);
    pending.set(correlationId, (v) => { clearTimeout(t); res(v); });
  });
  ch.sendToQueue('sites_queue', Buffer.from(JSON.stringify({ pattern, data, id: correlationId })), { correlationId, replyTo });
  const r = await answer;
  return r?.response ?? r;
}
const sql = (q) =>
  execSync(`docker exec merfy-postgres psql -U postgres -d sites_service -tAc "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' }).trim();

const results = [];
const check = (label, pass, facts) => {
  results.push({ label, pass, facts });
  console.log(`${pass ? '✓' : '✗'} ${label.padEnd(34)} ${facts}`);
};

console.log(`гейт страниц: ${THEME} (site ${siteId}) slug=${SLUG}`);

// 1. Создание (как клик по несуществующей ссылке в превью конструктора)
const created = await rpc('sites.pages.create', { tenantId, siteId, name: NAME, slug: SLUG });
const pageId = created?.page?.id;
check('pages.create', !!created?.success && !!pageId, created?.success ? `id=${pageId}` : JSON.stringify(created).slice(0, 90));

let seedTypes = [];
if (pageId) {
  // 2. Дефолтный сид в ревизии
  const raw = sql(`SELECT data::jsonb->'pagesData'->'${pageId}'->'content' FROM site_revision WHERE id=(SELECT current_revision_id FROM site WHERE id='${siteId}')`);
  try { seedTypes = JSON.parse(raw || '[]').map((b) => b?.type); } catch { seedTypes = ['<не распарсилось>']; }
  const wantSeed = JSON.stringify(seedTypes) === JSON.stringify(['Header', 'Page', 'Footer']);
  check('дефолтный сид (Header+Страница+Footer)', wantSeed, seedTypes.join(' + ') || 'пусто');

  const meta = sql(`SELECT b FROM (SELECT jsonb_array_elements(data::jsonb->'pages') b FROM site_revision WHERE id=(SELECT current_revision_id FROM site WHERE id='${siteId}')) t WHERE b->>'id'='${pageId}'`);
  check('запись в pages[] (isCustom)', meta.includes('"isCustom": true') || meta.includes('"isCustom":true'), meta ? `slug=${SLUG}` : 'записи нет');

  // 3. Превью страницы рендерит Page-блок
  let html = '';
  try {
    html = await (await fetch(`http://localhost:3110/api/sites/${siteId}/preview?page=${encodeURIComponent(pageId)}`)).text();
  } catch (e) { html = ''; }
  const hasPage = html.includes(`data-puck-component-id="Page-${pageId}"`);
  check('превью: Page-блок в композиции', hasPage, hasPage ? `HTML ${html.length}b, блок Page-${pageId.slice(0, 20)}… на месте` : `блок НЕ найден (HTML ${html.length}b)`);

  // 4. Удаление
  const del = await rpc('sites.pages.delete', { tenantId, siteId, pageId });
  const goneMeta = sql(`SELECT count(*) FROM (SELECT jsonb_array_elements(data::jsonb->'pages') b FROM site_revision WHERE id=(SELECT current_revision_id FROM site WHERE id='${siteId}')) t WHERE b->>'id'='${pageId}'`);
  check('pages.delete подчищает', !!del?.success && goneMeta === '0', `success=${!!del?.success}, записей осталось: ${goneMeta}`);
}

await conn.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\nитог: ${results.length - failed}/${results.length} ✓`);
process.exit(failed ? 1 : 0);
