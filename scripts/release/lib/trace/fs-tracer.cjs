/**
 * Запись прочитанных файлов (spec 115, часть 3).
 *
 * Ставится один раз на контекст — процесс или поток: оборачивает функции fs
 * и складывает абсолютные пути в открытые записи. Кто держит запись, тот и
 * решает, что с ней делать (память результатов: «проверка читала эти файлы»).
 * Нет открытых записей — обёртка ничего не делает.
 *
 * Внутри воркера jest ставится в настоящем контексте процесса (не в песочнице
 * spec-файла), поэтому видит и тест, и код, который он вызвал. Собственное
 * чтение jest идёт через graceful-fs, который держит исходные функции, — оно
 * сюда не попадает, и не должно: модули файла известны из require.cache.
 */
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const { fileURLToPath } = require('node:url');

const KEY = Symbol.for('merfy.fsTracer');

const SYNC = ['readFileSync', 'readdirSync', 'existsSync', 'statSync', 'lstatSync', 'openSync', 'accessSync', 'realpathSync', 'opendirSync', 'createReadStream'];
const ASYNC = ['readFile', 'readdir', 'stat', 'lstat', 'open', 'access', 'realpath', 'opendir'];
const PROMISES = ['readFile', 'readdir', 'stat', 'lstat', 'open', 'access', 'realpath', 'opendir'];
// Запись — отдельно: тест, который правит исходники на время прогона, опасен
// для соседей в параллельном прогоне (spec 115: гонка conformance-theme-digest-isolation).
const WRITES_SYNC = ['writeFileSync', 'appendFileSync', 'renameSync', 'copyFileSync', 'rmSync', 'unlinkSync', 'truncateSync', 'cpSync'];
const WRITES_ASYNC = ['writeFile', 'appendFile', 'rename', 'copyFile', 'rm', 'unlink', 'truncate', 'cp'];

function toPath(p) {
  if (typeof p === 'string') return p;
  if (p instanceof URL) return p.protocol === 'file:' ? fileURLToPath(p) : null;
  if (Buffer.isBuffer(p)) return p.toString();
  return null;
}

function install() {
  if (fs[KEY]) return fs[KEY];
  const scopes = new Set();

  const note = (p) => {
    if (!scopes.size) return;
    const path = toPath(p);
    if (!path) return;
    for (const s of scopes) s.reads.add(path);
  };
  // У rename/copy/cp пишется второй аргумент; rm/unlink/truncate — первый.
  const TARGET_IS_SECOND = new Set(['renameSync', 'copyFileSync', 'cpSync', 'rename', 'copyFile', 'cp']);
  const noteWrite = (name, args) => {
    if (!scopes.size) return;
    const path = toPath(TARGET_IS_SECOND.has(name) ? args[1] : args[0]);
    if (!path) return;
    for (const s of scopes) s.writes.add(path);
  };

  // Обёртка сохраняет свойства исходной функции: у realpathSync есть .native.
  const wrap = (obj, name) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    const wrapped = function (p, ...rest) {
      note(p);
      return orig.call(this, p, ...rest);
    };
    Object.assign(wrapped, orig);
    obj[name] = wrapped;
  };
  for (const n of [...SYNC, ...ASYNC]) wrap(fs, n);
  for (const n of PROMISES) wrap(fs.promises, n);
  const wrapWrite = (obj, name) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    const wrapped = function (...args) {
      noteWrite(name, args);
      return orig.apply(this, args);
    };
    Object.assign(wrapped, orig);
    obj[name] = wrapped;
  };
  for (const n of [...WRITES_SYNC, ...WRITES_ASYNC]) wrapWrite(fs, n);
  for (const n of WRITES_ASYNC) wrapWrite(fs.promises, n);
  syncBuiltinESMExports();

  const api = {
    /** Открыть запись: всё, что прочитают до closeScope, попадёт в scope.reads. */
    openScope(id) {
      const scope = { id, reads: new Set(), writes: new Set(), volatile: [] };
      scopes.add(scope);
      return scope;
    },
    closeScope(scope) {
      scopes.delete(scope);
    },
    /** Входы, пришедшие не через fs (поток рендера, дочерний процесс). */
    noteAll(paths) {
      for (const p of paths) note(p);
    },
    /** Проверка сделала то, чего запись не видит: её нельзя брать из памяти. */
    markVolatile(reason) {
      for (const s of scopes) s.volatile.push(reason);
    },
    get active() {
      return scopes.size > 0;
    },
  };
  watchNetwork(api);
  Object.defineProperty(fs, KEY, { value: api });
  return api;
}

/**
 * Соединение не с этой машиной — результат зависит от сети, а не от файлов:
 * запись такого теста памяти не годится. Ловим на уровне сокета — через него
 * идут и http/https, и встроенный fetch. Свой сервер на 127.0.0.1 (supertest)
 * и unix-сокеты — не сеть.
 */
const LOCAL_HOST = /^(localhost|127(\.\d{1,3}){3}|::1|::ffff:127(\.\d{1,3}){3}|0\.0\.0\.0)$/i;

function watchNetwork(api) {
  const net = require('node:net');
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    // Внутренние вызовы передают уже разобранные аргументы массивом [options, cb].
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const opts = first !== null && typeof first === 'object' ? first : { port: first, host: args[1] };
    const host = String(opts.host ?? 'localhost');
    if (api.active && !opts.path && !LOCAL_HOST.test(host)) api.markVolatile(`сеть: ${host}`);
    return connect.apply(this, args);
  };
}

module.exports = { install };
