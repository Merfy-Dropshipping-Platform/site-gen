import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENERATED_NOTE, generatedFiles } from '../src/generated-files';

const fileText = (path: string): string => {
  const url = new URL(`../${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

describe('сторож расхождения: файлы generated/ = генерация в памяти', () => {
  it.each(Object.entries(generatedFiles()))('%s', (path, text) => {
    expect(fileText(path), 'файл устарел — запустите: pnpm generate').toBe(text);
  });
});

describe('JSON Schema конфига', () => {
  const schema: unknown = JSON.parse(generatedFiles()['generated/storefront-config.schema.json']);

  it('строгая: все поля обязательны, лишние ключи запрещены на каждом уровне', () => {
    expect(schema).toMatchObject({
      $comment: GENERATED_NOTE,
      additionalProperties: false,
      required: ['v', 'mode', 'shop', 'currency', 'locale', 'api', 'theme', 'page'],
      properties: {
        v: { const: 1 },
        mode: { enum: ['live', 'preview'] },
        shop: { additionalProperties: false, required: ['id', 'name', 'url'] },
        currency: { const: 'RUB' },
        locale: { const: 'ru-RU' },
        api: { additionalProperties: false, required: ['url'] },
        theme: { additionalProperties: false, required: ['id', 'version'] },
        page: { additionalProperties: false, required: ['id', 'path'] },
      },
    });
  });
});
