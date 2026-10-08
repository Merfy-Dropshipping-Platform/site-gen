import { describe, expect, it } from 'vitest';
import { StorefrontConfigError } from '../src/errors';
import { parseStorefrontConfig, readStorefrontConfig, type ConfigSource } from '../src/read';
import { storefrontConfigSchema } from '../src/schema';
import { configTag } from '../src/tag';
import { standConfig, withField } from './support';

// Страница с тегом из HTML: getElementById находит его по id и отдаёт текст между «>» и последним «<».
// Внутри тега «<» нет — его экранирует configTag, поэтому последний «<» — начало </script>.
function pageWith(tag: string | null): ConfigSource {
  return {
    getElementById: (id) => {
      if (tag === null || !tag.includes(`id="${id}"`)) return null;
      return { textContent: tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('<')) };
    },
  };
}

function readError(read: () => unknown): StorefrontConfigError {
  try {
    read();
  } catch (error) {
    if (error instanceof StorefrontConfigError) return error;
    throw error;
  }
  throw new Error('читатель принял конфиг, а не должен');
}

const BROKEN: [string, string, unknown][] = [
  ['нет shop.id', 'shop.id', undefined],
  ['mode: draft', 'mode', 'draft'],
  ['shop.name — число', 'shop.name', 42],
  ['shop.url — число', 'shop.url', 5],
  ['currency: USD', 'currency', 'USD'],
  ['locale нет', 'locale', undefined],
  ['api.url пустой', 'api.url', ''],
  ['theme.version нет', 'theme.version', undefined],
  ['page.path нет', 'page.path', undefined],
];

describe('readStorefrontConfig', () => {
  it('туда и обратно: тег писателя читается в тот же объект', () => {
    expect(readStorefrontConfig(pageWith(configTag(standConfig)))).toEqual(standConfig);
  });

  it('имя магазина с </script> и <!-- читается как было', () => {
    const config = { ...standConfig, shop: { ...standConfig.shop, name: 'Лавка </script> <!--' } };
    expect(readStorefrontConfig(pageWith(configTag(config))).shop.name).toBe('Лавка </script> <!--');
  });

  it('нет тега — config-missing', () => {
    const error = readError(() => readStorefrontConfig(pageWith(null)));
    expect(error.code).toBe('config-missing');
    expect(error.message).toBe('на странице нет тега #merfy-config');
  });
});

describe('parseStorefrontConfig', () => {
  it('битый JSON — config-invalid, причина сохранена', () => {
    const error = readError(() => parseStorefrontConfig('{"v": 1,'));
    expect(error.code).toBe('config-invalid');
    expect(error.message).toBe('в теге не JSON');
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it('v: 2 — config-version с путём v', () => {
    const error = readError(() => parseStorefrontConfig(JSON.stringify(withField('v', 2))));
    expect(error.code).toBe('config-version');
    expect(error.message).toBe('v: читатель знает только версию 1');
  });

  it('нет shop.id — путь в ошибке', () => {
    const error = readError(() => parseStorefrontConfig(JSON.stringify(withField('shop.id', undefined))));
    expect(error.code).toBe('config-invalid');
    expect(error.message).toBe('shop.id: нужна непустая строка');
  });

  it.each(BROKEN)('%s — config-invalid с путём поля', (_title, path, value) => {
    const error = readError(() => parseStorefrontConfig(JSON.stringify(withField(path, value))));
    expect(error.code).toBe('config-invalid');
    expect(error.path).toBe(path);
  });

  it('preview без адреса магазина — url: null годится', () => {
    expect(parseStorefrontConfig(JSON.stringify(standConfig)).shop.url).toBeNull();
  });

  it('читатель не строже схемы: всё, что он отвергает, отвергает и схема', () => {
    const rejected = BROKEN.map(([, path, value]) => withField(path, value));
    expect(rejected.filter((config) => storefrontConfigSchema.safeParse(config).success)).toEqual([]);
  });
});
