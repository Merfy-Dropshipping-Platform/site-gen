import { parseArgs } from 'node:util';
import { z } from 'zod';
import { parseWith } from '../errors';
import type { Target } from '../types';
import { SABOTAGE_NAMES, type SabotageName } from './sabotage';

export type RunArgs = { target: Target; sabotage: SabotageName[] };
export type CompareArgs = { first: string; second: string };

const runArgsSchema = z.object({ target: z.enum(['local', 'dev']), sabotage: z.array(z.enum(SABOTAGE_NAMES)) });
const compareArgsSchema = z.tuple([z.string().endsWith('.json'), z.string().endsWith('.json')]);

// stand:run и stand:baseline: --target local|dev; --sabotage script|global|cart, можно несколько раз.
export function parseRunArgs(argv: readonly string[]): RunArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      target: { type: 'string', default: 'local' },
      sabotage: { type: 'string', multiple: true, default: [] },
    },
    strict: true,
  });
  return parseWith(runArgsSchema, values, 'args-invalid', 'аргументы команды');
}

// stand:compare <a.json> <b.json>
export function parseCompareArgs(argv: readonly string[]): CompareArgs {
  const { positionals } = parseArgs({ args: [...argv], allowPositionals: true, strict: true });
  const [first, second] = parseWith(compareArgsSchema, positionals, 'args-invalid', 'нужны два файла паспортов .json');
  return { first, second };
}
