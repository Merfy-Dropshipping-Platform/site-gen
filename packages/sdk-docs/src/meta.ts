import { fileURLToPath } from 'node:url';

// Адрес API шлюза прода — в файлах документации (Р14-6); сборщик dev при раздаче заменяет его своим.
export const API_BASE = 'https://gateway.merfy.ru/api/';
export const DOCS_BASE = `${API_BASE}storefront/sdk/`;
export const SDK_VERSION = 1;
export const AGENTS_MAX_CHARS = 2000;
// Папка пакета — для чтения guide/, examples/, template/ и записи generated/.
export const PACKAGE_DIR: string = fileURLToPath(new URL('..', import.meta.url));
