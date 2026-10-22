import { parseArgs } from 'node:util';
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
const USAGE = 'команда: pnpm merfy section check <папка> [--prefix <префикс>] или pnpm merfy section names';

const lineOf = (item: SectionProblem): string => `${problemText(item)} [${item.code}]\n`;

async function run(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { prefix: { type: 'string', default: 'shop' } },
  });
  const [group, command, folder] = positionals;
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
