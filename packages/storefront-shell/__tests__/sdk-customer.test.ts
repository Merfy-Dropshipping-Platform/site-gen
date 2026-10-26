import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellError } from '../src/errors';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { defineSection } from '../src/core/define';
import { navigation } from '../src/core/navigation';
import { auth } from '../src/core/parts/auth';
import { customer } from '../src/core/parts/customer';
import { start, type StartedCore } from '../src/core/start';
import { watchSource } from '../src/core/stores';
import type { CoreHandle, ModuleName, Modules, ReadableStore } from '../src/core/types';
import { configTag, entry, placeSection } from './core-support';
import { fakeCore, fakeGateway } from './sdk-support';

// Кто вошёл — часть customer ядра (блок 15 «Секций и SDK», часть 15ж, Р15ж-1, Р15ж-4): $customer на каждой странице без
// кода входа; customer и auth одной страницы — один стор.
const STORE_UNMOUNT_DELAY = 1000;
const TOKEN = 't-customer-1';
const ANNA = { id: 'c-1', email: 'anna@example.ru', name: 'Анна', phone: null, status: 'active' };
const ANNA_STATE = { ready: true, customer: { email: 'anna@example.ru', name: 'Анна', phone: null } };
const stops: Array<() => void> = [];
let started: StartedCore | undefined;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const watch = <T>(store: ReadableStore<T>): void => {
  stops.push(watchSource(store)?.listen(() => undefined) ?? (() => undefined));
};

// Ядро без других частей: избранного нет — слияние и очистка при входе и выходе пропускаются (part-unknown).
function bareCore() {
  const handle = fakeCore();
  const core: CoreHandle = {
    ...handle.core,
    part: <N extends ModuleName>(name: N): Modules[N] => {
      throw new ShellError('part-unknown', `части ${name} на странице нет`);
    },
  };
  return { core, named: handle.named };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
});

afterEach(async () => {
  started?.stop();
  started = undefined;
  stops.splice(0).forEach((stop) => stop());
  await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
  document.head.replaceChildren();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('часть customer', () => {
  it('API — только $customer: входа, выхода, профиля и действий разметки нет', () => {
    const module = customer.create(bareCore().core);
    expect(Object.keys(module)).toEqual(['$customer']);
    expect(customer.markup).toBeUndefined();
  });

  it('токен — GET me при первой подписке; до ответа ready: false; в сторе — e-mail, имя, телефон', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer('GET /store/auth/me', { status: 200, body: { success: true, data: { customer: ANNA, session: {} } } });
    const module = customer.create(bareCore().core);
    expect(module.$customer.get()).toEqual({ ready: false, customer: null });
    watch(module.$customer);
    await settle();
    expect(gateway.calls.map((call) => call.key)).toEqual(['GET /store/auth/me']);
    expect(module.$customer.get()).toEqual(ANNA_STATE);
  });

  it('customer и auth одной страницы — один стор: вход через auth.verify виден в шапке, выход — тоже', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/auth/magic/verify', {
      status: 200,
      body: { success: true, data: { customer: ANNA, sessionToken: 't-new' } },
    });
    gateway.answer('POST /store/auth/logout', { status: 200, body: { success: true } });
    const { core } = bareCore();
    const header = customer.create(core);
    const login = auth.create(core);
    expect(login.$customer).toBe(header.$customer);
    watch(header.$customer);
    await settle();
    expect((await login.verify({ email: 'anna@example.ru', code: '123456' })).ok).toBe(true);
    expect(header.$customer.get()).toEqual(ANNA_STATE);
    expect((await login.signout()).ok).toBe(true);
    expect(header.$customer.get()).toEqual({ ready: true, customer: null });
  });

  it('секция с uses: ["customer"] получает ctx.customer; части auth на странице нет — ctx.auth нет', async () => {
    document.head.innerHTML = configTag('live');
    placeSection('shop:header', 'header-1');
    const box: { customer: boolean; auth: boolean } = { customer: false, auth: true };
    started = start({
      parts: [customer],
      sections: [
        entry(
          'shop:header',
          defineSection({ mount: (_el, ctx) => void Object.assign(box, { customer: 'customer' in ctx, auth: 'auth' in ctx }) }),
          { uses: ['customer'] },
        ),
      ],
    });
    await settle();
    expect(box).toEqual({ customer: true, auth: false });
  });
});
