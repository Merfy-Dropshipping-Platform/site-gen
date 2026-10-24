import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Секции для проверки поведений и появлений на тест-магазине (блок 6, часть 6б; Р6б-9): проходят проверку приёма без
// предупреждений.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

function merfy(...args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', 'scripts/merfy.ts', ...args],
      { cwd: PACKAGE_DIR },
      (error, stdout) => resolve({ code: error === null ? 0 : Number(Reflect.get(error, 'code')), stdout }),
    );
  });
}

describe('секции для проверки поведений (часть 6б)', () => {
  it('«Слайд-шоу» и «Вопросы с плавным раскрытием» из fixtures/shop проходят без предупреждений', async () => {
    for (const name of ['slideshow', 'questions'])
      expect(await merfy('section', 'check', `fixtures/shop/${name}`)).toEqual({
        code: 0,
        stdout: `shop:${name}: проверка прошла\n`,
      });
  }, 90_000);
});
