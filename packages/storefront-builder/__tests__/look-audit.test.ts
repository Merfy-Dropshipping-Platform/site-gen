// Очередь прогонов Lighthouse (19.11): по одному на процесс, ждущие — в пределах своего срока.
import { describe, expect, it } from 'vitest';
import { LighthouseBusy, LighthouseTurns } from '../src/look/look-audit';

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('очередь Lighthouse', () => {
  it('свободное место отдаётся сразу, второй ждёт, пока первый не отпустит', async () => {
    const turns = new LighthouseTurns();
    const order: string[] = [];
    const first = await turns.take(1_000);
    const second = turns.take(1_000).then((release) => {
      order.push('second');
      return release;
    });
    await pause(20);
    expect(order).toEqual([]);
    first();
    (await second)();
    expect(order).toEqual(['second']);
  });

  it('не дождавшийся — отказ с причиной, очередь он не занимает и тех, кто за ним, не задерживает', async () => {
    const turns = new LighthouseTurns();
    const first = await turns.take(1_000);
    const lost = turns.take(10);
    const patient = turns.take(1_000);
    await expect(lost).rejects.toBeInstanceOf(LighthouseBusy);
    await expect(lost).rejects.toThrow(/очередь Lighthouse занята другим снимком: не дождался за 0 с/);
    first();
    (await patient)();
    // Всё отпущено: место снова свободно сразу.
    (await turns.take(0))();
  });

  it('место свободно и при нулевом ожидании; занято — отказ сразу', async () => {
    const turns = new LighthouseTurns();
    const release = await turns.take(0);
    await expect(turns.take(0)).rejects.toBeInstanceOf(LighthouseBusy);
    release();
  });
});
