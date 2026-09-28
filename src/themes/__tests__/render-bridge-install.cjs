/**
 * Тёплый рендер секций в jest (spec 115, часть 2). Ставит render-bridge.cjs.
 *
 * Гарды рендерят секции так: execFileSync('node', [..., render-theme-sections.mjs,
 * тема, задания]). Каждый такой вызов — новый процесс и 0,65–1,2 с. Здесь этот
 * вызов уходит в поток render-worker.mjs, где Astro, модули тем и конвейер
 * уже загружены (16 мс на рендер). Код гардов не меняется: тот же вызов, тот
 * же JSON на выходе, та же функция renderJobs внутри.
 *
 * Уходит в поток только узнаваемый вызов: node, необязательные --import из
 * списка известных заглушек, рендерер, тема и задания. Всё прочее идёт
 * настоящим процессом, как раньше.
 *
 *   MERFY_RENDER_BRIDGE=off     — всегда настоящий процесс;
 *   MERFY_RENDER_BRIDGE=verify  — каждый рендер обоими путями, при расхождении
 *                                 HTML — ошибка с местом расхождения.
 *
 * Поток один на воркер jest и на набор env: env читается модулями при
 * загрузке, поэтому свой env — свой поток (как свой процесс раньше).
 *
 * Запись входов (spec 115, часть 3; включает MERFY_TRACE_DIR): поток отдаёт
 * входы каждого рендера, прочие дочерние node пишут свои через
 * child-preload.cjs, а процессы, которые записать нельзя (execSync, spawn…),
 * помечают spec-файл «гонять всегда». Всё это уходит в запись текущего файла
 * (scripts/release/lib/trace/jest-trace-setup.cjs).
 *
 * Этот модуль грузится НАСТОЯЩИМ require процесса (render-bridge.cjs), а не
 * из песочницы spec-файла: патч один на процесс, его ошибки — ошибки того же
 * мира, что у настоящего execFileSync, и песочницу первого spec-файла он
 * живой не держит. Кэш require делает установку однократной.
 */
const cp = require('node:child_process');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const { mkdtempSync, readFileSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, join, resolve } = require('node:path');
const { createHash } = require('node:crypto');

const MODE = process.env.MERFY_RENDER_BRIDGE ?? 'on';
const TRACING = Boolean(process.env.MERFY_TRACE_DIR);

const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const TRACE_LIB = resolve(SITES_ROOT, 'scripts/release/lib/trace');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const WORKER = resolve(__dirname, 'render-worker.mjs');
const KNOWN_STUBS = new Set([
  resolve(SITES_ROOT, 'scripts/qa/product-six-images-stub.mjs'),
  resolve(__dirname, 'product-description-stub.mjs'),
  resolve(__dirname, 'product-name-case-stub.mjs'),
  resolve(__dirname, 'storefront-data-stub.mjs'),
  resolve(__dirname, 'storefront-variants-stub.mjs'),
]);
const NODE = new Set(['node', process.execPath]);
const TIMEOUT_MS = 120_000;
const MAX_WORKERS = 4;
// Каждая заглушка грузится заново на вызов (свой ?r=), а выгрузить модуль
// ES нельзя. Поэтому поток живёт ограниченное число вызовов и меняется на
// свежий: запуск стоит ~0,5 с, на 250 вызовов это незаметно.
const MAX_CALLS = 250;
const original = cp.execFileSync;
const pool = new Map();
const tracer = TRACING ? require(join(TRACE_LIB, 'fs-tracer.cjs')).install() : null;

/** Разбор `node [--import заглушка]… рендерер тема задания`; чужой вызов — null. */
const parseCall = (file, args, cwd) => {
  if (!NODE.has(file) || !Array.isArray(args)) return null;
  const at = (a) => resolve(cwd ?? SITES_ROOT, a);
  const stubs = [];
  let i = 0;
  while (args[i] === '--import') {
    stubs.push(at(args[i + 1] ?? ''));
    i += 2;
  }
  if (at(args[i] ?? '') !== RENDERER || args.length !== i + 3) return null;
  if (!stubs.every((s) => KNOWN_STUBS.has(s))) return null;
  return { stubs, theme: args[i + 1], jobsArg: args[i + 2] };
};

const mtime = (f) => {
  try {
    return statSync(resolve(SITES_ROOT, f)).mtimeMs;
  } catch {
    return 0;
  }
};

/**
 * Отметка сборки: пересобрали посреди прогона — поток перезапускается.
 * manifest.json секций и блоков пишутся при каждой сборке целиком, а
 * dist/src собирается инкрементально (tsc меняет только изменившиеся .js),
 * поэтому для него — tsbuildinfo, который tsc трогает при любой правке.
 */
const stampOf = (theme) =>
  [
    `dist/theme-sections/${theme}/manifest.json`,
    'dist/astro-blocks/manifest.json',
    'dist/tsconfig.build.tsbuildinfo',
    'dist/src/render/resolve-props.js',
  ]
    .map(mtime)
    .join('/');

const spawnWorker = (env) => {
  const { port1, port2 } = new MessageChannel();
  const flag = new Int32Array(new SharedArrayBuffer(4));
  const trace = TRACING ? { fsTracer: join(TRACE_LIB, 'fs-tracer.cjs'), staticClosure: join(TRACE_LIB, 'static-closure.mjs') } : null;
  const worker = new Worker(WORKER, {
    workerData: { port: port2, flag, renderer: RENDERER, trace },
    transferList: [port2],
    ...(env ? { env } : {}),
  });
  worker.unref();
  const w = { worker, port: port1, flag, stamps: new Map(), calls: 0, dead: false };
  // Без слушателя ошибка потока уронила бы весь воркер jest вместе с чужими
  // гардами. Сам вызов о падении узнаёт из ответа потока (render-worker.mjs).
  worker.on('error', () => { w.dead = true; });
  worker.on('exit', () => { w.dead = true; });
  return w;
};

const drop = (envKey) => {
  pool.get(envKey)?.worker.terminate();
  pool.delete(envKey);
};

const workerFor = (envKey, env) => {
  const w = pool.get(envKey);
  if (w && !w.dead) return w;
  drop(envKey);
  if (pool.size >= MAX_WORKERS) drop(pool.keys().next().value);
  const fresh = spawnWorker(env);
  pool.set(envKey, fresh);
  return fresh;
};

/**
 * Поток отработал своё, сборка сменилась или он падал между вызовами (его
 * ответ о падении лежит в порту и достался бы следующему вызову) — меняем.
 */
const stale = (w, theme, stamp) => {
  let fellBetweenCalls = false;
  for (let m = receiveMessageOnPort(w.port); m; m = receiveMessageOnPort(w.port)) fellBetweenCalls ||= Boolean(m.message.fatal);
  return fellBetweenCalls || w.calls >= MAX_CALLS || (w.stamps.has(theme) && w.stamps.get(theme) !== stamp);
};

const renderWarm = (call, env) => {
  // env не передан — у потока настоящий env процесса, как у execFileSync без env.
  const envKey = env ? createHash('sha1').update(JSON.stringify(Object.entries(env).sort())).digest('hex') : 'process';
  const stamp = stampOf(call.theme);
  if (pool.has(envKey) && stale(pool.get(envKey), call.theme, stamp)) drop(envKey);
  const w = workerFor(envKey, env);
  w.stamps.set(call.theme, stamp);
  w.calls += 1;
  Atomics.store(w.flag, 0, 0);
  w.port.postMessage(call);
  const waited = Atomics.wait(w.flag, 0, 0, TIMEOUT_MS);
  const msg = receiveMessageOnPort(w.port);
  if (!msg || msg.message.fatal) drop(envKey);
  if (!msg) {
    throw new Error(`тёплый рендер не ответил (${call.theme})${waited === 'timed-out' ? ` за ${TIMEOUT_MS / 1000} с` : ''}`);
  }
  if (!msg.message.ok) {
    const e = new Error(`Command failed: render-theme-sections.mjs ${call.theme}\n${msg.message.error}`);
    e.status = 1;
    e.stderr = msg.message.error;
    throw e;
  }
  if (msg.message.inputs) tracer?.noteAll(msg.message.inputs);
  for (const reason of msg.message.volatile ?? []) tracer?.markVolatile(reason);
  return msg.message.stdout;
};

const firstDiff = (a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  return `символ ${i}: процесс «${a.slice(Math.max(0, i - 60), i + 60)}» / поток «${b.slice(Math.max(0, i - 60), i + 60)}»`;
};

/**
 * Дочерний node под записью: NODE_OPTIONS подключает child-preload.cjs, он
 * пишет прочитанное в свой файл, а мы переносим это в запись spec-файла.
 * Записываем и при падении процесса: его вход — тоже вход проверки.
 */
const runTracedChild = (self, file, args, opts, fn = original) => {
  const dir = mkdtempSync(join(tmpdir(), 'merfy-trace-'));
  const out = join(dir, 'reads.txt');
  const env = { ...(opts?.env ?? process.env) };
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --require ${join(TRACE_LIB, 'child-preload.cjs')}`.trim();
  env.MERFY_TRACE_OUT = out;
  try {
    return fn.call(self, file, args, { ...opts, env });
  } finally {
    let text = '';
    try {
      text = readFileSync(out, 'utf-8');
    } catch {
      /* процесс ничего не прочитал */
    }
    const lines = text.split('\n').filter(Boolean);
    if (lines.some((l) => l.startsWith('!volatile'))) tracer.markVolatile(`дочерний ${basename(String(args?.[0] ?? file))}: запись неполна`);
    tracer.noteAll(lines.filter((l) => !l.startsWith('!')));
    rmSync(dir, { recursive: true, force: true });
  }
};

const renderBridgeActive = MODE !== 'off';

const patched = function execFileSync(file, args, options) {
  const opts = Array.isArray(args) ? options : args;
  const call = renderBridgeActive ? parseCall(file, args, opts?.cwd) : null;
  if (!call) {
    const traceable = TRACING && tracer.active && NODE.has(file) && Array.isArray(args);
    return traceable ? runTracedChild(this, file, args, opts) : original.apply(this, arguments);
  }
  const stdout = renderWarm(call, opts?.env);
  if (MODE === 'verify') {
    const real = original.apply(this, arguments);
    const realText = typeof real === 'string' ? real : real.toString('utf-8');
    if (realText !== stdout) {
      throw new Error(`тёплый рендер разошёлся с процессом (${call.theme}, ${call.jobsArg.slice(0, 120)}): ${firstDiff(realText, stdout)}`);
    }
    return real;
  }
  const enc = opts?.encoding;
  return enc && enc !== 'buffer' ? stdout : Buffer.from(stdout, 'utf-8');
};

/**
 * Процессы, входы которых не записать (execSync через shell, spawn и прочее),
 * делают spec-файл «гонять всегда». Браузер Playwright — не в счёт: он видит
 * только то, что тест ему передал.
 */
const isBrowser = (file) => /ms-playwright|chrom/i.test(String(file));
const markingVolatile = (name) => {
  const orig = cp[name];
  return function (file, ...rest) {
    if (tracer.active && !isBrowser(file)) tracer.markVolatile(`child_process.${name}: ${basename(String(file)).slice(0, 60)}`);
    return orig.call(this, file, ...rest);
  };
};

/** spawnSync дочернего node пишется так же, как execFileSync; прочее — «гонять всегда». */
const spawnSyncOrig = cp.spawnSync;
const spawnSyncMarking = markingVolatile('spawnSync');
const spawnSyncTraced = function spawnSync(file, args, options) {
  const traceable = tracer.active && NODE.has(file) && Array.isArray(args);
  return traceable ? runTracedChild(this, file, args, options, spawnSyncOrig) : spawnSyncMarking.apply(this, arguments);
};

if (renderBridgeActive || TRACING) cp.execFileSync = patched;
if (TRACING) {
  for (const name of ['execSync', 'spawn', 'exec', 'execFile', 'fork']) cp[name] = markingVolatile(name);
  cp.spawnSync = spawnSyncTraced;
}
