import { describe, expect, it } from 'vitest';
import { parseCommand, readCommandSettings } from '../../src/release/command';

const HASH = `sha256:${'b'.repeat(64)}`;
const ENV = {
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db',
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_BUCKET: 'merfy',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_PUBLIC_URL: 'https://minio.example/merfy/',
};

// Ошибка вызова — значением: у toThrow(expect.objectContaining(…)) аргумент без типа, его не пропускает линтер пакета
// (no-unsafe-argument).
function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('разбор команды выпуска', () => {
  it('start со всеми флагами', () => {
    const argv = ['start', 'nova', '--test-shop', 's1', '--no-shots', '--version', '0.2.0', '--expect-hash', HASH];
    expect(parseCommand(argv)).toEqual({
      name: 'start',
      theme: 'nova',
      testShop: 's1',
      version: '0.2.0',
      shots: false,
      expectHash: HASH,
    });
  });

  it('start без флагов', () => {
    expect(parseCommand(['start', 'nova'])).toEqual({
      name: 'start',
      theme: 'nova',
      testShop: null,
      version: null,
      shots: true,
      expectHash: null,
    });
  });

  it('approve, status, skip, revert-all', () => {
    expect(parseCommand(['approve', '12'])).toEqual({ name: 'approve', release: 12 });
    expect(parseCommand(['status'])).toEqual({ name: 'status', release: null });
    expect(parseCommand(['status', '7'])).toEqual({ name: 'status', release: 7 });
    expect(parseCommand(['skip', '12', 's2'])).toEqual({ name: 'skip', release: 12, shop: 's2' });
    expect(parseCommand(['revert-all', '12'])).toEqual({ name: 'revert-all', release: 12 });
    expect(parseCommand(['extension', 'reviews', '1.2.0'])).toEqual({
      name: 'extension',
      extension: 'reviews',
      version: '1.2.0',
    });
  });

  it.each([
    [['launch']],
    [['approve', 'x']],
    [['approve']],
    [['start', 'nova', '--expect-hash', 'abc']],
    [['start', 'nova', '--colour', 'red']],
  ])('ошибка release-args: %j', (argv) => {
    expect(thrown(() => parseCommand(argv))).toMatchObject({ code: 'release-args' });
  });

  it('настройки: без S3_PUBLIC_URL — settings-invalid; хвостовой / срезан; контур по умолчанию dev', () => {
    expect(thrown(() => readCommandSettings({ ...ENV, S3_PUBLIC_URL: undefined }))).toMatchObject({
      code: 'settings-invalid',
    });
    expect(readCommandSettings(ENV)).toMatchObject({ publicUrl: 'https://minio.example/merfy', contour: 'dev' });
  });
});

// Блок 15, часть 15з: новая версия нашей секции во всех магазинах — сухой прогон по умолчанию.
describe('разбор команды section', () => {
  it('без флагов — сухой прогон, тема nova; запись — только с --write', () => {
    expect(parseCommand(['section', '../storefront-shell/sections/cart-drawer'])).toEqual({
      name: 'section',
      folder: '../storefront-shell/sections/cart-drawer',
      write: false,
      testShop: null,
      theme: 'nova',
    });
    expect(parseCommand(['section', 'x', '--write', '--test-shop', 's1', '--theme', 'nova'])).toEqual({
      name: 'section',
      folder: 'x',
      write: true,
      testShop: 's1',
      theme: 'nova',
    });
  });
});
