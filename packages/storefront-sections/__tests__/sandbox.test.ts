import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SANDBOX, prepareInWorker } from '../src/sandbox';

const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/workers/${name}.mjs`, import.meta.url));
const INPUT = {
  prefix: 'nova',
  files: {
    'section.json': JSON.stringify({ sdk: 1, name: 'scarf-colors', kind: 'section', title: 'Цвета шарфа' }),
    'template.astro': '<p>Цвета</p>',
  },
};
const messageOf = (result: Awaited<ReturnType<typeof prepareInWorker>>): string =>
  result.ok ? '' : (result.problems[0]?.message ?? '');
// macOS сам добавляет каждому процессу __CF_USER_TEXT_ENCODING, даже при пустом окружении.
const OS_ENV = process.platform === 'darwin' ? ['__CF_USER_TEXT_ENCODING'] : [];

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
    expect(messageOf(exited)).toBe('процесс сборки завершился с кодом 3');
    const garbage = await prepareInWorker(INPUT, { ...DEFAULT_SANDBOX, workerPath: fixture('garbage') });
    expect(messageOf(garbage)).toBe('процесс сборки ответил не JSON');
  });

  it('окружение процесса пустое: переменных окружения сборщика у него нет', async () => {
    process.env.MERFY_SANDBOX_PROBE = 'секрет';
    const result = await prepareInWorker(INPUT, { ...DEFAULT_SANDBOX, workerPath: fixture('env') });
    expect(messageOf(result)).toBe(`env:${OS_ENV.join(',')}`);
  });

  it('права процесса: без записи файлов, дочерних процессов, потоков и аддонов; WASI — есть', async () => {
    const result = await prepareInWorker(INPUT, { ...DEFAULT_SANDBOX, workerPath: fixture('permission') });
    const allowed: unknown = JSON.parse(messageOf(result));
    expect(allowed).toEqual({
      'fs.write': false,
      child: false,
      worker: false,
      addon: false,
      wasi: true,
    });
  });

  it('пробный рендер — в процессе рендера: шаблон, который падает с умолчаниями, — render-failed', async () => {
    const files = {
      ...INPUT.files,
      'template.astro': '---\nconst { settings } = Astro.props;\n---\n<p>{settings.a.b}</p>',
    };
    const result = await prepareInWorker({ ...INPUT, files });
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['render-failed']);
  });
});
