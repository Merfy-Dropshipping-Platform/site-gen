import { describe, expect, it } from 'vitest';
import { StorefrontBuilderError } from '../src/errors';
import { jsonLog } from '../src/log';
import { RETRY_DELAYS_MS, readSettings } from '../src/settings';
import { createSlots } from '../src/slots';

// Настройки из окружения, журнал и места — без сети. Значения в тестах — только для тестов, не секреты.
const ENV = {
  DATABASE_URL: 'postgres://u:p@db:5432/sites_service',
  RABBITMQ_URL: 'amqp://u:p@rabbit:5672',
  S3_ENDPOINT: 'http://minio:9000',
  S3_BUCKET: 'storefront',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret-value',
  STOREFRONT_API_URL: 'https://gateway.dev.merfy.ru/api',
  SOURCE_COMMIT: 'a'.repeat(40),
};

describe('настройки', () => {
  it('обязательные — из окружения, остальные — по умолчанию (dev: одно место сборки, одно дорисовки)', () => {
    expect(readSettings(ENV)).toEqual({
      databaseUrl: ENV.DATABASE_URL,
      rabbitmqUrl: ENV.RABBITMQ_URL,
      s3: { endpoint: ENV.S3_ENDPOINT, bucket: 'storefront', accessKeyId: 'key', secretAccessKey: 'secret-value' },
      apiUrl: ENV.STOREFRONT_API_URL,
      commit: ENV.SOURCE_COMMIT,
      port: 8080,
      buildSlots: 1,
      drawSlots: 1,
      drawTimeoutMs: 3000,
      leaseMs: 300_000,
      reconcileMs: 3_600_000,
      productTimeoutMs: 10_000,
      indexable: false,
      indexNow: null,
    });
    expect(RETRY_DELAYS_MS).toEqual([5000, 30_000]);
  });

  it('числа и флаг поиска — из строк окружения', () => {
    const settings = readSettings({ ...ENV, BUILD_SLOTS: '2', DRAW_SLOTS: '4', STOREFRONT_INDEXABLE: 'true' });
    expect(settings).toMatchObject({ buildSlots: 2, drawSlots: 4, indexable: true });
    const indexNow = readSettings({ ...ENV, INDEXNOW_KEY: 'key-12345678' }).indexNow;
    expect(indexNow).toEqual({ key: 'key-12345678', endpoint: 'https://yandex.com/indexnow' });
  });

  it('нет переменной или коммит не 40 знаков — settings-invalid с именем переменной, без значения', () => {
    expect(() => readSettings({ ...ENV, S3_SECRET_KEY: undefined })).toThrow(/^env#S3_SECRET_KEY: /);
    let caught: unknown;
    try {
      readSettings({ ...ENV, SOURCE_COMMIT: 'dev', BUILD_SLOTS: '0' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StorefrontBuilderError);
    expect(caught).toMatchObject({ code: 'settings-invalid', path: 'env#SOURCE_COMMIT' });
    expect(String(caught)).not.toContain('secret-value');
  });
});

describe('журнал', () => {
  it('одна строка JSON: время, сообщение, плоские поля', () => {
    const lines: string[] = [];
    const log = jsonLog(
      (line) => lines.push(line),
      () => new Date('2026-10-08T09:00:00.000Z'),
    );
    log('step', { buildId: 7, step: 'snapshot', ms: 12 });
    log('builder-stopped');
    expect(lines).toEqual([
      '{"at":"2026-10-08T09:00:00.000Z","msg":"step","buildId":7,"step":"snapshot","ms":12}\n',
      '{"at":"2026-10-08T09:00:00.000Z","msg":"builder-stopped"}\n',
    ]);
  });
});

describe('места', () => {
  it('занять сверх размера нельзя; освобождение — один раз, повторное ничего не меняет', () => {
    const slots = createSlots(2);
    const first = slots.take();
    const second = slots.take();
    expect(slots.take()).toBeNull();
    expect(slots.free()).toBe(0);
    first?.();
    first?.();
    expect(slots.free()).toBe(1);
    second?.();
    expect(slots.free()).toBe(2);
  });
});
