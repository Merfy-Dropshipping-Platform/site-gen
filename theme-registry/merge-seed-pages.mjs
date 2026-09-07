#!/usr/bin/env node
// Дописать в ТЕКУЩУЮ ревизию недостающие страницы из канонических сидов темы.
// Существующие pages/pagesData не трогает. Нужно, чтобы гонять реестр
// корзины/каталога без обнуления уже оживлённой главной.
//
//   node theme-registry/merge-seed-pages.mjs --theme flux --pages cart,catalog,about
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import amqplib from 'amqplib';
import { randomUUID } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
);
const THEME = args.theme;
const pages = String(args.pages ?? 'cart')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (!THEME || !pages.length) {
  console.error('usage: merge-seed-pages.mjs --theme <t> --pages cart,catalog');
  process.exit(2);
}

const sites = JSON.parse(readFileSync(path.join(import.meta.dirname, 'sites.json'), 'utf-8'));
if (!sites[THEME]) {
  console.error(`sites.json: нет сайта для темы "${THEME}"`);
  process.exit(2);
}
const { siteId, tenantId } = sites[THEME];

const sql = (q) =>
  execSync(`docker exec merfy-postgres psql -U postgres -d sites_service -tAc "${q.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
  }).trim();

const raw = sql(
  `SELECT data::text FROM site_revision WHERE id=(SELECT current_revision_id FROM site WHERE id='${siteId}')`,
);
if (!raw) {
  console.error('нет current_revision');
  process.exit(1);
}
const data = JSON.parse(raw);
data.pages = Array.isArray(data.pages) ? data.pages : [];
data.pagesData = data.pagesData && typeof data.pagesData === 'object' ? data.pagesData : {};

const added = [];
for (const page of pages) {
  if (data.pagesData[page]) {
    console.log(`skip ${page}: уже есть в pagesData`);
    continue;
  }
  const seedPath = path.join(import.meta.dirname, '..', 'packages', `theme-${THEME}`, 'pages', `${page}.json`);
  const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
  if (!Array.isArray(seed?.content)) {
    console.error(`сид ${seedPath} не содержит content[]`);
    process.exit(1);
  }
  const slug = page === 'home' ? '/' : `/${page}`;
  data.pages.push({ id: page, name: page, slug });
  data.pagesData[page] = {
    root: seed.root ?? { props: { title: page } },
    zones: seed.zones ?? {},
    content: seed.content,
  };
  added.push(page);
}

if (!added.length) {
  console.log('нечего добавлять');
  process.exit(0);
}

const url = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:password@localhost:5672';
const conn = await amqplib.connect(url);
const ch = await conn.createChannel();
const { queue: replyTo } = await ch.assertQueue('', { exclusive: true });
const correlationId = randomUUID();
const payload = {
  pattern: 'sites.revisions.create',
  data: {
    tenantId,
    siteId,
    data,
    setCurrent: true,
    actorUserId: 'theme-registry-merge-pages',
    meta: { title: `merge seed pages: ${added.join(',')}` },
  },
  id: correlationId,
};
const answer = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('RPC timeout 45s')), 45000);
  ch.consume(replyTo, (m) => {
    if (m?.properties.correlationId === correlationId) {
      clearTimeout(t);
      res(JSON.parse(m.content.toString()));
    }
  }, { noAck: true });
});
ch.sendToQueue('sites_queue', Buffer.from(JSON.stringify(payload)), { correlationId, replyTo });
const r = await answer;
await conn.close();
console.log(JSON.stringify({ added, ok: r?.response?.success ?? r?.success, revisionId: r?.response?.revisionId ?? r?.revisionId }, null, 2));
process.exit((r?.response?.success ?? r?.success) ? 0 : 1);
