import { z } from 'zod';
import { STORE_USE_PREFIX } from './format';

// Круг чтений своих сторов (свои сторы, 01.11): стор, который через другие сторы читает сам себя, не запустится — его
// значение ждёт само себя. Приём сверяет новую правку стора со сторами того же автора: у магазина — текущие правки его
// сторов, у расширения — сторы того же выпуска. Чужие сторы в круг не попадают: стор расширения читает только сторы
// своего расширения (store-foreign), значит, до сторов магазина не доходит.

// Сторы, которые читает правка: "store:<полное имя>" из uses её script_meta → полные имена. Не той формы — никаких.
const metaUses = z.object({ uses: z.array(z.string()) });

export function storeReadsOf(scriptMeta: unknown): string[] {
  const parsed = metaUses.safeParse(scriptMeta);
  if (!parsed.success) return [];
  return parsed.data.uses.flatMap((use) =>
    use.startsWith(STORE_USE_PREFIX) ? [use.slice(STORE_USE_PREFIX.length)] : [],
  );
}

// Круг через стор name: name читает reads, остальные — по graph (имя → что читает). Ответ — путь name → … → name;
// круга нет — null. Новая правка name заменяет прежнюю в graph.
export function storeCycleOf(
  name: string,
  reads: readonly string[],
  graph: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const edges = new Map(graph);
  edges.set(name, reads);
  const seen = new Set<string>();
  const walk = (current: string): string[] | null => {
    for (const next of edges.get(current) ?? []) {
      if (next === name) return [current, name];
      if (seen.has(next)) continue;
      seen.add(next);
      const rest = walk(next);
      if (rest !== null) return [current, ...rest];
    }
    return null;
  };
  return walk(name);
}

// Текст отказа store-cycle: путь круга и что сделать.
export const storeCycleText = (cycle: readonly string[]): string =>
  `стор ${cycle[0] ?? ''} читает сам себя по кругу: ${cycle.join(' → ')} — убери одно из этих чтений из uses`;
