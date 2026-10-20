import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SANDBOX, prepareInWorker } from '../src/sandbox';

const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/workers/${name}.ts`, import.meta.url));
const INPUT = {
  prefix: 'nova',
  files: {
    'section.json': JSON.stringify({ sdk: 1, name: 'scarf-colors', kind: 'section', title: 'Цвета шарфа' }),
    'template.astro': '<p>Цвета</p>',
  },
};

afterEach(() => {
  delete process.env.MERFY_SANDBOX_PROBE;
});

describe('приём в отдельном процессе', () => {
  it('секция собирается в отдельном процессе — ответ той же формы, что у prepareSection', async () => {
    expect(await prepareInWorker(INPUT)).toMatchObject({
      ok: true,
      section: { name: 'nova:scarf-colors', template: '<p>Цвета</p>', script: null },
    });
  });

  it('время вышло — процесс убит, отказ build-timeout', async () => {
    expect(await prepareInWorker(INPUT, { ...DEFAULT_SANDBOX, timeoutMs: 1 })).toEqual({
      ok: false,
      problems: [{ code: 'build-timeout', file: '', line: null, column: null, message: 'сборка дольше 1 мс' }],
    });
  });

  it('процесс упал или ответил не JSON — build-crashed', async () => {
    const exited = await prepareInWorker(INPUT, { ...DEFAULT_SANDBOX, workerPath: fixture('exit') });
    expect(exited.ok ? '' : exited.problems[0]?.message).toBe('процесс сборки завершился с кодом 3');
    const garbage = await prepareInWorker(INPUT, { ...DEFAULT_SANDBOX, workerPath: fixture('garbage') });
    expect(garbage.ok ? '' : garbage.problems[0]?.message).toBe('процесс сборки ответил не JSON');
  });

  it('окружение процесса — только предел памяти: переменных сборщика он не видит', async () => {
    process.env.MERFY_SANDBOX_PROBE = 'секрет';
    const result = await prepareInWorker(INPUT, { ...DEFAULT_SANDBOX, workerPath: fixture('env') });
    const names = result.ok ? [] : (result.problems[0]?.message.split(',') ?? []);
    expect(names).toContain('GOMEMLIMIT');
    expect(names).not.toContain('MERFY_SANDBOX_PROBE');
  });
});
