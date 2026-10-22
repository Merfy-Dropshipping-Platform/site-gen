import { frame, serve } from './frames.mjs';

// Подставной процесс рендера: ответ на свой id, но без ключа процесса — так подделывает ответ модуль секции.
serve((key, request) => frame('0'.repeat(32), request.id, { html: 'подделка' }));
