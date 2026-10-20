import type { SectionRenderRequest, SectionRenderer } from '@merfy/storefront-sections';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreviewRenderers } from '../src/preview-renderers';

const REQUEST = { section: 'shop:hero', hash: 'sha256:a', module: 'x', settings: {} };

// Подставной процесс рендера. hold() — следующий рендер ждёт, пока тест не вызовет то, что hold() вернула. Рендер в
// закрытом процессе падает, как у настоящего: close шлёт процессу SIGKILL и отклоняет незаконченные рендеры.
function fakeStart() {
  const started: { closed: boolean }[] = [];
  let gate: Promise<void> | null = null;
  let open = (): void => undefined;
  const hold = (): (() => void) => {
    gate = new Promise((resolve) => {
      open = resolve;
    });
    return () => open();
  };
  const start = (): SectionRenderer => {
    const state = { closed: false };
    started.push(state);
    return {
      render: async (request: SectionRenderRequest) => {
        const wait = gate;
        gate = null;
        if (wait !== null) await wait;
        if (state.closed) throw new Error('процесс закрыт посреди рендера');
        return request.section;
      },
      pid: () => 1,
      close: () => {
        state.closed = true;
        return Promise.resolve();
      },
    };
  };
  return { start, started, hold };
}

const closed = (started: { closed: boolean }[]): boolean[] => started.map((state) => state.closed);

afterEach(() => {
  vi.useRealTimers();
});

describe('процессы рендера превью', () => {
  it('один процесс на магазин; close закрывает все', async () => {
    const { start, started } = fakeStart();
    const renderers = createPreviewRenderers({ limit: 5, start });
    await renderers.render('shop-a', REQUEST);
    await renderers.render('shop-a', REQUEST);
    await renderers.render('shop-b', REQUEST);
    expect(started).toHaveLength(2);
    await renderers.close();
    expect(closed(started)).toEqual([true, true]);
  });

  it('процессов не больше limit: место освобождает магазин, к которому дольше всех не было запросов', async () => {
    const { start, started } = fakeStart();
    const renderers = createPreviewRenderers({ limit: 2, start });
    await renderers.render('shop-a', REQUEST);
    await renderers.render('shop-b', REQUEST);
    await renderers.render('shop-a', REQUEST);
    await renderers.render('shop-c', REQUEST);
    expect(closed(started)).toEqual([false, true, false]);
    await renderers.render('shop-b', REQUEST);
    expect(closed(started)).toEqual([true, true, false, false]);
    await renderers.close();
  });

  it('процесс, который ещё готовит ответ, закрывается после ответа', async () => {
    const { start, started, hold } = fakeStart();
    const renderers = createPreviewRenderers({ limit: 1, start });
    const open = hold();
    const answer = renderers.render('shop-a', REQUEST);
    await renderers.render('shop-b', REQUEST);
    expect(closed(started)).toEqual([false, false]);
    open();
    await expect(answer).resolves.toBe('shop:hero');
    await vi.waitFor(() => expect(closed(started)).toEqual([true, false]));
    await renderers.close();
  });

  it('таймера нет: процесс без запросов сам не закрывается', async () => {
    vi.useFakeTimers();
    const { start, started } = fakeStart();
    const renderers = createPreviewRenderers({ limit: 5, start });
    await renderers.render('shop-a', REQUEST);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(closed(started)).toEqual([false]);
    await renderers.close();
  });
});
