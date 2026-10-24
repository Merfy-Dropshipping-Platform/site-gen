import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { sectionAnswer } from '../src/answer';
import { MANIFEST_FILE, SECTION_ID, type SectionFiles } from '../src/format';
import type { PrepareResult } from '../src/prepare';
import { problemText, type SectionProblem } from '../src/problems';
import { buildWorkers } from './build-workers';
import { namesMarkdown } from '../src/generate/names-markdown';
import { readSectionFolder } from '../src/read-folder';
import { DEFAULT_SANDBOX, prepareInWorker } from '../src/sandbox';

// pnpm merfy section check <папка> [--prefix shop] — проверка папки секции тем же приёмом, что при сохранении секции:
// формат, шаблон, компиляция, скрипт и пробный рендер — без базы и хранилища (блок 1 «Секций и SDK»). Строка на
// проблему: «файл:строка:колонка — текст [код]». Код выхода: 0 — прошла, 1 — есть проблемы, 2 — неверная команда.
// Процессы проверки и рендера — собранные файлы (блок 2): команда собирает их перед проверкой.
// pnpm merfy section names — словарь имён полей текстом NAMES.md (блок 3 «Секций и SDK»), без сборки процессов.
// --json (блок 14 «Секций и SDK», 14.6) — ответ проверки одним JSON, как у адреса шлюза «проверить».
const USAGE =
  'команда: pnpm merfy section check <папка> [--prefix <префикс>] [--json], pnpm merfy section new <папка> или pnpm merfy section names';

const lineOf = (item: SectionProblem): string => `${problemText(item)} [${item.code}]\n`;

function printJson(prefix: string, files: SectionFiles, result: PrepareResult): number {
  const answer = sectionAnswer(prefix, files, result);
  process.stdout.write(`${JSON.stringify(answer)}\n`);
  return answer.ok ? 0 : 1;
}

const TEMPLATE_DIR = new URL('../../sdk-docs/template/', import.meta.url);

const manifestWithName = (source: string, name: string): string => {
  const parsed: unknown = JSON.parse(source);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('template/section.json: не объект');
  return `${JSON.stringify({ ...parsed, name }, null, 2)}\n`;
};

async function copyTemplateFile(file: string, folder: string, name: string): Promise<void> {
  const source = await readFile(new URL(file, TEMPLATE_DIR), 'utf8');
  const text = file === MANIFEST_FILE ? manifestWithName(source, name) : source;
  await writeFile(join(folder, file), text);
}

// pnpm merfy section new <папка> (блок 14, 14.5): копия шаблона с именем папки; имя — последняя часть пути.
async function createSection(folder: string): Promise<number> {
  const name = basename(folder);
  if (!SECTION_ID.test(name)) {
    process.stderr.write(`имя секции ${name}: строчные латинские буквы и цифры через одиночный дефис\n${USAGE}\n`);
    return 2;
  }
  if (existsSync(folder)) {
    process.stderr.write(`папка ${folder} уже есть: выбери другое имя\n`);
    return 1;
  }
  const names = (await readdir(TEMPLATE_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  await mkdir(folder);
  for (const file of names) await copyTemplateFile(file, folder, name);
  process.stdout.write(`создана папка ${folder}: ${names.join(', ')}\n`);
  return 0;
}

async function run(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { prefix: { type: 'string', default: 'shop' }, json: { type: 'boolean', default: false } },
  });
  const [group, command, folder] = positionals;
  if (group === 'section' && command === 'new' && folder !== undefined) return createSection(folder);
  if (group === 'section' && command === 'names') {
    process.stdout.write(namesMarkdown());
    return 0;
  }
  if (group !== 'section' || command !== 'check' || folder === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const files = await readSectionFolder(folder);
  await buildWorkers();
  const result = await prepareInWorker({ prefix: values.prefix, files }, DEFAULT_SANDBOX);
  if (values.json) return printJson(values.prefix, files, result);
  if (!result.ok) {
    process.stdout.write(result.problems.map(lineOf).join(''));
    return 1;
  }
  process.stdout.write(`${result.section.name}: проверка прошла\n${result.section.warnings.map(lineOf).join('')}`);
  return 0;
}

try {
  process.exitCode = await run();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
  process.exitCode = 2;
}
