import { z } from 'zod';
import { rulesFileSchema } from './compare/rules';
import { passportSchema } from './passport/schema';
import { scenarioFileSchema } from './scenario/schema';

// JSON-схемы рядом с данными (RULES.md, раздел 4). Источник — схемы zod в src; файлы пишет `pnpm generate:schemas`.
export const SCHEMA_FILES: readonly { file: string; schema: z.ZodType }[] = [
  { file: 'passport.schema.json', schema: passportSchema },
  { file: 'compare-rules.schema.json', schema: rulesFileSchema },
  { file: 'scenarios/scenario.schema.json', schema: scenarioFileSchema },
];

const GENERATED_NOTE = 'Сгенерировано командой pnpm generate:schemas из схемы zod — руками не править.';

export const schemaText = (schema: z.ZodType): string =>
  `${JSON.stringify({ $comment: GENERATED_NOTE, ...z.toJSONSchema(schema) }, null, 2)}\n`;
