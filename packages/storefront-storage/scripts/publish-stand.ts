import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { BuildFile } from '@merfy/storefront-build';
import { readPointer } from '../src/pointer';
import { publishBuild } from '../src/publish';
import { PUBLISH_RULES, type PublishRuleId } from '../src/publish-rules';
import { createS3Store } from '../src/s3-store';
import { s3FromEnv } from './s3-env';

// pnpm publish:stand --from <папка> --label <метка> [--build N] [--public-url URL] [--indexable] [--allow <правило>]
// — выкладка магазина-стенда, собранного `pnpm build:stand` блока 4: <папка>/manifest.json и <папка>/files/**.
// Номер сборки — следующий за newest указателя (у первой — 1), если не задан --build. --allow — правило проверки,
// которое служебная команда разрешает нарушить. Хранилище — из переменных окружения (s3-env.ts). Не выложено — код 1.

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    label: { type: 'string' },
    build: { type: 'string' },
    'public-url': { type: 'string' },
    indexable: { type: 'boolean', default: false },
    allow: { type: 'string', multiple: true },
  },
});
const from = resolve(values.from ?? 'dist-stand');
const label = values.label ?? '';
const RULE_IDS = new Set<string>(PUBLISH_RULES.map((rule) => rule.id));
const isRuleId = (value: string): value is PublishRuleId => RULE_IDS.has(value);

async function readBuildFiles(dir: string): Promise<BuildFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const paths = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  return Promise.all(paths.map(async (path) => ({ path: relative(dir, path), content: await readFile(path) })));
}

const store = createS3Store(s3FromEnv());
const manifest: unknown = JSON.parse(await readFile(join(from, 'manifest.json'), 'utf8'));
const build = values.build === undefined ? ((await readPointer(store, label))?.newest ?? 0) + 1 : Number(values.build);
const result = await publishBuild(store, {
  label,
  build,
  manifest,
  files: await readBuildFiles(join(from, 'files')),
  publicUrl: values['public-url'] ?? `https://${label}.dev.merfy.ru`,
  indexable: values.indexable,
  now: new Date().toISOString(),
  allowed: (values.allow ?? []).filter(isRuleId),
});
const upload = result.upload;
const lines = [
  `сборка ${build}: ${result.status}`,
  ...(upload === null ? [] : [`залито ${upload.uploaded} из ${upload.total}, остальные уже были`]),
  ...result.problems.map((problem) => `правило ${problem.rule}: ${problem.text}`),
  `указатель: ${JSON.stringify(result.pointer)}`,
];
process.stdout.write(`${lines.join('\n')}\n`);
process.exitCode = result.status === 'blocked' ? 1 : 0;
