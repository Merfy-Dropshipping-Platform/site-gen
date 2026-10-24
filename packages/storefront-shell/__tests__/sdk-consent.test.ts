import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY } from '../src/core/analytics/consent';
import { consent } from '../src/core/parts/consent';
import { start, type StartedCore } from '../src/core/start';
import { configTag, placeSection, tick } from './core-support';
import { fakeCore } from './sdk-support';

// Часть consent (блок 13 «Секций и SDK», 13.2): ответ покупателя на баннер cookie — стор, два действия, событие
// merfy:consent:change. Ключ и вид значения — как у баннера пяти тем. Слушатели storage частей прошлых тестов остаются
// на window: каждый тест смотрит только события своей части.
const NOW = '2026-10-23T08:00:00.000Z';
const BEFORE = '2026-10-01T10:00:00.000Z';
let core: StartedCore | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  localStorage.clear();
});

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('часть consent', () => {
  it.each<[string | null, string]>([
    [null, 'unknown'],
    [BEFORE, 'accepted'],
    [`declined:${BEFORE}`, 'declined'],
  ])('ключ баннера %j — $consent = %s', (stored, answer) => {
    if (stored !== null) localStorage.setItem(CONSENT_KEY, stored);
    expect(consent.create(fakeCore().core).$consent.get()).toBe(answer);
  });

  it('accept: дата в ключе, стор, одно событие; повторное «Принять» — без события', async () => {
    const fake = fakeCore();
    const api = consent.create(fake.core);
    expect(await api.accept()).toEqual({ ok: true, data: 'accepted' });
    expect(await api.accept()).toEqual({ ok: true, data: 'accepted' });
    expect([localStorage.getItem(CONSENT_KEY), api.$consent.get()]).toEqual([NOW, 'accepted']);
    expect(fake.named('merfy:consent:change')).toEqual([{ state: 'accepted' }]);
  });

  it('decline после accept: «declined:<дата>» и второе событие', async () => {
    const fake = fakeCore();
    const api = consent.create(fake.core);
    await api.accept();
    expect(await api.decline()).toEqual({ ok: true, data: 'declined' });
    expect(localStorage.getItem(CONSENT_KEY)).toBe(`declined:${NOW}`);
    expect(fake.named('merfy:consent:change')).toEqual([{ state: 'accepted' }, { state: 'declined' }]);
  });

  it('превью: ответ — в памяти страницы, localStorage мерчанта не меняется', async () => {
    const api = consent.create(fakeCore('preview').core);
    await api.accept();
    expect([api.$consent.get(), localStorage.getItem(CONSENT_KEY)]).toEqual(['accepted', null]);
  });

  it('хранилище отказало — ответ в сторе до перезагрузки, ошибки нет', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('нет места', 'QuotaExceededError');
    });
    const api = consent.create(fakeCore().core);
    expect(await api.decline()).toEqual({ ok: true, data: 'declined' });
    expect(api.$consent.get()).toBe('declined');
  });

  it('ответ в другой вкладке (событие storage) — стор и событие здесь; чужой ключ — ничего', () => {
    const fake = fakeCore();
    const api = consent.create(fake.core);
    window.dispatchEvent(new StorageEvent('storage', { key: 'merfy:cart-id:v1' }));
    localStorage.setItem(CONSENT_KEY, NOW);
    window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY, newValue: NOW }));
    expect(api.$consent.get()).toBe('accepted');
    expect(fake.named('merfy:consent:change')).toEqual([{ state: 'accepted' }]);
  });

  it('разметка: кнопка data-action="consent.accept" в секции — ответ и событие на document', async () => {
    document.head.innerHTML = configTag('live');
    placeSection(
      'shop:cookie-banner',
      'banner-1',
      '<button type="button" data-action="consent.accept">Принять</button>',
    );
    const seen: unknown[] = [];
    const listener = (event: Event): void => void seen.push(event instanceof CustomEvent ? event.detail : null);
    document.addEventListener('merfy:consent:change', listener);
    core = start({ parts: [consent], sections: [] }, { window });
    document.querySelector('button')?.click();
    await tick();
    document.removeEventListener('merfy:consent:change', listener);
    expect([localStorage.getItem(CONSENT_KEY), seen]).toEqual([NOW, [{ state: 'accepted' }]]);
  });
});
