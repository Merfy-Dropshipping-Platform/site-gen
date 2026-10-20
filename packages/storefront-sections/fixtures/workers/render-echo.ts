import { createInterface } from 'node:readline';

// Подставной процесс рендера для тестов render.ts: "module" — модуль пришёл в запросе, "no-module" — не пришёл.
process.stdout.write('{"ready":true}\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  const request: unknown = JSON.parse(line);
  const id = Number(Reflect.get(Object(request), 'id'));
  const html = Reflect.get(Object(request), 'module') === undefined ? 'no-module' : 'module';
  process.stdout.write(`${JSON.stringify({ id, html })}\n`);
});
