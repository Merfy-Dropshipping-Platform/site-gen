#!/usr/bin/env node
import fs from 'node:fs';
import pg from 'pg';

const SITE_ID = '10df1c3a-a1fc-45e0-957a-511c131b1eb8';
const homePath = new URL('../packages/theme-bloom/pages/home.json', import.meta.url);
const seed = JSON.parse(fs.readFileSync(homePath, 'utf8'));

const byType = Object.fromEntries(seed.content.map((b) => [b.type, b.props]));

const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres123@localhost:5432/sites_service',
});

await client.connect();
const { rows } = await client.query(
  `SELECT id, data FROM site_revision
   WHERE site_id = $1
   ORDER BY created_at DESC LIMIT 1`,
  [SITE_ID],
);
if (!rows[0]) throw new Error('revision not found');

const data = rows[0].data;
const content = data.pagesData?.home?.content;
if (!Array.isArray(content)) throw new Error('home content missing');

for (const block of content) {
  const seedProps = byType[block.type];
  if (!seedProps) continue;
  if (block.type === 'Hero') {
    block.props.image = seedProps.image;
    block.props.backgroundImages = seedProps.backgroundImages;
    block.props.variant = seedProps.variant;
  }
  if (block.type === 'Gallery') {
    block.props.items = seedProps.items;
    block.props.text = seedProps.text;
  }
  if (block.type === 'MultiColumns') {
    block.props.columns = seedProps.columns;
  }
}

await client.query(`UPDATE site_revision SET data = $1::jsonb WHERE id = $2`, [
  JSON.stringify(data),
  rows[0].id,
]);
await client.end();
console.log('patched revision', rows[0].id, 'for site', SITE_ID);
