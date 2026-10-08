import { z } from 'zod';
import { INDEXNOW_URL } from './indexnow';
import { parseWith } from './parse';

// Настройки сборщика — из переменных окружения приложения Coolify (design.md блока 6, раздел 4: «число мест — из
// настроек; на dev — 1»). Ошибка называет переменную, но не значение: значения бывают секретами.
const count = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  // Адрес API платформы для конфига витрины (блок 3): https://gateway.dev.merfy.ru/api на dev.
  STOREFRONT_API_URL: z.url(),
  // Коммит образа: справка в манифесте сборки (блок 4, В4-1 В). Coolify отдаёт его приложению сам.
  SOURCE_COMMIT: z.string().regex(/^[0-9a-f]{40}$/),
  PORT: count(8080),
  BUILD_SLOTS: count(1),
  DRAW_SLOTS: count(1),
  DRAW_TIMEOUT_MS: count(3_000),
  BUILD_LEASE_MS: count(300_000),
  RECONCILE_MS: count(3_600_000),
  PRODUCT_TIMEOUT_MS: count(10_000),
  // Магазины для поиска: robots.txt открыт и есть карта сайта (блок 5). На dev — нет.
  STOREFRONT_INDEXABLE: z.enum(['true', 'false']).default('false'),
  // IndexNow (design.md, раздел 4): ключ — тот же, что у раздачи (блок 5); нет ключа — уведомлений нет.
  INDEXNOW_KEY: z.string().min(8).optional(),
  INDEXNOW_URL: z.url().default(INDEXNOW_URL),
});

// Паузы перед повторами упавшей сборки: три запуска — первый и два повтора (раздел 4, В6-4).
export const RETRY_DELAYS_MS = [5_000, 30_000] as const;

export interface Settings {
  databaseUrl: string;
  rabbitmqUrl: string;
  s3: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  apiUrl: string;
  commit: string;
  port: number;
  buildSlots: number;
  drawSlots: number;
  drawTimeoutMs: number;
  leaseMs: number;
  reconcileMs: number;
  productTimeoutMs: number;
  indexable: boolean;
  indexNow: { key: string; endpoint: string } | null;
}

export function readSettings(env: NodeJS.ProcessEnv): Settings {
  const value = parseWith(envSchema, env, 'settings-invalid', 'env');
  return {
    databaseUrl: value.DATABASE_URL,
    rabbitmqUrl: value.RABBITMQ_URL,
    s3: {
      endpoint: value.S3_ENDPOINT,
      bucket: value.S3_BUCKET,
      accessKeyId: value.S3_ACCESS_KEY,
      secretAccessKey: value.S3_SECRET_KEY,
    },
    apiUrl: value.STOREFRONT_API_URL,
    commit: value.SOURCE_COMMIT,
    port: value.PORT,
    buildSlots: value.BUILD_SLOTS,
    drawSlots: value.DRAW_SLOTS,
    drawTimeoutMs: value.DRAW_TIMEOUT_MS,
    leaseMs: value.BUILD_LEASE_MS,
    reconcileMs: value.RECONCILE_MS,
    productTimeoutMs: value.PRODUCT_TIMEOUT_MS,
    indexable: value.STOREFRONT_INDEXABLE === 'true',
    indexNow: value.INDEXNOW_KEY === undefined ? null : { key: value.INDEXNOW_KEY, endpoint: value.INDEXNOW_URL },
  };
}
