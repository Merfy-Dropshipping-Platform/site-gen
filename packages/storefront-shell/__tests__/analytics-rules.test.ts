import { describe, expect, it } from 'vitest';
import { CONSENT_KEY, CONSENT_RULES, readConsent, storedConsent } from '../src/core/analytics/consent';
import {
  SESSION_COOKIE,
  VISITOR_COOKIE,
  VISITOR_MS,
  VISIT_KEY,
  VISIT_MS,
  idsFor,
  type IdentityEnv,
} from '../src/core/analytics/identity';
import { readSettings } from '../src/core/analytics/settings';
import { pageStorage, storageOf, type KeyValue } from '../src/core/analytics/storage';
import { OWNER_KEY, applyOwnerParam, trafficOf, type TrafficEnv } from '../src/core/analytics/traffic';

// Правила модуля аналитики (design.md блока 11): таблица согласия (С11-2 В), визит и посетитель (решил сам 9), пометка
// трафика (решил сам 7), настройки из конфига страницы. Чистые функции на хранилищах и cookie в памяти.
const NOW = Date.parse('2026-10-10T08:00:00.000Z');
const ANSWERED_AT = '2026-10-10T07:59:00.000Z';
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';

// Хранилище в памяти с начальными значениями — как localStorage или sessionStorage.
function memory(entries: Record<string, string> = {}): KeyValue {
  const storage = pageStorage();
  Object.entries(entries).forEach(([key, value]) => storage.setItem(key, value));
  return storage;
}

// document.cookie в памяти: запись — «имя=значение;атрибуты», чтение — «имя=значение; имя=значение».
function cookieJar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const written: string[] = [];
  const write = (cookie: string): void => {
    written.push(cookie);
    const [pair = ''] = cookie.split(';');
    const [name = '', value = ''] = pair.split('=');
    values.set(name, value);
  };
  const read = (): string => [...values].map(([name, value]) => `${name}=${value}`).join('; ');
  return { read, write, written };
}

function identityEnv(cookies = cookieJar()) {
  let now = NOW;
  let ids = 0;
  const env: IdentityEnv = { cookies, session: memory(), now: () => now, newId: () => `id-${(ids += 1)}` };
  return { env, written: cookies.written, later: (ms: number): void => void (now += ms) };
}

const expiresIn = (ms: number): string => new Date(NOW + ms).toUTCString();

// Адрес и история страницы: replaceState меняет адрес, как в браузере.
function trafficEnv(href: string, local = memory(), webdriver = false) {
  const location = { href };
  const replaced: string[] = [];
  const history = {
    state: null,
    replaceState: (_state: unknown, _unused: string, url?: string | URL | null): void => {
      replaced.push(String(url));
      location.href = new URL(String(url), location.href).href;
    },
  };
  const env: TrafficEnv = { location, history, local, webdriver };
  return { env, replaced };
}

const CONFIG = {
  v: 1,
  mode: 'live',
  shop: { id: SHOP, name: 'Шарфы', url: 'https://scarves.example' },
  currency: 'RUB',
  locale: 'ru-RU',
  api: { url: 'https://gateway.dev.merfy.ru/api' },
  theme: { id: 'nova', version: '0.1.0' },
  page: { id: 'catalog', path: '/catalog' },
  analytics: { url: 'https://analytics.dev.merfy.ru', counters: [{ kind: 'metrika', number: '12345678' }] },
};

// Документ с тегом конфига страницы (блок 3); null — тега нет.
function documentWith(text: string | null): Document {
  const doc = document.implementation.createHTMLDocument('Магазин');
  if (text === null) return doc;
  const tag = doc.createElement('script');
  tag.type = 'application/json';
  tag.id = 'merfy-config';
  tag.textContent = text;
  doc.head.append(tag);
  return doc;
}

const settingsOf = (config: object): ReturnType<typeof readSettings> =>
  readSettings(documentWith(JSON.stringify(config)));

describe('хранилища браузера', () => {
  it('недоступно или null — хранилище страницы в памяти: модуль работает дальше', () => {
    const denied = storageOf(() => {
      throw new Error('SecurityError: доступ к хранилищу запрещён');
    });
    denied.setItem('ключ', 'значение');
    expect(denied.getItem('ключ')).toBe('значение');
    expect(storageOf(() => null).getItem('ключ')).toBeNull();
  });

  it('доступно — берётся оно само', () => {
    const local = memory();
    expect(storageOf(() => local)).toBe(local);
  });
});

describe('согласие — одна таблица (С11-2 В)', () => {
  it('до ответа — визит без метки на год, принял — метки, счётчики и «свой код», отклонил — ничего', () => {
    expect(CONSENT_RULES).toEqual({
      unknown: { identity: 'visit', counters: false, custom: false },
      accepted: { identity: 'visitor', counters: true, custom: true },
      declined: { identity: 'none', counters: false, custom: false },
    });
  });

  it('ответ в ключ — как у баннера пяти тем: дата или «declined:<дата>»; читается обратно тем же ответом', () => {
    const at = new Date(ANSWERED_AT);
    expect([storedConsent('accepted', at), storedConsent('declined', at)]).toEqual([
      ANSWERED_AT,
      `declined:${ANSWERED_AT}`,
    ]);
    expect(readConsent(memory({ [CONSENT_KEY]: storedConsent('declined', at) }))).toBe('declined');
  });

  it.each<[string | null, string]>([
    [null, 'unknown'],
    ['', 'unknown'],
    [ANSWERED_AT, 'accepted'],
    [`declined:${ANSWERED_AT}`, 'declined'],
  ])('ответ баннера %j → %s', (answer, state) => {
    expect(readConsent(memory(answer === null ? {} : { [CONSENT_KEY]: answer }))).toBe(state);
  });
});

describe('визит и посетитель (решил сам 9)', () => {
  it('до ответа: визит в sessionStorage, один номер — и визит, и посетитель; cookie не пишутся', () => {
    const { env, written } = identityEnv();
    expect(idsFor('visit', env)).toEqual({ sessionId: 'id-1', visitorId: 'id-1', started: true });
    expect(idsFor('visit', env)).toEqual({ sessionId: 'id-1', visitorId: 'id-1', started: false });
    expect(env.session.getItem(VISIT_KEY)).toBe(`id-1|${NOW}`);
    expect(written).toEqual([]);
  });

  it('визит живёт 30 минут с последнего события, потом — новый', () => {
    const { env, later } = identityEnv();
    idsFor('visit', env);
    later(VISIT_MS - 1);
    expect(idsFor('visit', env)?.started).toBe(false);
    later(VISIT_MS);
    expect(idsFor('visit', env)).toEqual({ sessionId: 'id-2', visitorId: 'id-2', started: true });
  });

  it('принял посреди визита: метки получают номер текущего визита — до и после «принять» один посетитель', () => {
    const { env, written } = identityEnv();
    idsFor('visit', env);
    expect(idsFor('visitor', env)).toEqual({ sessionId: 'id-1', visitorId: 'id-1', started: false });
    expect(written).toEqual([
      `${VISITOR_COOKIE}=id-1;expires=${expiresIn(VISITOR_MS)};path=/;SameSite=Lax`,
      `${SESSION_COOKIE}=id-1;expires=${expiresIn(VISIT_MS)};path=/;SameSite=Lax`,
    ]);
  });

  it('метки нынешнего трекера: посетитель — из _mfy_vid без перезаписи, визит — из _mfy_sid с продлением', () => {
    const { env, written } = identityEnv(cookieJar({ [VISITOR_COOKIE]: 'vis_old', [SESSION_COOKIE]: 'sess_old' }));
    expect(idsFor('visitor', env)).toEqual({ sessionId: 'sess_old', visitorId: 'vis_old', started: false });
    expect(written).toEqual([`${SESSION_COOKIE}=sess_old;expires=${expiresIn(VISIT_MS)};path=/;SameSite=Lax`]);
  });

  it('принял, меток и визита ещё нет — новый визит, он же посетитель', () => {
    const { env } = identityEnv();
    expect(idsFor('visitor', env)).toEqual({ sessionId: 'id-1', visitorId: 'id-1', started: true });
  });

  it('отклонил — номеров нет, ничего не пишется', () => {
    const { env, written } = identityEnv();
    expect(idsFor('none', env)).toBeNull();
    expect([written, env.session.getItem(VISIT_KEY)]).toEqual([[], null]);
  });
});

describe('пометка трафика (решил сам 7)', () => {
  it('?mfy_owner=1 — владелец: метка запомнена, параметр убран, остальное в адресе на месте', () => {
    const { env, replaced } = trafficEnv('https://scarves.example/catalog?mfy_owner=1&utm_source=vk#top');
    expect(applyOwnerParam(env)).toBe(true);
    expect(replaced).toEqual(['/catalog?utm_source=vk#top']);
    expect(env.local.getItem(OWNER_KEY)).toBe('1');
    expect(trafficOf(env, null)).toBe('internal');
  });

  it('?mfy_owner=0 — метка снята; без параметра адрес не трогается', () => {
    const { env } = trafficEnv('https://scarves.example/?mfy_owner=0', memory({ [OWNER_KEY]: '1' }));
    expect(applyOwnerParam(env)).toBe(false);
    expect(trafficOf(env, null)).toBeNull();
    const plain = trafficEnv('https://scarves.example/catalog');
    expect([applyOwnerParam(plain.env), plain.replaced]).toEqual([null, []]);
  });

  it('незнакомое значение — параметр убран, метка не тронута', () => {
    const { env, replaced } = trafficEnv('https://scarves.example/?mfy_owner=yes');
    expect(applyOwnerParam(env)).toBeNull();
    expect(replaced).toEqual(['/']);
    expect(env.local.getItem(OWNER_KEY)).toBeNull();
  });

  it('робот важнее владельца; метка из адреса этой страницы действует и без хранилища', () => {
    expect(trafficOf(trafficEnv('https://scarves.example/', memory({ [OWNER_KEY]: '1' }), true).env, true)).toBe('bot');
    expect(trafficOf(trafficEnv('https://scarves.example/').env, true)).toBe('internal');
    expect(trafficOf(trafficEnv('https://scarves.example/').env, null)).toBeNull();
  });
});

describe('настройки из конфига страницы', () => {
  it('магазин, режим, путь страницы, адрес сборщика и счётчики', () => {
    expect(settingsOf(CONFIG)).toEqual({
      shopId: SHOP,
      live: true,
      path: '/catalog',
      url: 'https://analytics.dev.merfy.ru',
      counters: [{ kind: 'metrika', number: '12345678' }],
    });
  });

  it.each<[string, string | null]>([
    ['тега нет', null],
    ['в теге не JSON', '{"v":1'],
    ['analytics: null — превью и стенд', JSON.stringify({ ...CONFIG, analytics: null })],
    ['нет магазина', JSON.stringify({ ...CONFIG, shop: null })],
    ['пустой адрес сборщика', JSON.stringify({ ...CONFIG, analytics: { url: '', counters: [] } })],
  ])('%s — настроек нет, модуль молчит', (_title, text) => {
    expect(readSettings(documentWith(text))).toBeNull();
  });

  it('счётчик незнакомого вида или без номера пропускается', () => {
    const counters = [{ kind: 'meta', number: '1' }, { kind: 'vk' }, { kind: 'google', number: 'G-ABCD1234' }];
    expect(settingsOf({ ...CONFIG, analytics: { ...CONFIG.analytics, counters } })?.counters).toEqual([
      { kind: 'google', number: 'G-ABCD1234' },
    ]);
  });

  it('превью конструктора — live: false', () => {
    expect(settingsOf({ ...CONFIG, mode: 'preview' })?.live).toBe(false);
  });
});
