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
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const { port, flag, renderer, trace } = workerData;
const pristineFetch = globalThis.fetch;
let loaded = null;
let generation = 0;

/**
 * Запись входов для памяти результатов (spec 115, часть 3), только если мост
 * её попросил. Модули секций второй вызов не читает — поэтому их берём
 * статическим замыканием от модуля каждого задания. Всё прочее, что поток
 * прочитал через fs с момента запуска (манифесты, theme.json, конвейер
 * dist/src), отдаём каждому вызову с запасом: кэш модуля мог прочитать это
 * для прошлого вызова и не читать снова.
 */
const tracing = trace ? await setUpTracing(trace) : null;

async function setUpTracing({ fsTracer, staticClosure: closurePath }) {
  const tracer = createRequire(import.meta.url)(fsTracer).install();
  const sticky = tracer.openScope('render-worker');
  const { staticClosure } = await import(pathToFileURL(closurePath).href);
  const memo = new Map();
  // import(modPath) самого рендерера — это модуль задания, он приходит через onModule;
  // поэтому «вычисляемый import()» рендерера замыкание не портит.
  const rendererClosure = staticClosure([renderer], memo);
  return {
    inputsOf(modules, stubs) {
      const own = staticClosure([...modules, ...stubs], memo);
      return {
        inputs: [...new Set([...own, ...rendererClosure, ...sticky.reads])],
        volatile: own.dynamic.map((f) => `import() по вычисляемому пути в ${f.split('/').slice(-2).join('/')}`),
      };
    },
  };
}

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
  const modules = [];
  const stdout = JSON.stringify(await renderJobs(theme, parseJobsArg(jobsArg), { onModule: (m) => modules.push(m) }));
  return { stdout, ...tracing?.inputsOf(modules, stubs) };
}

port.on('message', async (req) => {
  try {
    reply({ ok: true, ...(await handle(req)) });
  } catch (e) {
    reply({ ok: false, error: String(e?.stack ?? e) });
  }
});
