import { createInterface } from 'node:readline';

// Подставной процесс рендера: отвечает чужим id — render.ts останавливает процесс и отклоняет ждущие рендеры.
process.stdout.write('{"ready":true}\n');
createInterface({ input: process.stdin }).on('line', () => {
  process.stdout.write('{"id":999,"html":"чужой ответ"}\n');
});
