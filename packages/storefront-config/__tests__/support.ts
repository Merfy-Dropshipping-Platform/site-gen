import standConfigJson from '../fixtures/stand-config.json';
import { checkStorefrontConfig, type StorefrontConfig } from '../src/schema';

// Общий образец тестов: эталон конфига стенда (design.md блока 3, 5.2) и его копии с одним изменённым полем.
export const standConfig: StorefrontConfig = checkStorefrontConfig(standConfigJson);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Копия эталона, где поле по пути «раздел.поле» заменено значением. undefined — поля нет: JSON.stringify его выкинет.
export function withField(path: string, value: unknown): Record<string, unknown> {
  const copy: Record<string, unknown> = structuredClone(standConfig);
  const keys = path.split('.');
  const field = keys.pop() ?? '';
  const parent = keys.reduce<Record<string, unknown>>((node, key) => {
    const child = node[key];
    return isRecord(child) ? child : node;
  }, copy);
  parent[field] = value;
  return copy;
}
