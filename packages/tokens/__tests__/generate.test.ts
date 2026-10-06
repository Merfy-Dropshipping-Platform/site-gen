import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import themeWithExtension from '../fixtures/theme-with-extension/theme.json';
import { platformDictionary } from '../src/dictionary';
import { packageFiles, themeFiles } from '../src/generate/files';
import { dictionaryJsonSchema, themeTokensJsonSchema } from '../src/generate/json-schema';
import { tokensMarkdown } from '../src/generate/markdown';
import { GENERATED_NOTE, tailwindCss } from '../src/generate/tailwind';
import { TOKEN_KINDS } from '../src/kinds';
import { parseTheme } from '../src/values';
import { sample } from './support';

const extension = parseTheme(themeWithExtension.tokens);

const fileText = (path: string): string => {
  const url = new URL(`../${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

describe('сторож расхождения: файлы на диске = генерация в памяти', () => {
  it.each(Object.entries(packageFiles(platformDictionary)))('%s', (path, text) => {
    expect(fileText(path), 'файл устарел — запустите: pnpm generate').toBe(text);
  });

  it.each(Object.entries(themeFiles(extension.dictionary)))('fixtures/theme-with-extension/%s', (path, text) => {
    const hint = 'файл устарел — запустите: pnpm generate --theme fixtures/theme-with-extension';
    expect(fileText(`fixtures/theme-with-extension/${path}`), hint).toBe(text);
  });
});

describe('что внутри', () => {
  it('Tailwind: шапка, выключатели встроенного, ширина как контейнер, утилиты и варианты', () => {
    const css = tailwindCss(platformDictionary);
    expect(css.startsWith(`/* ${GENERATED_NOTE} */\n@theme inline reference {\n  --color-*: initial;\n`)).toBe(true);
    expect(css).toContain('  --color-primary-hover: var(--primary-hover);\n');
    expect(css).toContain('  --text-2xl--line-height: var(--text-2xl--line-height);\n');
    expect(css).toContain('  --container-page: var(--width-page);\n');
    expect(css).toContain('@utility weight-heading { font-weight: var(--weight-heading); }\n');
    expect(css).toContain(
      '@utility border-width-card { border-style: solid; border-width: var(--border-width-card); }\n',
    );
    expect(css).toContain(
      '@custom-variant card-style-card (&:where([data-card-style="card"], [data-card-style="card"] *));\n',
    );
  });

  it('TOKENS.md: строка на токен, правило словами, умолчание значением', () => {
    const markdown = tokensMarkdown(platformDictionary);
    expect(markdown.split('\n').filter((line) => line.startsWith('| `'))).toHaveLength(78);
    expect(markdown).toContain(
      '| `primary-hover` | цвет | Главная кнопка под курсором | наведение от `primary` | ' +
        '`bg-primary-hover` `text-primary-hover` `border-primary-hover` | — |',
    );
    expect(markdown).toContain(
      '| `choice-card-style` | выбор | Вид карточки товара: стандарт или карточка | `standard` | ' +
        '`card-style-standard:` `card-style-card:` | — |',
    );
    expect(markdown).toContain('| `foreground` | цвет | Основной текст | задаёт тема |');
  });

  it('схема значений темы: базовые обязательны, схемы называются scheme-N', () => {
    expect(themeTokensJsonSchema(platformDictionary)).toMatchObject({
      properties: {
        root: { required: Object.keys(sample.tokens.root) },
        schemes: {
          propertyNames: { pattern: '^scheme-[1-9][0-9]*$' },
          additionalProperties: { required: ['background', 'foreground', 'primary', 'destructive'] },
        },
      },
      required: ['root', 'schemes'],
    });
  });

  it('схема темы с расширением знает свои токены', () => {
    expect(themeTokensJsonSchema(extension.dictionary)).toMatchObject({
      properties: {
        root: { properties: { 'radius-theme-pill': { description: 'Капсула для тегов' } } },
        schemes: {
          additionalProperties: { required: ['background', 'foreground', 'primary', 'destructive', 'theme-gold'] },
        },
      },
    });
  });

  it('схема словаря: вид из списка, описание от трёх знаков', () => {
    expect(dictionaryJsonSchema()).toMatchObject({
      properties: {
        tokens: {
          additionalProperties: {
            properties: { kind: { enum: [...TOKEN_KINDS] }, about: { minLength: 3 } },
            required: ['kind', 'about', 'group'],
          },
        },
      },
    });
  });
});
