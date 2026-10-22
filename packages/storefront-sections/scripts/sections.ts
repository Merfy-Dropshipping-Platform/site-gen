import { parseArgs } from 'node:util';
import { createS3Store } from '@merfy/storefront-storage';
import { Pool } from 'pg';
import { z } from 'zod';
import { acceptSection } from '../src/accept';
import { doorSchema, type Door } from '../src/doors';
import { problemText } from '../src/problems';
import { readSectionFolder } from '../src/read-folder';
import { publishDrafts, rollbackSection, sectionHistory, type SectionRow } from '../src/registry';
import { buildWorkers } from './build-workers';

// pnpm sections — двери своей секции и расширения, пока нет конструктора, MCP и регистрации версии в сервисе
// расширений (design.md блока 7, п. 21); история своей секции и «верни как было» (С7-20 Б). База и хранилище —
// переменными окружения, как у сборщика: DATABASE_URL, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.
//   pnpm sections accept <папка> --shop <uuid>
//   pnpm sections accept <папка> --extension <id> --release <версия>
//   pnpm sections history --shop <uuid> --name shop:<имя>
//   pnpm sections rollback --shop <uuid> --name shop:<имя> --id <id строки>
//   pnpm sections publish --shop <uuid>
// Ответ — одна строка JSON; отказ приёма, неверная команда или нет строки — код выхода 1.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
});

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    shop: { type: 'string' },
    extension: { type: 'string' },
    release: { type: 'string' },
    name: { type: 'string' },
    id: { type: 'string' },
  },
});
const [command = '', folder = ''] = positionals;
const env = envSchema.parse(process.env);
const db = new Pool({ connectionString: env.DATABASE_URL });

interface Answer {
  output: unknown;
  ok: boolean;
}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === '') throw new Error(`нужен ${name}`);
  return value;
}

const doorOf = (): Door =>
  doorSchema.parse(
    values.shop === undefined
      ? { author: 'extension', extension: values.extension, release: values.release }
      : { author: 'shop', shopId: values.shop },
  );

// Строка реестра коротко: какая правка, текущая ли, на витрине ли, когда принята.
const brief = (row: SectionRow) => ({
  id: row.id,
  name: row.name,
  release: row.release,
  contentHash: row.contentHash,
  draft: row.draft,
  published: row.published,
  createdAt: row.createdAt,
});

async function accept(): Promise<Answer> {
  const s3 = {
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  };
  const files = await readSectionFolder(required('путь к папке секции', folder));
  await buildWorkers();
  const result = await acceptSection({ db, store: createS3Store(s3) }, doorOf(), files);
  if (result.status === 'refused')
    return { output: { status: 'refused', problems: result.problems.map(problemText) }, ok: false };
  return { output: { status: result.status, ...brief(result.row) }, ok: true };
}

async function history(): Promise<Answer> {
  const rows = await sectionHistory(db, required('--shop', values.shop), required('--name', values.name));
  return { output: rows.map(brief), ok: true };
}

async function rollback(): Promise<Answer> {
  const ids = [required('--shop', values.shop), required('--name', values.name), required('--id', values.id)] as const;
  const row = await rollbackSection(db, ...ids);
  return {
    output: row === null ? { status: 'not-found' } : { status: 'rolled-back', ...brief(row) },
    ok: row !== null,
  };
}

// Публикация своих секций магазина без сборки (блок 1 «Секций и SDK»: наши секции в магазин — как у мерчанта, пп. 1,
// 27): текущие правки — на витрину, как при публикации магазина. Ответ — имена секций, у которых витрина сменилась.
async function publish(): Promise<Answer> {
  const sections = await publishDrafts(db, required('--shop', values.shop));
  return { output: { status: 'published', sections }, ok: true };
}

const COMMANDS: Partial<Record<string, () => Promise<Answer>>> = { accept, history, rollback, publish };

try {
  const run = COMMANDS[command];
  if (run === undefined) throw new Error('команда: accept, history, rollback или publish');
  const answer = await run();
  process.stdout.write(`${JSON.stringify(answer.output)}\n`);
  process.exitCode = answer.ok ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await db.end();
}
