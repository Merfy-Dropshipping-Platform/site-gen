import { z } from 'zod';
import { passportSchema } from './passport/schema';

// JSON-схемы рядом с данными (RULES.md, раздел 4). Источник — схемы zod в src; файлы пишет `pnpm generate:schemas`.
export const SCHEMA_FILES: readonly { file: string; schema: z.ZodType }[] = [
  { file: 'passport.schema.json', schema: passportSchema },
];

const GENERATED_NOTE = 'Сгенерировано командой pnpm generate:schemas из схемы zod — руками не править.';

export const schemaText = (schema: z.ZodType): string =>
  `${JSON.stringify({ $comment: GENERATED_NOTE, ...z.toJSONSchema(schema) }, null, 2)}\n`;
