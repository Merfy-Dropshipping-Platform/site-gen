import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Файлы шрифтов стенда (блок 12): стенд темы раздаёт /_fonts/ из packages/theme-contract/fonts/.cache, а папки нет в
// git. Перед браузерными тестами nova кладём туда файлы Onest — шрифта nova — тем же `fonts:upload --to-dir`, что и
// задача 7 плана. Иначе в свежей копии и в CI файлы шрифтов отвечают 404 и стенд краснеет. Так же стековые тесты
// сборщика льют их в хранилище стенда (storefront-builder, __tests__/stack/fonts-setup.ts).
const STORAGE = fileURLToPath(new URL('../../storefront-storage', import.meta.url));

export default function setup(): void {
  try {
    execFileSync('pnpm', ['fonts:upload', '--only', 'onest', '--to-dir', '../theme-contract/fonts/.cache'], {
      cwd: STORAGE,
    });
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(`файлы шрифтов стенда не скачаны: ${stderr || String(error)}`);
  }
}
