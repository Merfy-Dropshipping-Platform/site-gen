import { writeSync } from 'node:fs';
import { createInterface } from 'node:readline';

// Рамки ответа процесса рендера, как у render-worker.ts: первая строка stdin — ключ, ответ — «<ключ> <id> <байт>\n» и
// JSON в дескриптор 3. answer(request) — ответ подставного процесса на запрос; frame(key, id, value) — рамка как есть.
export function frame(key, id, value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  writeSync(3, `${key} ${id} ${payload.length}\n`);
  writeSync(3, payload);
}

export function serve(answer) {
  let key = null;
  createInterface({ input: process.stdin }).on('line', (line) => {
    if (key === null) {
      key = line;
      frame(key, 0, { ready: true });
      return;
    }
    answer(key, JSON.parse(line));
  });
}
