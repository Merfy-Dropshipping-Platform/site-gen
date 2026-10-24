import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { docsFiles } from '../src/docs';
import { PACKAGE_DIR } from '../src/meta';
import { readSources } from '../src/sources';

// ВРЕМЕННЫЙ диагностический тест (удалить после разбора CI) — печатает источники расхождения теста 1.
describe('diagnostic', () => {
  it('что отличилось', async () => {
    const sources = await readSources();
    const files = docsFiles(sources);
    const disk = readFileSync(join(PACKAGE_DIR, 'generated/section.schema.json'), 'utf8');
    const neighbor = readFileSync(join(PACKAGE_DIR, '../storefront-sections/generated/section.schema.json'), 'utf8');
    process.stdout.write(`node ${process.version}\n`);
    process.stdout.write(`sources.schema === disk: ${sources.schema === disk}\n`);
    process.stdout.write(`neighbor === disk: ${neighbor === disk}\n`);
    process.stdout.write(`files keys: ${Object.keys(files).length}\n`);
    for (const [path, text] of Object.entries(files)) {
      const onDisk = readFileSync(join(PACKAGE_DIR, 'generated', path), 'utf8');
      if (onDisk !== text) {
        process.stdout.write(`DIFF in ${path}: disk ${onDisk.length} chars, files ${text.length} chars\n`);
        for (let i = 0; i < Math.min(onDisk.length, text.length); i += 1)
          if (onDisk[i] !== text[i]) {
            process.stdout.write(`first diff at ${i}:\nDISK: ${onDisk.slice(Math.max(0, i - 80), i + 120)}\nFILES: ${text.slice(Math.max(0, i - 80), i + 120)}\n`);
            break;
          }
      }
    }
    expect(true).toBe(true);
  });
});
