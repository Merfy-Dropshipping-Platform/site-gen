/**
 * Поток тёплого рендера отвечает ВСЕГДА: обычным HTML, ошибкой рендера или
 * падением мимо обработчика. Не ответит — вызывающий гард ждал бы до таймаута
 * в 120 с, а необработанная ошибка потока уронила бы весь воркер jest вместе
 * с чужими гардами (ревью spec 115). Вместо настоящего рендерера — модули с
 * тем же контрактом (renderJobs, parseJobsArg), чтобы проверка шла без сборки.
 *
 *   node --test src/themes/__tests__/render-worker.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./render-worker.mjs', import.meta.url));

function fakeRenderer(body) {
  const file = join(mkdtempSync(join(tmpdir(), 'render-worker-')), 'renderer.mjs');
  writeFileSync(file, `export const parseJobsArg = (s) => JSON.parse(s);\nexport async function renderJobs(theme, jobs) {\n${body}\n}\n`);
  return file;
}

/** Один вызов потока синхронно, как в render-bridge-install.cjs. */
function callOnce(renderer, timeoutMs = 10_000) {
  const { port1, port2 } = new MessageChannel();
  const flag = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(WORKER, { workerData: { port: port2, flag, renderer }, transferList: [port2] });
  worker.on('error', () => {});
  try {
    port1.postMessage({ theme: 'rose', jobsArg: '[{"block":"Hero"}]', stubs: [] });
    const waited = Atomics.wait(flag, 0, 0, timeoutMs);
    return { waited, msg: receiveMessageOnPort(port1)?.message };
  } finally {
    worker.terminate();
  }
}

test('обычный рендер — HTML в том же JSON, что у командной строки', () => {
  const { msg } = callOnce(fakeRenderer('return jobs.map((j) => ({ block: j.block, html: `<p>${theme}</p>` }));'));
  assert.equal(msg.ok, true);
  assert.equal(msg.stdout, JSON.stringify([{ block: 'Hero', html: '<p>rose</p>' }]));
});

test('ошибка рендера — ответ с ошибкой, поток жив', () => {
  const { msg } = callOnce(fakeRenderer('throw new Error("нет манифеста");'));
  assert.equal(msg.ok, false);
  assert.equal(msg.fatal, undefined);
  assert.match(msg.error, /нет манифеста/);
});

test('оторванный промис в рендере — ответ fatal сразу, а не тишина до таймаута', () => {
  const started = Date.now();
  const { waited, msg } = callOnce(fakeRenderer('Promise.reject(new Error("оторвался")); return new Promise(() => {});'));
  assert.notEqual(waited, 'timed-out', 'поток промолчал до таймаута');
  assert.ok(Date.now() - started < 5000);
  assert.equal(msg.ok, false);
  assert.equal(msg.fatal, true);
  assert.match(msg.error, /оторвался/);
});
