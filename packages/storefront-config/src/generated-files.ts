import { z } from 'zod';
import { rebuildEventsFileSchema } from './events';
import { storefrontConfigSchema } from './schema';

// Что пишет команда generate: путь от папки пакета → текст файла. Тест расхождения строит то же в памяти
// и сравнивает с файлами на диске: JSON Schema не отстанет от схемы zod.
export const GENERATED_NOTE = 'Сгенерировано из схемы zod командой pnpm generate — руками не править.';

const jsonSchemaText = (schema: z.ZodType): string =>
  `${JSON.stringify({ $comment: GENERATED_NOTE, ...z.toJSONSchema(schema) }, null, 2)}\n`;

export function generatedFiles(): Record<string, string> {
  return {
    'generated/storefront-config.schema.json': jsonSchemaText(storefrontConfigSchema),
    'generated/rebuild-events.schema.json': jsonSchemaText(rebuildEventsFileSchema),
  };
}
