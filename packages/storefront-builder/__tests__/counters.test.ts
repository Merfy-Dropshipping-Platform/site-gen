import { describe, expect, it } from 'vitest';
import { ANALYTICS_QUEUE, COUNTER_UPDATED_AT, fetchCounters, type CounterRequest } from '../src/counters';

const SHOP = { id: '00000000-0000-4000-8000-000000000001', tenantId: 'org-1' };

const pixel = (id: string, type: string, number: string, active = true) => ({
  id,
  pixel_type: type,
  pixel_id: number,
  name: '',
  is_active: active,
  created_at: '2026-10-10T09:00:00Z',
});

const PIXELS = [
  pixel('p-1', 'yandex_metrika', '12345678'),
  pixel('p-2', 'vk', 'VK-RTRG-1-a', false),
  pixel('p-3', 'custom', '<script>alert(1)</script>'),
  pixel('p-4', 'google_analytics', 'UA-1-1'),
  pixel('p-5', 'meta', '123'),
  pixel('p-6', 'google_analytics', ' G-ABCDEF12 '),
];

interface Probe {
  request: CounterRequest;
  calls: unknown[][];
  lines: string[];
}

function probe(answer: () => Promise<unknown>): Probe {
  const calls: unknown[][] = [];
  const lines: string[] = [];
  const request: CounterRequest = {
    call: (...args) => {
      calls.push(args);
      return answer();
    },
    timeoutMs: 1_000,
    log: (message, fields) => {
      lines.push(`${message} ${JSON.stringify(fields)}`);
    },
  };
  return { request, calls, lines };
}

describe('fetchCounters (design.md блока 11, С11-4 Б)', () => {
  it('включённые счётчики трёх видов — сущности counter; остальное — мимо, с записью без номера и кода', async () => {
    const { request, calls, lines } = probe(() => Promise.resolve({ success: true, data: { pixels: PIXELS } }));
    expect(await fetchCounters(request, SHOP)).toEqual([
      { type: 'counter', id: 'p-1', updatedAt: COUNTER_UPDATED_AT, data: { kind: 'metrika', number: '12345678' } },
      { type: 'counter', id: 'p-6', updatedAt: COUNTER_UPDATED_AT, data: { kind: 'google', number: 'G-ABCDEF12' } },
    ]);
    expect(calls).toEqual([[ANALYTICS_QUEUE, 'analytics.pixels.list', { shopId: SHOP.id, tenantId: 'org-1' }, 1_000]]);
    expect(lines.filter((line) => line.startsWith('counter-skipped'))).toHaveLength(3);
    expect(lines.join('\n')).not.toContain('<script>');
    expect(lines.join('\n')).not.toContain('UA-1-1');
  });

  it('счётчиков нет — пустой список, а не «не получен»', async () => {
    const { request } = probe(() => Promise.resolve({ success: true, data: { pixels: [] } }));
    expect(await fetchCounters(request, SHOP)).toEqual([]);
  });

  it.each<[string, () => Promise<unknown>]>([
    ['success: false', () => Promise.resolve({ success: false, error: 'db down' })],
    ['ответ не той формы', () => Promise.resolve({ pixels: [] })],
    ['вызов упал', () => Promise.reject(new Error('нет ответа за 5000 мс'))],
  ])('%s — null и строка counters-failed', async (_title, answer) => {
    const { request, lines } = probe(answer);
    expect(await fetchCounters(request, SHOP)).toBeNull();
    expect(lines.some((line) => line.startsWith('counters-failed'))).toBe(true);
  });
});
