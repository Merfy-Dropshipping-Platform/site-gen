import { describe, expect, it } from 'vitest';
import { readLaunch } from '../src/isolation';
import { sandboxReport } from '../src/sandbox-report';

// Проба песочницы с правами процесса рендера (блок 2 «Секций и SDK»). Сеть модель разрешений закрывает только с Node 25:
// в CI тест сети идёт на Node 26 из SECTION_RENDER_NODE; без него — пропуск.
const launch = readLaunch(process.env);
// macOS сам добавляет каждому процессу __CF_USER_TEXT_ENCODING, даже при пустом окружении.
const OS_ENV = process.platform === 'darwin' ? 1 : 0;
const nodeMajor = (version: string): number => Number(version.split('.')[0]);

describe('проба песочницы', () => {
  it('окружение пустое; дочерние процессы, потоки, запись, чтение вне папок, инспектор и WASI закрыты', async () => {
    const report = await sandboxReport(launch);
    expect(report).toMatchObject({
      env: OS_ENV,
      child: 'closed',
      worker: 'closed',
      write: 'closed',
      read: 'closed',
      inspector: 'closed',
      wasi: 'closed',
      // Без пула пользователей у пробы и соседа один uid: сигнал соседу прошёл бы.
      neighbour: launch.users === null ? 'open' : 'closed',
      user: launch.users === null ? 'same' : 'separate',
    });
    expect(report.startMs).toBeGreaterThan(0);
  });

  it('Node не запустился — отчёт отклонён, процесс, который его просил, работает дальше', async () => {
    await expect(sandboxReport({ node: '/нет/node', users: null })).rejects.toThrow('ENOENT');
  });

  it.skipIf(process.env.SECTION_RENDER_NODE === undefined)('Node 26 из SECTION_RENDER_NODE: сеть закрыта', async () => {
    const report = await sandboxReport(launch);
    expect(nodeMajor(report.node)).toBeGreaterThanOrEqual(25);
    expect(report.net).toBe('closed');
  });
});
