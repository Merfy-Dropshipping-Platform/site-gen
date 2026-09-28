/**
 * Память зелёных результатов (spec 115, часть 3).
 *
 * Запись — утверждение «с ЭТИМИ входами проверка прошла, N проверок»: список
 * входов (пути относительно корня репозитория) с отпечатками на момент
 * прогона плюс общий ключ (lockfile, конфиг jest, версия node, env режимов).
 * Совпали общий ключ и отпечатки всех входов сейчас — результат тот же, гонять
 * не нужно. Пути относительные, поэтому память общая для всех worktree: что
 * прогнали в одном дереве, другое с тем же содержимым не гоняет.
 *
 * Хранится только зелёное: красное и неполное (без записи входов, «гонять
 * всегда») гоняется каждый раз. На проверку — до MAX_RECORDS записей, чтобы
 * ветки с разным содержимым не вытесняли друг друга.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_CACHE_DIR = join(homedir(), '.cache', 'merfy-checks', 'results');
const MAX_RECORDS = 8;

const fileOf = (dir, id) => join(dir, `${createHash('sha1').update(id).digest('hex')}.json`);

function load(dir, id) {
  try {
    return JSON.parse(readFileSync(fileOf(dir, id), 'utf-8')).records ?? [];
  } catch {
    return [];
  }
}

/** Запись, которой можно верить сейчас, или null. */
export function lookup({ dir = DEFAULT_CACHE_DIR, id, globalKey, hasher }) {
  const fits = (r) => r.global === globalKey && r.inputs.every(([rel, h]) => hasher.hashPath(rel) === h);
  return load(dir, id).find(fits) ?? null;
}

/**
 * Почему памяти нет — для `pnpm checks --plan`: нет записи, другой общий
 * ключ или какой вход изменился (у самой свежей записи).
 */
export function explainMiss({ dir = DEFAULT_CACHE_DIR, id, globalKey, hasher }) {
  const records = load(dir, id);
  if (!records.length) return 'нет записи';
  const same = records.filter((r) => r.global === globalKey);
  if (!same.length) return 'другой общий ключ (зависимости, конфиг jest, node, режимы env)';
  const changed = same[0].inputs.filter(([rel, h]) => hasher.hashPath(rel) !== h).map(([rel]) => rel);
  return changed.length ? `изменилось: ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ` и ещё ${changed.length - 3}` : ''}` : 'есть в памяти';
}

/** Запомнить зелёный результат. Отпечатки снимаются сейчас — сразу после прогона. */
export function store({ dir = DEFAULT_CACHE_DIR, id, globalKey, hasher, inputs, result }) {
  const record = {
    global: globalKey,
    inputs: [...new Set(inputs)].sort().map((rel) => [rel, hasher.hashPath(rel)]),
    result,
    at: new Date().toISOString(),
  };
  const same = (r) => r.global === record.global && JSON.stringify(r.inputs) === JSON.stringify(record.inputs);
  const records = [record, ...load(dir, id).filter((r) => !same(r))].slice(0, MAX_RECORDS);
  mkdirSync(dir, { recursive: true });
  // Через переименование: соседний прогон не прочитает полузаписанный файл.
  const file = fileOf(dir, id);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ id, records }));
  renameSync(tmp, file);
  return record;
}
