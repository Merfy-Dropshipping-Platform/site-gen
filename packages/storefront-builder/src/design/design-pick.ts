// Чтение чужого JSON без приведения типов: путь по ключам и по номерам, на каждом шаге проверка вида. Сырые ответы
// инструментов дизайна бывают любыми — не то, что ждали, значит «нет значения».

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function step(value: unknown, key: string | number): unknown {
  if (typeof key === 'number') return Array.isArray(value) ? value[key] : undefined;
  return isRecord(value) ? value[key] : undefined;
}

export const at = (value: unknown, ...path: Array<string | number>): unknown => path.reduce(step, value);

export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

export function numberOf(value: unknown): number | null {
  const found = typeof value === 'string' ? Number(value) : value;
  return typeof found === 'number' && Number.isFinite(found) ? found : null;
}

export const flag = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

export const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
