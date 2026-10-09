import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

// Стенд compose.stack.yml (`pnpm stack:up`): учётки — только этого стенда. Схему базы sites пишут миграции site-gen
// (`pnpm db:migrate` в корне, «Подготовка» плана), тесты её только читают и пишут строки со своими id.
export const STACK = {
  databaseUrl: 'postgres://builder-test:builder-test-only@127.0.0.1:15432/sites_service',
  rabbitmqUrl: 'amqp://builder-test:builder-test-only@127.0.0.1:15682',
  s3: {
    endpoint: 'http://127.0.0.1:19200',
    bucket: 'storefront-test',
    accessKeyId: 'builder-test',
    secretAccessKey: 'builder-test-only',
  },
} as const;

export const openPool = (): Pool => new Pool({ connectionString: STACK.databaseUrl, max: 30 });

// Строки сборщика с прошлых тестов — долой, магазины прошлых тестов — удалены (deleted_at): иначе таймеры и сверка
// сборщика подхватят чужие повторы, задания и магазины. База — только стенда.
export async function resetBuilder(db: Pool): Promise<void> {
  await db.query('TRUNCATE storefront_shop, storefront_build');
  await db.query('UPDATE site SET deleted_at = now() WHERE deleted_at IS NULL');
}

export interface SiteFields {
  id: string;
  tenantId: string;
  name: string;
  themeId: string;
  status: string;
  publicUrl: string | null;
}

// Магазин в таблице site базы sites: по умолчанию — опубликованный магазин новой темы nova со своим адресом.
export async function insertSite(db: Pool, fields: Partial<SiteFields> = {}): Promise<SiteFields> {
  const id = fields.id ?? randomUUID();
  const site: SiteFields = {
    id,
    tenantId: fields.tenantId ?? randomUUID(),
    name: fields.name ?? 'Шарфы',
    themeId: fields.themeId ?? 'nova',
    status: fields.status ?? 'published',
    publicUrl: fields.publicUrl === undefined ? `s-${id.slice(0, 8)}.dev.merfy.ru` : fields.publicUrl,
  };
  await db.query(
    `INSERT INTO site (id, tenant_id, name, theme_id, status, public_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, '2026-10-08T09:00:00.000Z', '2026-10-08T09:00:00.000Z')`,
    [site.id, site.tenantId, site.name, site.themeId, site.status, site.publicUrl],
  );
  return site;
}

const shopRowSql = `SELECT state, build::float8 AS build, events, pending, attempt, error FROM storefront_shop
  WHERE site_id = $1`;

// Строка магазина как есть — для проверок в тестах.
export async function shopRow(db: Pool, siteId: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(shopRowSql, [siteId]);
  return rows[0] ?? {};
}

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Ждать, пока условие не станет истинным: опрос раз в 50 мс, не дольше timeoutMs.
export async function until(check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('не дождались условия');
    await wait(50);
  }
}
