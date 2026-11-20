import { frame, serve } from './frames.mjs';

// Подставной процесс рендера старой формы для тестов render.ts: отвечает html без cpuMs через delay мс стенных часов,
// delay — в module запроса. Родитель судит такой ответ по стенным часам.
serve((key, request) => setTimeout(() => frame(key, request.id, { html: 'old' }), Number(request.module)));
