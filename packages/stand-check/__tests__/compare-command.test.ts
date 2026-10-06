import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsonText } from '../src/json-files';
import { PACKAGE_ROOT } from '../src/paths';
import { broken, cleanPassport } from './support/passports';

// Команда целиком, как её запустит тестировщик: tsx src/cli/compare.ts <a.json> <b.json>.
// Паспорта — unknown: команда обязана сама отвергнуть файл, который паспортом не является.
async function compareCommand(before: unknown, after: unknown) {
  const dir = await mkdtemp(path.join(tmpdir(), 'stand-compare-'));
  await writeFile(path.join(dir, 'a.json'), jsonText(before));
  await writeFile(path.join(dir, 'b.json'), jsonText(after));
  return spawnSync('pnpm', ['exec', 'tsx', 'src/cli/compare.ts', path.join(dir, 'a.json'), path.join(dir, 'b.json')], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  });
}

describe('stand:compare', () => {
  it('два одинаковых паспорта — «Чисто», код выхода 0, путь к отчёту', async () => {
    const result = await compareCommand(cleanPassport(), cleanPassport());
    expect(result.stdout).toContain('Чисто: прогоны совпадают');
    expect(result.stdout).toMatch(/Отчёт: .*reports\/.*\/index\.html/);
    expect(result.status).toBe(0);
  });

  it('глобал во втором паспорте — «Красный», код выхода 1', async () => {
    const result = await compareCommand(cleanPassport(), broken('global'));
    expect(result.stdout).toContain('Красный: 1 отличие');
    expect(result.status).toBe(1);
  });

  it('правка цвета из панели — «Жёлтый», код выхода 0', async () => {
    const result = await compareCommand(cleanPassport(), broken('panel'));
    expect(result.stdout).toContain('Жёлтый: 2 отличия');
    expect(result.status).toBe(0);
  });

  it('файл не паспорт — текст ошибки и код выхода 2', async () => {
    const result = await compareCommand(cleanPassport(), { ...cleanPassport(), version: 2 });
    expect(result.stderr).toContain('passport-invalid');
    expect(result.status).toBe(2);
  });
});
