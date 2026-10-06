import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizePassport } from '../src/passport/normalize';
import { PACKAGE_ROOT, packagePath } from '../src/paths';
import { serveFolder, type StaticServer } from './support/static-server';

// Vitest собирает код без keepNames, а tsx (им идут команды stand:*) — с ним. Функция для page.evaluate с именованной
// функцией внутри падает только под tsx: «__name is not defined». Поэтому сбор проверяется ещё и через tsx.
// Запуск — асинхронный: тестовый сервер живёт в этом же процессе и должен отвечать, пока tsx открывает страницу.
const execFileAsync = promisify(execFile);
let server: StaticServer;

beforeAll(async () => {
  server = await serveFolder(packagePath('fixtures/test-page'));
});

afterAll(async () => {
  await server.close();
});

describe('сбор паспорта под tsx', () => {
  it('команды снимают паспорт тестовой страницы без ошибок', async () => {
    const script = '__tests__/support/collect-with-tsx.ts';
    const run = await execFileAsync('pnpm', ['exec', 'tsx', script, `${server.url}/index.html`], { cwd: PACKAGE_ROOT });
    const passport = normalizePassport(JSON.parse(run.stdout));
    expect(passport.scripts.map((entry) => entry.src)).toEqual(['#merfy-config', '/app.*.js']);
    expect(passport.storage).toEqual(['local:merfy:cartId', 'session:stand:visit']);
    expect(passport.tokens).toEqual({ '--background': '#ffffff' });
  });
});
