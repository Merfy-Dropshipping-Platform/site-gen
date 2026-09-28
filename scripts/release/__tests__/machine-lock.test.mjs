/**
 * Замок на машину: второй прогон ждёт первого, а умерший первый (kill -9,
 * таймаут инструмента) не оставляет висящего замка. Проверяется на настоящих
 * процессах: замок держит ядро, подделать это в памяти нельзя.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireMachineLock, isHeavyJestRun, lockDisabled } from '../lib/machine-lock.mjs';

const LIB = fileURLToPath(new URL('../lib/machine-lock.mjs', import.meta.url));
const freshLock = () => join(mkdtempSync(join(tmpdir(), 'machine-lock-')), 'heavy.lock');
const localEnv = { PATH: process.env.PATH, HOME: process.env.HOME };

/** Отдельный процесс, который берёт замок и держит его, пока его не убьют. */
function holderProcess(lockFile) {
  const code = `
    const { acquireMachineLock } = await import(${JSON.stringify(LIB)});
    await acquireMachineLock({ label: 'сосед', lockFile: ${JSON.stringify(lockFile)}, env: {} });
    console.log('held');
    setInterval(() => {}, 1000);
  `;
  const p = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
  const held = new Promise((resolve) => p.stdout.on('data', (b) => String(b).includes('held') && resolve()));
  return { p, held };
}

test('второй прогон ждёт, пока первый не отпустит замок', async (t) => {
  const lockFile = freshLock();
  const first = await acquireMachineLock({ label: 'первый', lockFile, env: localEnv });
  t.after(() => first.release());
  let secondGot = false;
  const lines = [];
  const second = acquireMachineLock({ label: 'второй', lockFile, env: localEnv, reportEveryMs: 100, log: (s) => lines.push(s) })
    .then((l) => { secondGot = true; t.after(() => l.release()); return l; });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(secondGot, false, 'второй взял замок, пока первый его держит');
  assert.ok(lines.some((l) => l.includes('первый')), `второй не сказал, кого ждёт: ${lines.join(' | ')}`);
  first.release();
  await second;
  assert.equal(secondGot, true);
});

test('умерший владелец (kill -9) не оставляет висящего замка', async (t) => {
  const lockFile = freshLock();
  const { p, held } = holderProcess(lockFile);
  t.after(() => p.kill('SIGKILL'));
  await held;
  let got = false;
  const waiting = acquireMachineLock({ label: 'после', lockFile, env: localEnv, reportEveryMs: 60_000 })
    .then((l) => { got = true; t.after(() => l.release()); return l; });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(got, false, 'замок взят при живом владельце');
  p.kill('SIGKILL');
  await waiting;
  assert.equal(got, true);
});

/** Отдельный процесс node; вернуть код выхода и вывод или «не вышел за ms». */
function runNode(code, { env, ms = 8000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = '';
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { out += b; });
    const timer = setTimeout(() => { p.kill('SIGKILL'); resolve({ code: 'не вышел', out }); }, ms);
    p.on('exit', (c) => { clearTimeout(timer); resolve({ code: c, out }); });
  });
}

test('не записался файл «кто держит» — замок всё равно наш, процесс выходит сам', async () => {
  const lockFile = freshLock();
  // Вместо файла владельца — каталог: writeFileSync упадёт с EISDIR.
  const r = await runNode(`
    import { mkdirSync } from 'node:fs';
    mkdirSync(${JSON.stringify(`${lockFile}.owner.json`)}, { recursive: true });
    const { acquireMachineLock } = await import(${JSON.stringify(LIB)});
    const l = await acquireMachineLock({ label: 'x', lockFile: ${JSON.stringify(lockFile)}, env: {} });
    console.log(l.disabled ? 'выключен' : 'взят');
  `);
  assert.equal(r.code, 0, `процесс не вышел сам после взятия замка: ${r.code} ${r.out}`);
  assert.match(r.out, /взят/);
});

test('нет perl — прогон идёт без очереди с предупреждением, а не падает', async () => {
  const lockFile = freshLock();
  const r = await runNode(`
    const { acquireMachineLockOrWarn } = await import(${JSON.stringify(LIB)});
    const l = await acquireMachineLockOrWarn({ label: 'x', lockFile: ${JSON.stringify(lockFile)}, env: {}, log: (s) => console.log(s) });
    console.log(l.disabled ? 'без очереди' : 'взят');
  `, { env: { PATH: '/nonexistent', HOME: process.env.HOME } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /очередь на машину недоступна/);
  assert.match(r.out, /без очереди/);
});

test('в CI и при выключенной очереди perl не запускается', async () => {
  const lockFile = freshLock();
  for (const env of [{ CI: 'true' }, { MERFY_CHECKS_LOCK: 'off' }, { MERFY_CHECKS_LOCK_HELD: '1' }]) {
    assert.equal(lockDisabled(env), true);
    const l = await acquireMachineLock({ label: 'x', lockFile, env });
    assert.equal(l.disabled, true);
    l.release();
  }
  assert.equal(existsSync(lockFile), false, 'выключенная очередь создала файл замка');
});

test('большой прогон: весь набор, каталог или 4+ файлов', () => {
  const isDir = (a) => a.endsWith('/') || a === 'src/themes/__tests__';
  assert.equal(isHeavyJestRun([], isDir), true);
  assert.equal(isHeavyJestRun(['src/themes/__tests__'], isDir), true);
  assert.equal(isHeavyJestRun(['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'd.spec.ts'], isDir), true);
  assert.equal(isHeavyJestRun(['a.spec.ts'], isDir), false);
  assert.equal(isHeavyJestRun(['a.spec.ts', 'b.spec.ts', 'c.spec.ts'], isDir), false);
});
