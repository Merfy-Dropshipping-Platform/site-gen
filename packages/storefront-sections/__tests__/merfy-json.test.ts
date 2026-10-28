import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// pnpm merfy section check <папка> --json (блок 14, 14.6): тот же JSON, что у адреса шлюза «проверить».
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

describe('pnpm merfy section check --json', () => {
  it('прошла — ok, полное имя, пустые списки, выход 0', async () => {
    // «Вопросы и ответы»: у «Первого экрана» есть предупреждения кода шаблона (taste-code.ts) до его переписывания.
    const run = await merfy('section', 'check', 'fixtures/shop/faq', '--json');
    expect(run.code).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ ok: true, name: 'shop:faq', problems: [], warnings: [] });
  }, 30_000);

  it('не прошла — место, код и doc; выход 1; AGENTS.md в папке не мешает', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'merfy-json-'));
    const manifest = { sdk: 1, name: 'hero', kind: 'section', title: 'Первый экран', settings: [] };
    await writeFile(join(dir, 'section.json'), JSON.stringify(manifest));
    await writeFile(join(dir, 'template.astro'), '<div>\n  <button onclick="x">a</button>\n</div>');
    await writeFile(join(dir, 'AGENTS.md'), '# правила для ИИ');
    const run = await merfy('section', 'check', dir, '--json');
    expect(run.code).toBe(1);
    expect(JSON.parse(run.stdout)).toEqual({
      ok: false,
      name: 'shop:hero',
      problems: [
        {
          code: 'template-forbidden',
          file: 'template.astro',
          line: 2,
          column: 11,
          message: 'обработчик onclick: события — только в script.ts',
          doc: 'errors.md#template-forbidden',
        },
      ],
      warnings: [],
    });
  }, 30_000);
});
