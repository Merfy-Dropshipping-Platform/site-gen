import { describe, expect, it } from 'vitest';
import standInputJson from '../fixtures/stand-input.json';
import { buildStorefrontConfig, type StorefrontConfigInput } from '../src/build';
import { StorefrontConfigError } from '../src/errors';
import { MODES, type StorefrontConfig } from '../src/schema';
import { standConfig } from './support';

// mode в JSON — просто строка: тип сужаем проверкой, а не приведением.
function modeOf(value: string): StorefrontConfig['mode'] {
  const mode = MODES.find((known) => known === value);
  if (mode === undefined) throw new Error(`fixtures/stand-input.json: неизвестный mode ${value}`);
  return mode;
}

const standInput: StorefrontConfigInput = { ...standInputJson, mode: modeOf(standInputJson.mode) };

// Строка сайта из базы: кроме id, имени и адреса там служебное — в конфиге этого быть не должно.
const TENANT_ID = 'org_7f3a91c2';
const COOLIFY_APP_UUID = 'zk0c8ww44ss4ckogo8w0test';
const siteRow = {
  ...standInputJson.site,
  tenantId: TENANT_ID,
  coolifyAppUuid: COOLIFY_APP_UUID,
  status: 'published',
  settings: { analytics: { yandexMetrikaId: '12345' } },
};

function buildError(input: StorefrontConfigInput): StorefrontConfigError {
  try {
    buildStorefrontConfig(input);
  } catch (error) {
    if (error instanceof StorefrontConfigError) return error;
    throw error;
  }
  throw new Error('писатель собрал конфиг, а не должен');
}

describe('buildStorefrontConfig', () => {
  it('вход стенда даёт эталон стенда: поле в поле и в том же порядке', () => {
    const config = buildStorefrontConfig(standInput);
    expect(config).toEqual(standConfig);
    expect(JSON.stringify(config)).toBe(JSON.stringify(standConfig));
  });

  it('лишние поля строки сайта в конфиг не попадают', () => {
    const config = buildStorefrontConfig({ ...standInput, site: siteRow });
    expect(config).toEqual(standConfig);
    expect(Object.keys(config.shop)).toEqual(['id', 'name', 'url']);
    expect(JSON.stringify(config)).not.toContain(TENANT_ID);
    expect(JSON.stringify(config)).not.toContain(COOLIFY_APP_UUID);
  });

  it('live без адреса — ошибка shop.url', () => {
    const error = buildError({ ...standInput, mode: 'live' });
    expect(error.code).toBe('config-invalid');
    expect(error.path).toBe('shop.url');
    expect(error.message).toBe('shop.url: у опубликованного магазина нужен адрес');
  });

  it('live с адресом — адрес в конфиге', () => {
    const site = { ...standInput.site, publicUrl: 'https://shop.merfy.ru' };
    expect(buildStorefrontConfig({ ...standInput, site, mode: 'live' }).shop.url).toBe('https://shop.merfy.ru');
  });

  it('preview без адреса — url: null, и для null, и для пустой строки', () => {
    const emptyUrl = { ...standInput.site, publicUrl: '' };
    expect(buildStorefrontConfig(standInput).shop.url).toBeNull();
    expect(buildStorefrontConfig({ ...standInput, site: emptyUrl }).shop.url).toBeNull();
  });

  it('адрес API без /api — ошибка api.url', () => {
    const error = buildError({ ...standInput, env: { apiUrl: 'https://gateway.merfy.ru' } });
    expect(error.path).toBe('api.url');
    expect(error.message).toBe('api.url: адрес API должен кончаться на /api');
  });

  it('тот же вход — тот же конфиг', () => {
    expect(buildStorefrontConfig(standInput)).toEqual(buildStorefrontConfig(standInput));
  });
});
