import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_QUEUE,
  COUNTER_UPDATED_AT,
  CUSTOM_CODE_MAX_BYTES,
  fetchCounters,
  type CounterRequest,
} from '../src/counters';

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
  it('счётчики трёх видов — counter, «свой код» — custom-code; остальное — мимо, с записью без номера и кода', async () => {
    const { request, calls, lines } = probe(() => Promise.resolve({ success: true, data: { pixels: PIXELS } }));
    expect(await fetchCounters(request, SHOP)).toEqual([
      { type: 'counter', id: 'p-1', updatedAt: COUNTER_UPDATED_AT, data: { kind: 'metrika', number: '12345678' } },
      { type: 'counter', id: 'p-6', updatedAt: COUNTER_UPDATED_AT, data: { kind: 'google', number: 'G-ABCDEF12' } },
      {
        type: 'custom-code',
        id: 'p-3',
        updatedAt: COUNTER_UPDATED_AT,
        data: { code: '<script>alert(1)</script>', consent: 'required' },
      },
    ]);
    expect(calls).toEqual([[ANALYTICS_QUEUE, 'analytics.pixels.list', { shopId: SHOP.id, tenantId: 'org-1' }, 1_000]]);
    expect(lines.filter((line) => line.startsWith('counter-skipped'))).toHaveLength(2);
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

describe('«свой код» мерчанта — сущности custom-code (блок 13 «Секций и SDK», часть 13б)', () => {
  const custom = (id: string, code: string, consent?: string, active = true) => ({
    ...pixel(id, 'custom', code, active),
    ...(consent === undefined ? {} : { consent }),
  });

  async function entitiesOf(pixels: unknown[]) {
    const probed = probe(() => Promise.resolve({ success: true, data: { pixels } }));
    return { entities: await fetchCounters(probed.request, SHOP), lines: probed.lines };
  }

  it('none — сразу; нет поля или другое значение — ждать согласия; выключенный и пустой — мимо; порядок — по id', async () => {
    const { entities } = await entitiesOf([
      custom('c-3', '<script>c()</script>', 'soon'),
      custom('c-1', '<script>a()</script>', 'none'),
      custom('c-4', '<script>d()</script>', 'none', false),
      custom('c-2', '<script>b()</script>'),
      custom('c-5', '   ', 'none'),
    ]);
    expect(entities).toEqual([
      {
        type: 'custom-code',
        id: 'c-1',
        updatedAt: COUNTER_UPDATED_AT,
        data: { code: '<script>a()</script>', consent: 'none' },
      },
      {
        type: 'custom-code',
        id: 'c-2',
        updatedAt: COUNTER_UPDATED_AT,
        data: { code: '<script>b()</script>', consent: 'required' },
      },
      {
        type: 'custom-code',
        id: 'c-3',
        updatedAt: COUNTER_UPDATED_AT,
        data: { code: '<script>c()</script>', consent: 'required' },
      },
    ]);
  });

  it('сверх CUSTOM_CODE_MAX_BYTES на магазин — код пропущен со строкой без кода; следующий, если влез, — в снимке', async () => {
    const big = `<script>${'x'.repeat(CUSTOM_CODE_MAX_BYTES - 37)}</script>`;
    const { entities, lines } = await entitiesOf([
      custom('c-1', big, 'none'),
      custom('c-2', '<script>second()</script>', 'none'),
      custom('c-3', '<script>a()</script>', 'none'),
    ]);
    expect(entities?.map((entity) => entity.id)).toEqual(['c-1', 'c-3']);
    expect(lines).toEqual([`custom-code-skipped ${JSON.stringify({ shopId: SHOP.id, counterId: 'c-2', bytes: 25 })}`]);
  });
});
