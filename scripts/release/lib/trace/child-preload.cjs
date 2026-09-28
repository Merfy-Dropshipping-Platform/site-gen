/**
 * Запись входов дочернего процесса node (spec 115, часть 3).
 *
 * Подключается через NODE_OPTIONS="--require <этот файл>" и MERFY_TRACE_OUT=<файл>.
 * Всё, что процесс прочитал через fs, и все модули ES, которые он загрузил,
 * дописываются в MERFY_TRACE_OUT при выходе — по пути на строку. Внуки
 * наследуют NODE_OPTIONS и пишут туда же: так записывается целое дерево
 * процессов (pnpm → tsx → node).
 *
 * Модули CommonJS ловятся обёрткой fs (загрузчик CJS читает их через
 * fs.readFileSync), модули ES — хуком загрузки: их загрузчик fs не зовёт.
 */
const out = process.env.MERFY_TRACE_OUT;

if (out) {
  const { appendFileSync } = require('node:fs');
  const { join } = require('node:path');
  const { pathToFileURL } = require('node:url');
  const tracer = require('./fs-tracer.cjs').install();
  const scope = tracer.openScope('child');
  try {
    require('node:module').register(pathToFileURL(join(__dirname, 'esm-load-hook.mjs')), { data: { out } });
  } catch {
    // Нет module.register (старый node) — модули ES не запишутся; такая
    // запись неполна, и память ей не доверится.
    appendFileSync(out, '!volatile:esm-hook-unavailable\n');
  }
  process.on('exit', () => {
    tracer.closeScope(scope);
    const lines = [...scope.reads, ...scope.volatile.map((v) => `!volatile:${v}`)];
    if (lines.length) appendFileSync(out, `${lines.join('\n')}\n`);
  });
}
