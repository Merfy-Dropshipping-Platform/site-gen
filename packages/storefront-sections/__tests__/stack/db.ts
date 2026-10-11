import { Pool } from 'pg';

// Стенд compose.stack.yml сборщика с именем проекта storefront-sections-test: учётки — только этого стенда. Порты по
// умолчанию — стенда блока 7; другой стенд задаёт свои переменными STACK_PG_PORT и STACK_S3_PORT, как у сборщика.
const port = (name: string, fallback: number): number => Number(process.env[name] ?? fallback);

export const STACK = {
  databaseUrl: `postgres://builder-test:builder-test-only@127.0.0.1:${port('STACK_PG_PORT', 17432)}/sites_service`,
  s3: {
    endpoint: `http://127.0.0.1:${port('STACK_S3_PORT', 19400)}`,
    bucket: 'storefront-test',
    accessKeyId: 'builder-test',
    secretAccessKey: 'builder-test-only',
  },
} as const;

export const openPool = (): Pool => new Pool({ connectionString: STACK.databaseUrl, max: 10 });

// Строки реестра с прошлых тестов — долой. База — только стенда.
export async function resetSections(db: Pool): Promise<void> {
  await db.query('TRUNCATE storefront_section');
}
