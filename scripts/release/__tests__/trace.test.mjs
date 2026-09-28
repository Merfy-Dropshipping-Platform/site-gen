/**
 * Запись входов для памяти результатов (spec 115, часть 3). Память пропускает
 * проверку, только если знает ВСЁ, что та читала, — поэтому каждый путь
 * чтения проверяется на настоящих файлах и настоящих процессах.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, promises as fsp, readdirSync, existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHasher, hashOf } from '../lib/file-hash.mjs';
import { staticClosure } from '../lib/trace/static-closure.mjs';

const require = createRequire(import.meta.url);
const PRELOAD = fileURLToPath(new URL('../lib/trace/child-preload.cjs', import.meta.url));
const fresh = () => mkdtempSync(join(tmpdir(), 'trace-'));

test('отпечаток: правка содержимого, новый файл в каталоге и пропажа файла видны', () => {
  const root = fresh();
  mkdirSync(join(root, 'd'));
  writeFileSync(join(root, 'd/a.txt'), 'один');
  const h1 = createHasher(root, { memoFile: join(root, 'memo.json') });
  const a1 = h1.hashPath('d/a.txt');
  const dir1 = h1.hashPath('d');
  writeFileSync(join(root, 'd/a.txt'), 'два!');
  writeFileSync(join(root, 'd/b.txt'), 'новый');
  const h2 = createHasher(root, { memoFile: join(root, 'memo.json') });
  assert.notEqual(h2.hashPath('d/a.txt'), a1, 'правка того же размера не видна');
  assert.notEqual(h2.hashPath('d'), dir1, 'новый файл в каталоге не виден');
  assert.equal(h2.hashPath('d/нет.txt'), 'absent');
  assert.equal(hashOf(h2, ['d/a.txt', 'd/b.txt']), hashOf(h2, ['d/b.txt', 'd/a.txt', 'd/a.txt']));
});

test('замыкание импортов: статические, export from, литеральный import(), require; голые имена — мимо', () => {
  const root = fresh();
  writeFileSync(join(root, 'a.mjs'), `import { b } from "./b.mjs";\nimport "astro/runtime/server/index.js";\nconst d = () => import('../x/data.json');\nexport * from './e.mjs';`);
  writeFileSync(join(root, 'b.mjs'), `import x from "./c.mjs";`);
  writeFileSync(join(root, 'c.mjs'), `export default 1;`);
  writeFileSync(join(root, 'e.mjs'), `export const e = 1;`);
  mkdirSync(join(root, '../x'), { recursive: true });
  writeFileSync(join(root, 'cjs.js'), `const y = require("./y");\nconst z = require(someVar);`);
  writeFileSync(join(root, 'y.js'), `module.exports = 1;`);
  const got = [...staticClosure([join(root, 'a.mjs'), join(root, 'cjs.js')])].map((p) => p.replace(`${root}/`, '')).sort();
  assert.deepEqual(got, ['a.mjs', 'b.mjs', 'c.mjs', 'cjs.js', 'e.mjs', 'y.js']);
});

test('обёртка fs: запись видит sync, async, promises, каталоги и проверку существования', async () => {
  const root = fresh();
  writeFileSync(join(root, 'f1'), '1');
  writeFileSync(join(root, 'f2'), '2');
  const tracer = require('../lib/trace/fs-tracer.cjs').install();
  const scope = tracer.openScope('тест');
  readFileSync(join(root, 'f1'));
  await fsp.readFile(join(root, 'f2'));
  readdirSync(root);
  existsSync(join(root, 'нет'));
  tracer.noteAll([join(root, 'из-потока')]);
  tracer.closeScope(scope);
  readFileSync(join(root, 'f1'));
  const got = [...scope.reads].map((p) => p.replace(`${root}/`, '').replace(root, '.')).sort();
  assert.deepEqual(got, ['.', 'f1', 'f2', 'из-потока', 'нет']);
});

test('дочерний процесс: fs, require и import записаны в MERFY_TRACE_OUT', () => {
  const root = fresh();
  writeFileSync(join(root, 'data.txt'), 'x');
  writeFileSync(join(root, 'dep.cjs'), 'module.exports = 1;');
  writeFileSync(join(root, 'dep.mjs'), 'export default 2;');
  writeFileSync(join(root, 'main.mjs'), `
    import { readFileSync } from 'node:fs';
    import { createRequire } from 'node:module';
    import d from './dep.mjs';
    readFileSync(${JSON.stringify(join(root, 'data.txt'))});
    createRequire(import.meta.url)('./dep.cjs');
  `);
  const out = join(root, 'trace.txt');
  const r = spawnSync(process.execPath, [join(root, 'main.mjs')], {
    env: { ...process.env, NODE_OPTIONS: `--require ${PRELOAD}`, MERFY_TRACE_OUT: out },
    encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stderr);
  // Загрузчики пишут путь с разрешёнными ссылками (/private/var), fs — как передали (/var).
  const real = (p) => (existsSync(p) ? realpathSync(p) : p);
  const lines = new Set(readFileSync(out, 'utf-8').split('\n').filter(Boolean).map(real));
  for (const f of ['data.txt', 'dep.cjs', 'dep.mjs', 'main.mjs']) {
    assert.ok(lines.has(real(join(root, f))), `нет ${f} в записи: ${[...lines].join(', ')}`);
  }
});

test('сеть наружу из процесса под записью — «гонять всегда»; свой 127.0.0.1 — нет', async () => {
  const net = await import('node:net');
  const tracer = require('../lib/trace/fs-tracer.cjs').install();
  const scope = tracer.openScope('сеть');
  // Сокет закрывается сразу: пометка ставится до соединения, сеть не нужна.
  for (const host of ['127.0.0.1', 'localhost', '203.0.113.7']) {
    const s = new net.Socket();
    s.on('error', () => {});
    s.connect({ host, port: 9 });
    s.destroy();
  }
  tracer.closeScope(scope);
  assert.deepEqual(scope.volatile, ['сеть: 203.0.113.7']);
});

test('import() литералом в обратных кавычках — вход; по вычисляемому пути — замыкание неполно', () => {
  const root = fresh();
  writeFileSync(join(root, 'a.mjs'), 'const x = () => import(`./b.mjs`);\nconst y = () => import("astro/x.js");');
  writeFileSync(join(root, 'b.mjs'), 'export default 1;');
  writeFileSync(join(root, 'c.mjs'), 'const z = (p) => import(p);');
  const ab = staticClosure([join(root, 'a.mjs')]);
  assert.ok(ab.has(join(root, 'b.mjs')), 'литерал в обратных кавычках не разобран');
  assert.deepEqual(ab.dynamic, [], 'голое имя пакета — не вычисляемый путь');
  assert.deepEqual(staticClosure([join(root, 'c.mjs')]).dynamic, [join(root, 'c.mjs')]);
});
