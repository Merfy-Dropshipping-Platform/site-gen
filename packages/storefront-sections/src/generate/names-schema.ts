import type { JsonSchema } from '@merfy/tokens';
import { z } from 'zod';
import { namesFileShape } from '../names';

// JSON Schema файла словаря names.json — для редактора (блок 3 «Секций и SDK», Р3.12).
export function namesJsonSchema(): JsonSchema {
  return z.toJSONSchema(namesFileShape, { io: 'input' });
}
