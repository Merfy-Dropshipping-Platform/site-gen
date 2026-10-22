import type { JsonSchema } from '@merfy/tokens';

export const GENERATED_NOTE = 'Сгенерировано командой pnpm generate пакета секций — руками не править.';

export const jsonText = (schema: JsonSchema): string =>
  `${JSON.stringify({ $comment: GENERATED_NOTE, ...schema }, null, 2)}\n`;
