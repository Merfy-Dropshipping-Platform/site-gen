/**
 * Запуск команд и печать чисел. Ничего специфичного для релиза — только то,
 * без чего каждый шаг превращается в «что-то пошло не так».
 */
import { spawnSync } from 'node:child_process';

/** Выполнить команду. Возвращает {code, out, err, all, ms}. Не бросает. */
export function run(cmd, args, opts = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  const out = r.stdout ?? '';
  const err = r.stderr ?? '';
  return {
    code: r.status ?? (r.error ? -1 : 0),
    out,
    err,
    all: `${out}${err}`,
    ms: Date.now() - started,
    error: r.error ?? null,
  };
}

/** То же, но через сам shell — для строк вида `pnpm a && pnpm b`. */
export function sh(command, opts = {}) {
  return run('/bin/sh', ['-c', command], opts);
}

/** git в заданном дереве; падение считается ошибкой вызывающего. */
export function git(cwd, ...args) {
  return run('git', args, { cwd });
}

/** git, который обязан был сработать. Бросает с понятным текстом. */
export function gitOk(cwd, ...args) {
  const r = git(cwd, ...args);
  if (r.code !== 0) {
    const e = new Error(`git ${args.join(' ')} → код ${r.code}\n${r.all.trim()}`);
    e.git = r;
    throw e;
  }
  return r.out.trim();
}

/** Последние n строк вывода — чтобы в отчёте была причина, а не «упало». */
export function tail(text, n = 30) {
  const lines = String(text).trimEnd().split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

/** Человеческая длительность: 95 c, 2 мин 15 с. */
export function dur(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s} с`;
  const m = Math.floor(s / 60);
  return `${m} мин ${String(s % 60).padStart(2, '0')} с`;
}
