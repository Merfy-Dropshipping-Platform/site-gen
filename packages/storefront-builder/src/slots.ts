// Места (design.md блока 6, В6-2, «Дорисовка»): сколько работ идут одновременно. Свободного места нет — работа не
// ждёт, а сразу получает отказ: покупатель не должен стоять в очереди за чужими дорисовками.
export interface Slots {
  // Занять место: функция освобождения или null — мест нет.
  take: () => (() => void) | null;
  free: () => number;
}

export function createSlots(size: number): Slots {
  let busy = 0;
  const take = (): (() => void) | null => {
    if (busy >= size) return null;
    busy += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      busy -= 1;
    };
  };
  return { take, free: () => size - busy };
}
