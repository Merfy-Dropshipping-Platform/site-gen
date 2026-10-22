import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_LIMIT, createSectionStorage, pageStorage } from '../src/core/storage';
import { errorOf } from './core-support';

// Хранилище секции (design.md блока 5, раздел 3.2): ключ merfy:s:<имя секции>:<ключ>, 4 КБ на секцию, в превью и без
// localStorage — память страницы.
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('хранилище секции', () => {
  it('на витрине — localStorage: ключ merfy:s:<имя секции>:<ключ>, значение — JSON', () => {
    const storage = createSectionStorage('shop:scarf-match', pageStorage(window, 'live'));
    expect(storage.set('last-coat', { coat: 'grey' })).toBe(true);
    expect(localStorage.getItem('merfy:s:shop:scarf-match:last-coat')).toBe('{"coat":"grey"}');
    expect(storage.get('last-coat')).toEqual({ coat: 'grey' });
    storage.remove('last-coat');
    expect(storage.get('last-coat')).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it('у секций свои ключи; экземпляры одной секции делят хранилище', () => {
    const page = pageStorage(window, 'live');
    createSectionStorage('shop:scarf-match', page).set('coat', 'grey');
    expect(createSectionStorage('shop:scarf-match', page).get('coat')).toBe('grey');
    expect(createSectionStorage('shop:hint', page).get('coat')).toBeUndefined();
  });

  it('4 КБ на секцию: запись сверх предела — false и не пишется; замена своего ключа считает новый размер', () => {
    const storage = createSectionStorage('shop:big', pageStorage(window, 'live'));
    expect(STORAGE_LIMIT).toBe(4096);
    expect(storage.set('a', 'x'.repeat(3000))).toBe(true);
    expect(storage.set('b', 'y'.repeat(2000))).toBe(false);
    expect(storage.get('b')).toBeUndefined();
    expect(storage.set('a', 'z'.repeat(4000))).toBe(true);
    expect(createSectionStorage('shop:other', pageStorage(window, 'live')).set('b', 'y'.repeat(2000))).toBe(true);
  });

  it('превью — всегда память страницы: localStorage мерчанта не трогаем', () => {
    const storage = createSectionStorage('shop:scarf-match', pageStorage(window, 'preview'));
    expect(storage.set('last-coat', 'grey')).toBe(true);
    expect(storage.get('last-coat')).toBe('grey');
    expect(localStorage.length).toBe(0);
  });

  it('localStorage недоступен (рамка с песочницей, запрет браузера) — память страницы', () => {
    const blocked = {
      get localStorage(): Storage {
        throw new DOMException('доступа нет', 'SecurityError');
      },
    };
    const storage = createSectionStorage('shop:scarf-match', pageStorage(blocked, 'live'));
    expect(storage.set('last-coat', 'grey')).toBe(true);
    expect(storage.get('last-coat')).toBe('grey');
  });

  it('localStorage отказал при записи (переполнен) — false', () => {
    const storage = createSectionStorage('shop:scarf-match', pageStorage(window, 'live'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('нет места', 'QuotaExceededError');
    });
    expect(storage.set('last-coat', 'grey')).toBe(false);
  });

  it('get отдаёт замороженную копию', () => {
    const storage = createSectionStorage('shop:scarf-match', pageStorage(window, 'live'));
    storage.set('coats', { list: ['grey', 'black'] });
    const value = storage.get('coats');
    expect(Object.isFrozen(value)).toBe(true);
    expect(value).toEqual({ list: ['grey', 'black'] });
  });

  it.each([['Last'], ['last_coat'], [''], ['a:b']])('ключ «%s» не kebab-case — ошибка в коде секции', (key) => {
    const storage = createSectionStorage('shop:scarf-match', pageStorage(window, 'preview'));
    expect(errorOf(() => storage.set(key, 1))).toMatchObject({ code: 'sdk-call-invalid' });
  });
});
