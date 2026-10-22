import { frame, serve } from './frames.mjs';

// Подставной процесс рендера: отвечает с ключом, но чужим id — render.ts останавливает процесс и отклоняет рендер.
serve((key) => frame(key, 999, { html: 'чужой ответ' }));
