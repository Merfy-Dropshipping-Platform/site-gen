import { mkdtemp } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPassport, openPage, takeShots } from '@merfy/stand-check';
import { createS3Store } from '@merfy/storefront-storage';
import { Pool } from 'pg';
import { StorefrontBuilderError, errorText } from '../src/errors';
import {
  parseCommand,
  readCommandSettings,
  runCommand,
  type CommandDeps,
  type CommandSettings,
} from '../src/release/command';
import { versionFiles } from '../src/release/versions';

// Команда выпуска темы (design.md блока 10): `pnpm --filter @merfy/storefront-builder theme-release <подкоманда>`.
// Запускает человек на своей машине: база, MinIO и контур — переменными окружения (README пакета), браузер — его.
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const USAGE =
  'theme-release start <тема> [--test-shop <id>] [--version <x.y.z>] [--no-shots] [--expect-hash sha256:…] | ' +
  'approve <№> | status [<№>] | skip <№> <магазин> | revert-all <№>';
const REFUSED: ReadonlySet<string> = new Set(['release-refused', 'release-conflict']);

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function depsOf(settings: CommandSettings, db: Pool): Promise<CommandDeps> {
  const store = createS3Store(settings.s3);
  const workDir = await mkdtemp(join(tmpdir(), 'theme-release-'));
  const passport = (url: string) =>
    openPage(url, { sabotage: [] }, (page) => collectPassport(page, 'dev')).then((found) => found.passport);
  return {
    db,
    store,
    contour: settings.contour,
    root: ROOT,
    reportDir: join(ROOT, 'packages', 'storefront-builder', 'releases'),
    publicUrl: settings.publicUrl,
    startedBy: userInfo().username,
    clock: () => new Date(),
    say,
    browser: { passport, shots: (url) => takeShots(url) },
    versions: (themeId, version) => versionFiles(store, themeId, version, workDir),
    pollMs: 5_000,
    waitMs: 30 * 60_000,
  };
}

async function main(): Promise<number> {
  const command = parseCommand(process.argv.slice(2));
  const settings = readCommandSettings(process.env);
  const db = new Pool({ connectionString: settings.databaseUrl });
  try {
    return await runCommand(await depsOf(settings, db), command);
  } finally {
    await db.end();
  }
}

// Код выхода: 0 — сделано, 1 — выпуск не стартовал, остановлен или на контуре уже идёт другой, 2 — команда не смогла.
const codeOf = (error: unknown): number => (error instanceof StorefrontBuilderError && REFUSED.has(error.code) ? 1 : 2);
const hintOf = (error: unknown): string =>
  error instanceof StorefrontBuilderError && error.code === 'release-args' ? `\n${USAGE}` : '';

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    say(`${errorText(error)}${hintOf(error)}`);
    process.exitCode = codeOf(error);
  },
);
