import { frame, serve } from './frames.mjs';

// Подставной процесс рендера для тестов render.ts: "module" — модуль пришёл в запросе, "no-module" — не пришёл.
serve((key, request) => frame(key, request.id, { html: request.module === undefined ? 'no-module' : 'module' }));
