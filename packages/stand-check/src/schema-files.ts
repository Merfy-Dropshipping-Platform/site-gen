import { z } from 'zod';
import { rulesFileSchema } from './compare/rules';
import { buyerReplySchema, collectionsReplySchema, productsReplySchema } from './mocks/fixtures';
import { mockRoutesFileSchema } from './mocks/routes';
import { passportSchema } from './passport/schema';
import { scenarioFileSchema } from './scenario/schema';

// JSON-схемы рядом с данными (RULES.md, раздел 4). Источник — схемы zod в src; файлы пишет `pnpm generate:schemas`.
// Схема данных моков лежит рядом с файлом ответа и называется так же: products.json → products.schema.json.
export const SCHEMA_FILES: readonly { file: string; schema: z.ZodType }[] = [
  { file: 'passport.schema.json', schema: passportSchema },
  { file: 'compare-rules.schema.json', schema: rulesFileSchema },
  { file: 'scenarios/scenario.schema.json', schema: scenarioFileSchema },
  { file: 'mocks/routes.schema.json', schema: mockRoutesFileSchema },
  { file: 'fixtures/products.schema.json', schema: productsReplySchema },
  { file: 'fixtures/collections.schema.json', schema: collectionsReplySchema },
  { file: 'fixtures/buyer.schema.json', schema: buyerReplySchema },
];

const GENERATED_NOTE = 'Сгенерировано командой pnpm generate:schemas из схемы zod — руками не править.';

export const schemaText = (schema: z.ZodType): string =>
  `${JSON.stringify({ $comment: GENERATED_NOTE, ...z.toJSONSchema(schema) }, null, 2)}\n`;
