import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { STACK, openPool, resetSections } from './db';

// pnpm sections на стенде (блок 1 «Секций и SDK», пп. 1, 27): наши секции магазин сохраняет как мерчант — accept, —
// publish выносит их на витрину без сборки. Команда — та же, что основной тред запускает на dev.
const run = promisify(execFile);
const PACKAGE = fileURLToPath(new URL('../../', import.meta.url));
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const ENV = {
  ...process.env,
  DATABASE_URL: STACK.databaseUrl,
  S3_ENDPOINT: STACK.s3.endpoint,
  S3_BUCKET: STACK.s3.bucket,
  S3_ACCESS_KEY: STACK.s3.accessKeyId,
  S3_SECRET_KEY: STACK.s3.secretAccessKey,
};

async function sections(...args: string[]): Promise<unknown> {
  const { stdout } = await run('pnpm', ['exec', 'tsx', 'scripts/sections.ts', ...args], { cwd: PACKAGE, env: ENV });
  return JSON.parse(stdout);
}

let db: Pool;

beforeAll(() => {
  db = openPool();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await resetSections(db);
});

describe('pnpm sections: наши секции в магазин', () => {
  it('accept — текущая правка магазина, publish — на витрину; повторный publish ничего не меняет', async () => {
    expect(await sections('accept', 'fixtures/sections/hero', '--shop', SHOP)).toMatchObject({
      status: 'accepted',
      name: 'shop:hero',
      draft: true,
      published: false,
    });
    await sections('accept', '../storefront-shell/sections/cart-badge', '--shop', SHOP);
    expect(await sections('publish', '--shop', SHOP)).toEqual({
      status: 'published',
      sections: ['shop:cart-badge', 'shop:hero'],
    });
    expect(await sections('publish', '--shop', SHOP)).toEqual({ status: 'published', sections: [] });
    const { rows } = await db.query(
      `SELECT name FROM storefront_section WHERE owner = $1 AND published ORDER BY name COLLATE "C"`,
      [SHOP],
    );
    expect(rows).toEqual([{ name: 'shop:cart-badge' }, { name: 'shop:hero' }]);
  }, 120_000);
});
