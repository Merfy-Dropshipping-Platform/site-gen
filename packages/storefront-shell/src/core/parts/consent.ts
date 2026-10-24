import { CONSENT_KEY, readConsent, storedConsent } from '../analytics/consent';
import { pageStorage, type KeyValue } from '../storage';
import { atom, readable, type Atom } from '../stores';
import type { ConsentAnswer, ConsentModule, ConsentState, CoreHandle, Result, SdkPart } from '../types';

// Согласие на cookie (блок 13 «Секций и SDK», 13.2; С11-2 В). $consent — ответ покупателя; accept и decline пишут его в
// localStorage['merfy:cookie-consent:v1'] — тот же ключ и вид, что у баннера пяти тем, — и шлют merfy:consent:change,
// если ответ сменился. Ответ в другой вкладке магазина приходит событием storage. Что можно при каждом ответе — таблица
// analytics/consent.ts. Превью и недоступное хранилище — память страницы (pageStorage): ответ хранится до перезагрузки, как
// у баннера пяти тем в превью и в приватном режиме.

interface ConsentRuntime {
  readonly core: CoreHandle;
  readonly page: KeyValue;
  readonly state: Atom<ConsentAnswer>;
}

function write(page: KeyValue, next: ConsentState): void {
  try {
    page.setItem(CONSENT_KEY, storedConsent(next, new Date()));
  } catch {
    // Хранилище отказало (предел, запрет браузера) — ответ хранится в сторе до перезагрузки, как у баннера пяти тем (Р13а-3).
  }
}

function answer(rt: ConsentRuntime, next: ConsentState): Promise<Result<ConsentAnswer>> {
  const changed = rt.state.get() !== next;
  write(rt.page, next);
  rt.state.set(next);
  if (changed) rt.core.emit('merfy:consent:change', { state: next });
  return Promise.resolve({ ok: true, data: next });
}

function listenOtherTabs(rt: ConsentRuntime): void {
  window.addEventListener('storage', (event) => {
    if (event.key !== CONSENT_KEY) return;
    const next = readConsent(rt.page);
    if (next === rt.state.get()) return;
    rt.state.set(next);
    if (next !== 'unknown') rt.core.emit('merfy:consent:change', { state: next });
  });
}

export const consent: SdkPart<'consent', ConsentModule> = {
  name: 'consent',
  create: (core): ConsentModule => {
    const page = pageStorage(window, core.mode);
    const rt: ConsentRuntime = { core, page, state: atom<ConsentAnswer>(readConsent(page)) };
    listenOtherTabs(rt);
    return {
      $consent: readable(rt.state),
      accept: () => answer(rt, 'accepted'),
      decline: () => answer(rt, 'declined'),
    };
  },
  markup: {
    accept: { params: [], call: (api: ConsentModule): Promise<Result<unknown>> => api.accept() },
    decline: { params: [], call: (api: ConsentModule): Promise<Result<unknown>> => api.decline() },
  },
};
