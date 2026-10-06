import { z } from 'zod';
import { parseWith } from '../errors';
import type { Scenario } from '../types';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = z.string().min(3);

const expectationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tokens-present'), set: z.literal('base') }).strict(),
  z.object({ kind: z.literal('sections-present'), ids: z.array(z.string().regex(KEBAB)).min(1) }).strict(),
  z.object({ kind: z.literal('fonts-loaded') }).strict(),
  z.object({ kind: z.literal('no-errors') }).strict(),
  z.object({ kind: z.literal('no-globals') }).strict(),
]);

// Сценарий стенда (design.md 5.5): что открыть, какие действия сделать, что проверить и что смотреть глазами.
// Действий SDK пока нет — шаги пустые до договора SDK (задачи 4–6 этапа).
export const scenarioFileSchema = z
  .object({
    $schema: z.string().optional(),
    id: z.string().regex(KEBAB),
    title: text,
    since: text,
    open: z.string().startsWith('/'),
    steps: z.tuple([]),
    expect: z.array(expectationSchema).min(1),
    eyes: z.array(text),
  })
  .strict();

export function parseScenario(raw: unknown): Scenario {
  return parseWith(scenarioFileSchema, raw, 'scenario-invalid', 'сценарий');
}
