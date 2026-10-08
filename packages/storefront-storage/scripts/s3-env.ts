import type { S3StoreOptions } from '../src/s3-store';

// Хранилище для служебных команд — из переменных окружения S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY. Их
// значения команды не печатают. Нет переменной — команда останавливается и называет её, а не значение.
const NAMES = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const;

export function s3FromEnv(env: NodeJS.ProcessEnv = process.env): S3StoreOptions {
  const missing = NAMES.filter((name) => (env[name] ?? '') === '');
  if (missing.length > 0) throw new Error(`нет переменных окружения: ${missing.join(', ')}`);
  return {
    endpoint: env.S3_ENDPOINT ?? '',
    bucket: env.S3_BUCKET ?? '',
    accessKeyId: env.S3_ACCESS_KEY ?? '',
    secretAccessKey: env.S3_SECRET_KEY ?? '',
  };
}
