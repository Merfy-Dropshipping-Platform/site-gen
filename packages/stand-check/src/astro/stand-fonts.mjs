import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

// Файлы шрифтов стенда (design.md блока 12, «решил сам» 14): страница стенда берёт шрифт темы с /_fonts/, как магазин
// со своего домена. Файлы — из папки библиотеки packages/theme-contract/fonts/.cache/_fonts/; её наполняет
// `pnpm --filter @merfy/storefront-storage fonts:upload --only <ключ> --to-dir ../theme-contract/fonts/.cache` (сеть —
// один раз), дальше прогон стенда сети не требует. Папки нет — адресов нет: сценарий fonts-loaded скажет, чего не хватило.
// Путь к папке передаёт интеграция standRoute: Vite соберёт этот файл в чанк dist/.prerender/chunks/, и путь от его
// import.meta.url в packages/ уже не ведёт.
const CACHE = process.env.MERFY_STAND_FONTS_DIR ?? '';
const WOFF2 = '.woff2';

export const prerender = true;

/** @returns {{ params: { file: string } }[]} */
export function getStaticPaths() {
  const names = existsSync(CACHE) ? readdirSync(CACHE).filter((name) => name.endsWith(WOFF2)) : [];
  return names.map((file) => ({ params: { file } }));
}

/**
 * @param {{ params: { file?: string } }} context
 * @returns {Promise<Response>}
 */
export async function GET({ params }) {
  const bytes = await readFile(join(CACHE, params.file ?? ''));
  return new Response(bytes, { headers: { 'Content-Type': 'font/woff2' } });
}
