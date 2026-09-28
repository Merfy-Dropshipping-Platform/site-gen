/**
 * Хук загрузки ES-модулей для child-preload.cjs: путь каждого загруженного
 * файла дописывается в MERFY_TRACE_OUT. Хуки живут в своём потоке, поэтому
 * пишем сразу, синхронно, а не копим до выхода.
 */
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let out = null;

export async function initialize(data) {
  out = data?.out ?? null;
}

export async function load(url, context, nextLoad) {
  if (out && url.startsWith('file:')) {
    try {
      appendFileSync(out, `${fileURLToPath(url.split('?')[0])}\n`);
    } catch {
      /* запись входов не должна ронять сам процесс */
    }
  }
  return nextLoad(url, context);
}
