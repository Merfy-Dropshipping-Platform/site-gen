#!/usr/bin/env node
// Материализовать ДЕФОЛТНУЮ ревизию сайта из канонического сида темы
// (packages/theme-<t>/pages/home.json — тот самый файл, откуда LazySeed берёт
// дефолт при сборке). Контент сида передаётся В ТОЧНОСТИ как есть; форма
// ревизии повторяет первую систему-созданную ревизию реальных сайтов
// ({pages, pagesData:{<page>:{root,zones,content}}, currentPageId, themeSettings}).
// Использование: node theme-registry/materialize-seed-revision.mjs <themeId> <tenantId> <siteId> [pages...=home]
import amqplib from 'amqplib';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const [themeId, tenantId, siteId, ...pagesArg] = process.argv.slice(2);
const pages = pagesArg.length ? pagesArg : ['home'];
if (!themeId || !tenantId || !siteId) {
  console.error('usage: materialize-seed-revision.mjs <themeId> <tenantId> <siteId> [pages...]');
  process.exit(2);
}

const pagesMeta = [];
const pagesData = {};
for (const page of pages) {
  const seedPath = path.join(import.meta.dirname, '..', 'packages', `theme-${themeId}`, 'pages', `${page}.json`);
  const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
  if (!Array.isArray(seed?.content)) {
    console.error(`сид ${seedPath} не содержит content[]`);
    process.exit(1);
  }
  pagesMeta.push({ id: page, name: page === 'home' ? 'Главная' : page, slug: page === 'home' ? '/' : `/${page}` });
  pagesData[page] = { root: { props: {} }, zones: {}, content: seed.content };
}

// Доп-блоки, как «+ секция» пикером мерчанта: REGISTRY_EXTRA_BLOCKS="home:ImageWithText,home:Video"
// — добавляются В КОНЕЦ content страницы с минимальными пропами (дефолты дорисует рендер).
for (const spec of (process.env.REGISTRY_EXTRA_BLOCKS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
  const [pg, type] = spec.split(':');
  if (!pagesData[pg] || !type) {
    console.error(`REGISTRY_EXTRA_BLOCKS: нет страницы "${pg}" или типа в "${spec}"`);
    process.exit(1);
  }
  pagesData[pg].content.push({ type, props: { id: `${type}-registry` } });
}

const data = {
  pages: pagesMeta,
  pagesData,
  currentPageId: pages[0],
  themeSettings: {},
};

const url = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:password@localhost:5672';
const conn = await amqplib.connect(url);
const ch = await conn.createChannel();
const { queue: replyTo } = await ch.assertQueue('', { exclusive: true });
const correlationId = randomUUID();
const payload = {
  pattern: 'sites.revisions.create',
  data: { tenantId, siteId, data, setCurrent: true, actorUserId: 'theme-registry-seed' },
  id: correlationId,
};
const answer = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('RPC timeout 45s')), 45000);
  ch.consume(replyTo, (m) => {
    if (m?.properties.correlationId === correlationId) { clearTimeout(t); res(JSON.parse(m.content.toString())); }
  }, { noAck: true });
});
ch.sendToQueue('sites_queue', Buffer.from(JSON.stringify(payload)), { correlationId, replyTo });
const r = await answer;
console.log(JSON.stringify(r, null, 2));
await conn.close();
process.exit((r?.response?.success ?? r?.success) ? 0 : 1);
