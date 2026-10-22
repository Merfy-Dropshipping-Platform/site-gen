import { namesWith } from '../names';
import { namesMarkdown } from './names-markdown';
import { namesJsonSchema } from './names-schema';
import { jsonText } from './note';
import { sectionJsonSchema } from './section-schema';
import { sharedSettingsOf } from './shared';

// Что пишет команда generate: путь от папки пакета → текст. Тест расхождения строит то же в памяти и сравнивает с
// файлами на диске (блок 3 «Секций и SDK», Р3.13). Словарь — с тем же списком сквозных, что пишется рядом.
export type GeneratedFiles = Record<string, string>;

export function packageFiles(panelRaw: unknown): GeneratedFiles {
  const names = namesWith(sharedSettingsOf(panelRaw));
  const shared = sharedSettingsOf(panelRaw);
  return {
    'generated/section.schema.json': jsonText(sectionJsonSchema(names)),
    'generated/names.schema.json': jsonText(namesJsonSchema()),
    'generated/NAMES.md': namesMarkdown(names),
    'generated/shared-settings.json': `${JSON.stringify(shared, null, 2)}\n`,
  };
}
