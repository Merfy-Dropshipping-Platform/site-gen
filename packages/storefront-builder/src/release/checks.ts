import { z } from 'zod';
import { parseWith } from '../parse';

// Проверка в браузере — отдельный процесс (design.md блока 10, П10-3 В; задача 8): сборщик кладёт задание в
// storefront_checks, процесс снимает паспорт страницы по одному магазину и отвечает в storefront_check_results. В задании
// «после» — паспорт «до»: сравнивает процесс, вердикт — в ответе.
export const CHECKS_QUEUE = 'storefront_checks';
export const CHECK_RESULTS_QUEUE = 'storefront_check_results';

const phaseSchema = z.enum(['before', 'after']);

// Ожидание новой сборки в задании «после» (гонка раздачи, выпуск №77): отпечаток файла главной из манифеста живой
// сборки. Проверяющий процесс ждёт совпадения ETag главной, прежде чем снимать паспорт.
const expectedSchema = z.strictObject({ home: z.string().min(1) });

const checkJobSchema = z.strictObject({
  v: z.literal(1),
  release: z.int().positive(),
  siteId: z.string().min(1),
  phase: phaseSchema,
  url: z.url(),
  before: z.unknown().optional(),
  expected: expectedSchema.optional(),
});

const checkResultSchema = z.strictObject({
  v: z.literal(1),
  release: z.int().positive(),
  siteId: z.string().min(1),
  phase: phaseSchema,
  passport: z.unknown().nullable(),
  verdict: z.enum(['clean', 'amber', 'red']).nullable(),
  differences: z.array(z.unknown()),
  error: z.string().nullable(),
});

export type CheckJob = z.infer<typeof checkJobSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;

export const parseCheckJob = (raw: unknown): CheckJob =>
  parseWith(checkJobSchema, raw, 'message-invalid', CHECKS_QUEUE);
export const parseCheckResult = (raw: unknown): CheckResult =>
  parseWith(checkResultSchema, raw, 'message-invalid', CHECK_RESULTS_QUEUE);
