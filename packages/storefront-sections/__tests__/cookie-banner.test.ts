import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { prepareSection } from '../src/prepare';
import { readSectionFolder } from '../src/read-folder';

// «Баннер cookie» (блок 13 «Секций и SDK», часть 13б, Б13б-6 шаг 1): манифест объявляет shop и consent. Без consent
// ядро не даёт скрипту секции ctx.consent и монтирование падает на витрине («Cannot read properties of undefined
// (reading '$consent')», находка проверок dev 25.10). script_meta.uses — модули, которые сборка даёт секции в ctx.
const FOLDER = fileURLToPath(new URL('../fixtures/shop/cookie-banner', import.meta.url));

describe('«Баннер cookie»: uses манифеста', () => {
  it('манифест — shop и consent; скрипт получает ctx.consent (script_meta)', async () => {
    const result = await prepareSection({ prefix: 'shop', files: await readSectionFolder(FOLDER) });
    const problems = result.ok ? [] : result.problems.map((item) => `${item.code} ${item.file} ${item.message}`);
    expect(problems).toEqual([]);
    expect(result.ok && result.section.manifest.uses).toEqual(['shop', 'consent']);
    expect(result.ok && result.section.scriptMeta).toEqual({ uses: ['consent'], parts: ['consent'], classes: [] });
  });
});
