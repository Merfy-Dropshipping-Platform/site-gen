import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { docsFiles } from '../src/docs';
import { PACKAGE_DIR } from '../src/meta';
import { readSources } from '../src/sources';

// pnpm generate (блок 14, Р14-7): страницы документации SDK из данных проверки и ядра — в generated/.
const GENERATED = join(PACKAGE_DIR, 'generated');

try {
  const files = docsFiles(await readSources());
  rmSync(GENERATED, { recursive: true, force: true });
  for (const [path, text] of Object.entries(files)) {
    const target = join(GENERATED, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    process.stdout.write(`записан ${path}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
