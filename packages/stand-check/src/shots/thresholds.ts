import { z } from 'zod';
import { parseWith } from '../errors';

// Пороги снимков (design.md блока 10, Э3; visual-diff-thresholds.json в корне site-gen, факт 8): доля отличающихся
// пикселей по ключу <тема>/<страница>/<ширина>; ключа нет — default; ключ в skip — снимок не сравниваем. Строки
// «$comment» в per_key и skip — пояснения, а не ключи.
const COMMENT = '$comment';
const ratio = z.number().min(0).max(1);

const thresholdsFileSchema = z.object({
  default: ratio,
  per_key: z.record(z.string(), z.union([ratio, z.string()])),
  skip: z.array(z.string()),
});

export interface Thresholds {
  fallback: number;
  perKey: ReadonlyMap<string, number>;
  skip: ReadonlySet<string>;
}

export const shotKey = (theme: string, page: string, width: number): string => `${theme}/${page}/${width}`;

export function parseThresholds(raw: unknown): Thresholds {
  const file = parseWith(thresholdsFileSchema, raw, 'thresholds-invalid', 'visual-diff-thresholds.json');
  const perKey = Object.entries(file.per_key).flatMap(([key, value]) =>
    typeof value === 'number' ? [[key, value] as const] : [],
  );
  const skip = file.skip.filter((entry) => !entry.startsWith(COMMENT));
  return { fallback: file.default, perKey: new Map(perKey), skip: new Set(skip) };
}

// Порог ключа; null — ключ в skip, снимок не сравниваем.
export function thresholdOf(thresholds: Thresholds, key: string): number | null {
  if (thresholds.skip.has(key)) return null;
  return thresholds.perKey.get(key) ?? thresholds.fallback;
}
