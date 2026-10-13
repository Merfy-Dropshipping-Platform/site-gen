import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STACK } from './stack';

// Библиотека шрифтов на стенде (блок 12): сборка новой темы вписывает файлы шрифтов в манифест, а правило публикации
// files-present не выпустит сборку, если их нет в хранилище. Как на dev («Выкатка на dev», шаг 1): перед стековыми
// тестами льём файлы Onest — шрифта nova — тем же `fonts:upload`. Лежащие файлы не льются и сети не просят; первый
// запуск на новом стенде качает их с jsDelivr.
const STORAGE = fileURLToPath(new URL('../../../storefront-storage', import.meta.url));
const { endpoint, bucket, accessKeyId, secretAccessKey } = STACK.s3;
const ENV = { S3_ENDPOINT: endpoint, S3_BUCKET: bucket, S3_ACCESS_KEY: accessKeyId, S3_SECRET_KEY: secretAccessKey };

export default function setup(): void {
  try {
    execFileSync('pnpm', ['fonts:upload', '--only', 'onest'], { cwd: STORAGE, env: { ...process.env, ...ENV } });
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(`библиотека шрифтов не залита в хранилище стенда: ${stderr || String(error)}`);
  }
}
