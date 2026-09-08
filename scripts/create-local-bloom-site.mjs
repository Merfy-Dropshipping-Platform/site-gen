#!/usr/bin/env node
/**
 * Локальный Bloom QA-сайт без Coolify/domain provisioning.
 * reserve() через RPC зависает на finishProvisioning — здесь SQL + revision RPC.
 *
 * Usage: node scripts/create-local-bloom-site.mjs
 */
import amqplib from 'amqplib';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:password@localhost:5672';
const TENANT_ID = process.env.REGISTRY_TENANT_ID ?? '8bcf6fe3-862d-4757-a085-f60f1c43367d';
const ACTOR = process.env.REGISTRY_ACTOR ?? 'theme-registry-local';
const SITE_NAME = process.env.BLOOM_SITE_NAME ?? 'Bloom Local (parity QA)';
const STORAGE_SLUG = process.env.BLOOM_STORAGE_SLUG ?? 'bloom-local-account';
const PUBLIC_URL = process.env.BLOOM_PUBLIC_URL ?? `http://${STORAGE_SLUG}.localhost:8088`;

async function sendRpc(channel, pattern, data, timeoutMs = 60_000) {
  const { queue: replyTo } = await channel.assertQueue('', { exclusive: true });
  const correlationId = randomUUID();
  const payload = { pattern, data, id: correlationId };

  const answer = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`RPC timeout ${timeoutMs}ms: ${pattern}`)), timeoutMs);
    channel.consume(
      replyTo,
      (m) => {
        if (m?.properties.correlationId === correlationId) {
          clearTimeout(t);
          resolve(JSON.parse(m.content.toString()));
        }
      },
      { noAck: true },
    );
  });

  channel.sendToQueue('sites_queue', Buffer.from(JSON.stringify(payload)), { correlationId, replyTo });
  const raw = await answer;
  return raw?.response ?? raw;
}

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

async function main() {
  const siteId = randomUUID();
  const slug = 'bloom-local-parity';

  const defaultsPath = path.join(__dirname, '../src/generator/templates/defaults/bloom.json');
  const revisionData = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
  if (!revisionData?.pages?.length) throw new Error('bloom.json defaults invalid');

  const insertSql = `INSERT INTO site (id, tenant_id, name, slug, status, theme_id, public_url, storage_slug, created_by, updated_by, created_at, updated_at) VALUES ('${siteId}', '${sqlEscape(TENANT_ID)}', '${sqlEscape(SITE_NAME)}', '${slug}', 'draft', 'bloom', '${sqlEscape(PUBLIC_URL)}', '${sqlEscape(STORAGE_SLUG)}', '${ACTOR}', '${ACTOR}', NOW(), NOW());`;

  execSync(
    `docker exec merfy-postgres psql -U postgres -d sites_service -c ${JSON.stringify(insertSql)}`,
    { stdio: 'inherit' },
  );

  const conn = await amqplib.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();

  const rev = await sendRpc(ch, 'sites.revisions.create', {
    tenantId: TENANT_ID,
    siteId,
    data: revisionData,
    meta: { title: SITE_NAME },
    actorUserId: ACTOR,
    setCurrent: true,
  });

  await conn.close();

  if (!rev?.success) {
    throw new Error(`revisions.create failed: ${JSON.stringify(rev)}`);
  }

  const out = {
    success: true,
    siteId,
    tenantId: TENANT_ID,
    themeId: 'bloom',
    name: SITE_NAME,
    publicUrl: PUBLIC_URL,
    storageSlug: STORAGE_SLUG,
    revisionId: rev.revisionId,
    constructorUrl: `http://localhost:3200/?siteId=${siteId}&page=home`,
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
