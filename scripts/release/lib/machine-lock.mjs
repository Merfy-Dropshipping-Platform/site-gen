/**
 * Очередь тяжёлых прогонов на одну машину (spec 115, часть 1).
 *
 * Зачем. 25.09 два агента гоняли полный набор гардов одновременно: нагрузка
 * доходила до 370 на 10 ядер, один и тот же сегмент шёл то 58, то 294 с, а
 * гарды краснели без единой ошибки в коде (таймаут хука 5 с, SIGSEGV воркера).
 * Два прогона по очереди заканчиваются раньше, чем два разом.
 *
 * Как. Замок — flock(2) на файле ~/.cache/merfy-checks/heavy.lock. В Node flock
 * нет, а perl есть в macOS из коробки: маленький процесс perl берёт замок,
 * печатает «locked» и ждёт конца stdin. Умер наш процесс (даже по kill -9 или
 * по таймауту инструмента) — ядро закрывает трубу, perl выходит, замок снят.
 * Поэтому зависших замков не бывает, и чистить нечего.
 *
 * Кто держит замок, пишется рядом, в heavy.lock.owner.json, — только для
 * строки «в очереди за …». На сам замок этот файл не влияет: не записался —
 * замок всё равно наш, строка просто беднее.
 *
 * В CI замка нет: там у каждой джобы своя машина.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_LOCK_FILE = join(homedir(), '.cache', 'merfy-checks', 'heavy.lock');

/** perl: открыть файл, дождаться flock(LOCK_EX), сказать «locked», держать до конца stdin. */
const HOLDER = [
  'open(my $f, ">>", $ARGV[0]) or die "open $ARGV[0]: $!\\n";',
  'flock($f, 2) or die "flock: $!\\n";',
  '$| = 1; print "locked\\n";',
  'while (<STDIN>) {}',
].join(' ');

const DISABLED = Object.freeze({ release: () => {}, waitedMs: 0, disabled: true });

/** Замок не нужен: CI, явное выключение или замок уже держит родительский процесс. */
export const lockDisabled = (env = process.env) =>
  env.CI === 'true' || env.MERFY_CHECKS_LOCK === 'off' || env.MERFY_CHECKS_LOCK_HELD === '1';

/**
 * Большой ли прогон jest. Весь набор (путей нет), каталог или 4+ файлов —
 * большой: ему нужны все ядра. Один-три файла — точечная отладка, без очереди.
 */
export function isHeavyJestRun(args, isDir) {
  if (args.length === 0) return true;
  if (args.length >= 4) return true;
  return args.some((a) => isDir(a));
}

const ownerFile = (lockFile) => `${lockFile}.owner.json`;

function readOwner(lockFile) {
  try {
    return JSON.parse(readFileSync(ownerFile(lockFile), 'utf-8'));
  } catch {
    return null;
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

const seconds = (ms) => Math.round(ms / 1000);

function queueLine(lockFile, waitingSince) {
  const o = readOwner(lockFile);
  // Владельца убили kill -9 — его запись осталась, но замок держит уже кто-то другой.
  const who = o && alive(o.pid) ? `${o.label} (${o.cwd}), идёт ${seconds(Date.now() - o.since)} с` : 'другой прогон';
  return `⏳ очередь на машину: жду ${seconds(Date.now() - waitingSince)} с — сейчас идёт ${who}`;
}

/** Дождаться «locked» от perl; умер раньше — ошибка с его stderr. */
function waitLocked(holder) {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    holder.stdout.on('data', (b) => {
      out += b;
      if (out.includes('locked')) resolve();
    });
    holder.stderr.on('data', (b) => { err += b; });
    holder.once('error', (e) => reject(new Error(`замок не взят: ${e.message}`)));
    holder.once('exit', (code) => reject(new Error(`замок не взят: perl вышел с кодом ${code}${err ? `: ${err.trim()}` : ''}`)));
  });
}

/** Труба к perl не должна держать наш процесс: закончили — выходим, ядро снимет замок. */
function detach(holder) {
  holder.removeAllListeners('exit');
  holder.removeAllListeners('error');
  holder.stdout.removeAllListeners('data');
  holder.stderr.removeAllListeners('data');
  for (const s of [holder, holder.stdin, holder.stdout, holder.stderr]) s.unref();
}

/**
 * Взять замок. Ждёт, пока его отпустит другой прогон, и раз в reportEveryMs
 * пишет, кого ждёт. Возвращает release(): вызвать, когда тяжёлая часть
 * закончилась. Не вызвали — замок снимется сам при выходе процесса.
 */
export async function acquireMachineLock({
  label,
  lockFile = process.env.MERFY_CHECKS_LOCK_FILE ?? DEFAULT_LOCK_FILE,
  log = (s) => console.error(s),
  reportEveryMs = 10_000,
  env = process.env,
} = {}) {
  if (lockDisabled(env)) return DISABLED;
  mkdirSync(dirname(lockFile), { recursive: true });

  const holder = spawn('perl', ['-e', HOLDER, lockFile], { stdio: ['pipe', 'pipe', 'pipe'] });
  const started = Date.now();
  const report = setInterval(() => log(queueLine(lockFile, started)), reportEveryMs);
  try {
    await waitLocked(holder);
  } catch (e) {
    holder.kill();
    throw e;
  } finally {
    clearInterval(report);
  }
  // Замок наш: сразу отвязываемся от perl, что бы ни случилось дальше.
  detach(holder);

  const waitedMs = Date.now() - started;
  if (waitedMs >= 1000) log(`✓ очередь прошла за ${seconds(waitedMs)} с — начинаю: ${label}`);
  const me = { label, cwd: process.cwd(), pid: process.pid, since: Date.now() };
  try {
    writeFileSync(ownerFile(lockFile), JSON.stringify(me));
  } catch {
    /* запись только для строки «в очереди за …» — замок от неё не зависит */
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (readOwner(lockFile)?.pid === me.pid) rmSync(ownerFile(lockFile), { force: true });
    holder.stdin.end();
    holder.kill();
  };
  return { release, waitedMs, disabled: false };
}

/**
 * То же, но недоступная очередь (нет perl, нет прав на ~/.cache) не роняет
 * прогон: предупреждение — и работа без очереди, как было до неё.
 */
export async function acquireMachineLockOrWarn(opts = {}) {
  const log = opts.log ?? ((s) => console.error(s));
  try {
    return await acquireMachineLock(opts);
  } catch (e) {
    log(`⚠ очередь на машину недоступна (${e.message}) — иду без неё`);
    return DISABLED;
  }
}
