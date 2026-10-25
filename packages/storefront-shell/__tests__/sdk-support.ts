import type { StorefrontConfig } from '@merfy/storefront-config';
import { vi } from 'vitest';
import type { CoreHandle, EventDetail, EventName, Mode, ModuleName, Modules } from '../src/core/types';

// Общее для тестов действий SDK (блок 9, часть 9а): конфиг страницы, CoreHandle с записью событий, шлюз в памяти.
export const API_URL = 'https://gateway.dev.merfy.ru/api';
export const SHOP_ID = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';

export function storefrontConfig(mode: Mode): StorefrontConfig {
  return {
    v: 1,
    mode,
    shop: { id: SHOP_ID, name: 'Шарфы', url: 'https://scarves.example' },
    currency: 'RUB',
    locale: 'ru-RU',
    api: { url: API_URL },
    theme: { id: 'nova', version: '0.0.4' },
    page: { id: 'product', path: '/products/scarf' },
    analytics: null,
  };
}

export interface SentEvent {
  readonly name: string;
  readonly detail: unknown;
}

// CoreHandle части без запуска ядра: события пишутся в events по порядку.
export function fakeCore(mode: Mode = 'live', config: StorefrontConfig | null = storefrontConfig(mode)) {
  const events: SentEvent[] = [];
  const core: CoreHandle = {
    config,
    mode,
    emit: <E extends EventName>(name: E, detail: EventDetail<E>): void => {
      events.push({ name, detail });
    },
    part: <N extends ModuleName>(name: N): Modules[N] => {
      throw new Error(`части ${name} в тесте нет`);
    },
  };
  const named = (name: string): unknown[] => events.filter((event) => event.name === name).map((event) => event.detail);
  return { core, events, named };
}

// Ответ шлюза в памяти: статус и тело JSON; 'network' — обрыв (fetch бросает); 'hang' — ответа нет, пока запрос не
// отменён; gate — ответ ждёт, пока тест не откроет ворота.
export type Answer =
  | { readonly status: number; readonly body: unknown; readonly gate?: Promise<void> }
  | 'network'
  | 'hang';

export interface Call {
  readonly key: string; // 'POST /store/carts/c-1/items' — путь без /api
  readonly body: unknown;
}

function abortable(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('отменено', 'AbortError')));
  });
}

function bodyOf(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : null;
}

export function addressOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

// Поле данных события — для проверок без приведения типов.
export function field(detail: unknown, key: string): unknown {
  if (typeof detail !== 'object' || detail === null) return undefined;
  const value: unknown = Reflect.get(detail, key);
  return value;
}

// Шлюз: answer(ключ, ответы…) — ответы по очереди на этот ключ; ключа нет — 500. calls — все запросы по порядку.
export function fakeGateway() {
  const answers = new Map<string, Answer[]>();
  const calls: Call[] = [];
  const respond = async (answer: Answer | undefined, init: RequestInit | undefined): Promise<Response> => {
    if (answer === 'network') throw new TypeError('Failed to fetch');
    if (answer === 'hang') return abortable(init?.signal);
    const { status, body, gate } = answer ?? { status: 500, body: { message: 'нет ответа в тесте' } };
    await gate;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  const fetchFake = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(addressOf(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')}`;
    calls.push({ key, body: bodyOf(init) });
    return respond(answers.get(key)?.shift(), init);
  });
  vi.stubGlobal('fetch', fetchFake);
  return {
    calls,
    keys: (): string[] => calls.map((call) => call.key),
    answer(key: string, ...list: Answer[]): void {
      answers.set(key, [...(answers.get(key) ?? []), ...list]);
    },
  };
}

export function gate() {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open: () => open() };
}

// Строка корзины в ответе orders (order_items) и что из неё получает $cart.
export function serverItem(id: string, productId: string, quantity: number, variant: string | null = null) {
  return {
    id,
    orderId: 'c-1',
    productId,
    variantCombinationId: variant,
    quantity,
    unitPriceCents: 249000,
    totalCents: 249000 * quantity,
    name: 'Шарф',
    imageUrl: null,
    options: null,
    isBonus: false,
  };
}

export function cartLine(id: string, productId: string, quantity: number, variantId: string | null = null) {
  const price = { amount: 249000, currency: 'RUB' };
  const total = { amount: 249000 * quantity, currency: 'RUB' };
  return { id, productId, variantId, quantity, price, title: 'Шарф', image: null, options: {}, total, gift: false };
}

// Дождаться микрозадач и ответов шлюза в памяти.
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
