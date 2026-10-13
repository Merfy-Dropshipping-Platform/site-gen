import { fontRegistryJsonSchema } from '../fonts/registry';
import { panelJsonSchema } from '../panel/shape';
import type { Dictionary, JsonSchema } from '../types';
import { dictionaryJsonSchema, themeTokensJsonSchema } from './json-schema';
import { tokensMarkdown } from './markdown';
import { GENERATED_NOTE, tailwindCss } from './tailwind';

// Что пишет команда generate: путь от папки пакета или темы → текст файла. Тест расхождения строит то же в памяти
// и сравнивает с файлами на диске.
export type GeneratedFiles = Record<string, string>;

const jsonText = (schema: JsonSchema): string =>
  `${JSON.stringify({ $comment: GENERATED_NOTE, ...schema }, null, 2)}\n`;

// Пакет: шесть файлов в generated/. panel.schema.json — форма схемы панели темы (блок 8), её JSON лежит в
// packages/theme-contract/panel/; fonts.schema.json — форма реестра шрифтов (блок 12), реестр — в
// packages/theme-contract/fonts/fonts.json.
export function packageFiles(dictionary: Dictionary): GeneratedFiles {
  return {
    'generated/tailwind.css': tailwindCss(dictionary),
    'generated/TOKENS.md': tokensMarkdown(dictionary),
    'generated/theme.schema.json': jsonText(themeTokensJsonSchema(dictionary)),
    'generated/dictionary.schema.json': jsonText(dictionaryJsonSchema()),
    'generated/panel.schema.json': jsonText(panelJsonSchema()),
    'generated/fonts.schema.json': jsonText(fontRegistryJsonSchema()),
  };
}

// Тема: три файла в <папка темы>/generated/tokens/ — по словарю темы, вместе с её расширением.
export function themeFiles(dictionary: Dictionary): GeneratedFiles {
  return {
    'generated/tokens/tailwind.css': tailwindCss(dictionary),
    'generated/tokens/TOKENS.md': tokensMarkdown(dictionary),
    'generated/tokens/theme.schema.json': jsonText(themeTokensJsonSchema(dictionary)),
  };
}
