import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SANDBOX, prepareInWorker, readSectionFolder } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { PACKAGE_DIR } from '../src/meta';

// Примеры документации (блок 14, тест 2 раздела 14.2): папка без приставки bad- проходит проверку без предупреждений,
// папка bad-<код> не проходит, и среди отказов — этот код.
const EXAMPLES = join(PACKAGE_DIR, 'examples');
const names = readdirSync(EXAMPLES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('примеры документации', () => {
  it('есть рабочий пример и примеры с ошибкой', () => {
    expect(names).toEqual(['bad-class-arbitrary', 'bad-setting-name-unknown', 'bad-template-forbidden', 'scarf-match']);
  });

  it.each(names)('%s', async (name) => {
    const files = await readSectionFolder(join(EXAMPLES, name));
    const result = await prepareInWorker({ prefix: 'shop', files }, DEFAULT_SANDBOX);
    if (!name.startsWith('bad-')) {
      expect(result).toMatchObject({ ok: true, section: { warnings: [] } });
      return;
    }
    expect(result.ok).toBe(false);
    const codes = result.ok ? [] : result.problems.map((item) => item.code);
    expect(codes).toContain(name.slice('bad-'.length));
  });
});
