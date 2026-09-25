/**
 * Тёплый рендер секций для jest (spec 115, часть 2).
 *
 * Раньше каждый рендер в гарде — новый процесс node: загрузка Astro, модулей
 * темы, конвейера dist/src, рендер, выход. Это 0,65–1,2 с на рендер; те же
 * рендеры в уже запущенном процессе — 16 мс (замер 25.09). Файлы гардов с
 * такими процессами давали 90% времени всего набора.
 *
 * Этот поток живёт рядом с воркером jest и держит всё загруженным. Рендерит
 * ТА ЖЕ функция renderJobs, что и командная строка render-theme-sections.mjs.
 * Отличие одно: модули не перечитываются между вызовами. Совпадение HTML
 * с отдельным процессом сторожит режим MERFY_RENDER_BRIDGE=verify
 * (render-bridge-install.cjs) и workflow render-verify.yml.
 *
 * Заглушки каталога (`node --import <заглушка>`) при загрузке подменяют
 * globalThis.fetch и читают env и задания из argv. Поэтому на каждый вызов
 * возвращаем исходный fetch, выставляем argv и загружаем заглушку заново
 * (свой ?r= — свой экземпляр модуля): ровно то, что делал новый процесс.
 *
 * Ответ приходит всегда: обычный, ошибка рендера или падение потока мимо
 * обработчика (необработанное исключение, оторванный промис). Иначе
 * вызывающий ждал бы до таймаута, а необработанная ошибка потока уронила бы
 * весь воркер jest вместе с чужими гардами.
 */
import { workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

const { port, flag, renderer } = workerData;
const pristineFetch = globalThis.fetch;
let loaded = null;
let generation = 0;

function reply(res) {
  port.postMessage(res);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
}

// Поток после такого падения больше не доверяем: fatal — и мост его заменит.
const fatal = (e) => reply({ ok: false, fatal: true, error: String(e?.stack ?? e) });
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);

async function handle({ theme, jobsArg, stubs }) {
  loaded ??= import(pathToFileURL(renderer).href);
  const { renderJobs, parseJobsArg } = await loaded;
  globalThis.fetch = pristineFetch;
  process.argv = [process.argv[0], 'render-worker', theme, jobsArg];
  generation += 1;
  for (const stub of stubs) await import(`${pathToFileURL(stub).href}?r=${generation}`);
  return JSON.stringify(await renderJobs(theme, parseJobsArg(jobsArg)));
}

port.on('message', async (req) => {
  try {
    reply({ ok: true, stdout: await handle(req) });
  } catch (e) {
    reply({ ok: false, error: String(e?.stack ?? e) });
  }
});
