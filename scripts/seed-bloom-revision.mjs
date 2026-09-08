#!/usr/bin/env node
/** Добавить revision к уже созданному bloom-сайту (SQL, без RPC). */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const siteId = process.argv[2] ?? '10df1c3a-a1fc-45e0-957a-511c131b1eb8';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultsPath = path.join(__dirname, '../src/generator/templates/defaults/bloom.json');
const data = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
const revId = randomUUID();
const sqlPath = `/tmp/bloom-seed-${revId}.sql`;
const dataJson = JSON.stringify(data).replace(/'/g, "''");
const metaJson = JSON.stringify({ title: 'Bloom Local (parity QA)' }).replace(/'/g, "''");

const sql = `
INSERT INTO site_revision (id, site_id, data, meta, created_at, created_by)
VALUES ('${revId}', '${siteId}', '${dataJson}'::jsonb, '${metaJson}'::jsonb, NOW(), 'theme-registry-local');
UPDATE site SET current_revision_id = '${revId}', updated_at = NOW() WHERE id = '${siteId}';
`;

fs.writeFileSync(sqlPath, sql);
execSync(`docker cp ${sqlPath} merfy-postgres:/tmp/bloom-seed.sql`, { stdio: 'inherit' });
execSync('docker exec merfy-postgres psql -U postgres -d sites_service -f /tmp/bloom-seed.sql', { stdio: 'inherit' });

console.log(
  JSON.stringify(
    {
      siteId,
      revisionId: revId,
      constructorUrl: `http://localhost:3200/?siteId=${siteId}&page=home`,
      storefrontUrl: 'http://bloom-local-account.localhost:8088',
    },
    null,
    2,
  ),
);
