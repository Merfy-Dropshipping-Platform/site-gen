import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// База страницы (блок 4 «Секций и SDK», Р4-12): preflight Tailwind и база словаря в @layer base — generated/base.css
// пакета @merfy/tokens, один файл на версию платформы. Печатается первым стилем головы, до шрифтов и токенов.
export const PAGE_BASE_CSS = readFileSync(createRequire(import.meta.url).resolve('@merfy/tokens/base.css'), 'utf8');
