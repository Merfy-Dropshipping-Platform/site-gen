// Очередь прогонов Lighthouse (19.11): по одному на процесс, ждущие — в пределах своего срока.
import { describe, expect, it, vi } from 'vitest';
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

// Аудит опубликованной страницы идёт фоном: ниже снимков черновика и не задерживает их.
describe('очередь Lighthouse: фоновый прогон (аудит)', () => {
  it('в очереди фоновый ждёт снимков, хотя встал раньше', async () => {
    const turns = new LighthouseTurns();
    const order: string[] = [];
    const first = await turns.take(1_000);
    const audit = turns.take(1_000, { background: true }).then((release) => {
      order.push('аудит');
      return release;
    });
    const look = turns.take(1_000).then((release) => {
      order.push('снимок');
      return release;
    });
    first();
    (await look)();
    (await audit)();
    expect(order).toEqual(['снимок', 'аудит']);
  });

  it('снимок, вставший в очередь за идущим аудитом, просит у него место', async () => {
    const turns = new LighthouseTurns();
    const yielded = vi.fn();
    const audit = await turns.take(1_000, { background: true, yield: yielded });
    const look = turns.take(1_000);
    expect(yielded).toHaveBeenCalledTimes(1);
    audit();
    (await look)();
  });

  it('у идущего снимка место не просят, а фоновый, вставший за аудитом, его не торопит', async () => {
    const turns = new LighthouseTurns();
    const yielded = vi.fn();
    const look = await turns.take(1_000);
    const second = turns.take(1_000, { background: true, yield: yielded });
    look();
    const audit = await second;
    const other = turns.take(1_000, { background: true });
    expect(yielded).not.toHaveBeenCalled();
    audit();
    (await other)();
  });

  it('начался снимок: идущий аудит просят уступить заранее, не дожидаясь снимкового Lighthouse', async () => {
    const turns = new LighthouseTurns();
    const yielded = vi.fn();
    const audit = await turns.take(1_000, { background: true, yield: yielded });
    turns.preempt();
    expect(yielded).toHaveBeenCalledTimes(1);
    audit();
    // Свободное место и идущий снимок никого не просят.
    turns.preempt();
    const look = await turns.take(1_000);
    turns.preempt();
    expect(yielded).toHaveBeenCalledTimes(1);
    look();
  });

  it('не дождавшийся фоновый — отказ, очередь не портит', async () => {
    const turns = new LighthouseTurns();
    const first = await turns.take(1_000);
    await expect(turns.take(10, { background: true })).rejects.toBeInstanceOf(LighthouseBusy);
    first();
    (await turns.take(0))();
  });
});
