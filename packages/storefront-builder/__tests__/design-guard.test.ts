import { describe, expect, it } from 'vitest';
import {
  AddressRefused,
  DesignGuard,
  REFUSED_INTERNAL,
  REFUSED_NAME,
  REFUSED_PORT,
  REFUSED_SCHEME,
  defaultPort,
  systemLookup,
  unmapped,
  words,
  type HostLookup,
} from '../src/design/design-guard';

// Правила адресов «Дизайна по ссылке»: внутренние адреса, имена во внутреннюю сеть, наш сервер, порты.
const table: Record<string, string[]> = {
  'shop.example': ['93.184.216.34'],
  'localtest.me': ['127.0.0.1'],
  'mixed.example': ['93.184.216.34', '10.0.0.5'],
  'v6.example': ['2606:4700::1111'],
  'mapped.example': ['::ffff:192.168.1.1'],
  'ours.example': ['200.169.180.243'],
  'shop.dev.merfy.ru': ['200.169.180.243'],
  'evil.merfy.ru': ['10.0.0.7'],
  'empty.example': [],
};
const lookup: HostLookup = (host) => {
  const found = table[host];
  if (found === undefined) return Promise.reject(new Error(`ENOTFOUND ${host}`));
  return Promise.resolve(found.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
};

async function refusal(work: Promise<unknown>): Promise<AddressRefused> {
  try {
    await work;
  } catch (error) {
    if (error instanceof AddressRefused) return error;
    throw error;
  }
  throw new Error('ожидался отказ');
}

describe('фильтр адресов «Дизайна по ссылке»', () => {
  const guard = new DesignGuard({ lookup });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.0.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fe80::1',
    'fd00::5',
    '[::1]',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('внутренний адрес %s — отказ', async (address) => {
    const error = await refusal(guard.resolve(address, 443));
    expect(error.reason).toBe(REFUSED_INTERNAL);
    expect(error.internal).toBe(true);
  });

  it('localhost (и с точкой в конце) — отказ: имя разрешается в 127.0.0.1', async () => {
    const local = new DesignGuard({ lookup: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]) });
    expect((await refusal(local.resolve('localhost', 80))).internal).toBe(true);
    expect((await refusal(local.resolve('LOCALHOST.', 80))).internal).toBe(true);
  });

  it('имя, которое разрешается во внутренний адрес (localtest.me → 127.0.0.1), — отказ', async () => {
    expect((await refusal(guard.resolve('localtest.me', 443))).reason).toBe(REFUSED_INTERNAL);
  });

  it('хоть один внутренний адрес среди найденных — отказ целиком', async () => {
    expect((await refusal(guard.resolve('mixed.example', 443))).internal).toBe(true);
    expect((await refusal(guard.resolve('mapped.example', 443))).internal).toBe(true);
    expect((await refusal(guard.resolve('empty.example', 443))).internal).toBe(true);
  });

  it.each([22, 8080, 3000, 5432, 6379, 15672])('порт %d — отказ', async (port) => {
    const error = await refusal(guard.resolve('shop.example', port));
    expect(error.reason).toBe(REFUSED_PORT);
    expect(error.internal).toBe(false);
  });

  it('публичное имя на 80/443 — проверенные адреса, IPv4 первыми', async () => {
    expect(await guard.resolve('shop.example', 443)).toEqual({
      host: 'shop.example',
      port: 443,
      addresses: [{ address: '93.184.216.34', family: 4 }],
    });
    expect((await guard.resolve('v6.example', 80)).addresses).toEqual([{ address: '2606:4700::1111', family: 6 }]);
    expect((await guard.resolve('93.184.216.34', 80)).addresses).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('наш сервер — отказ; витрины платформы (*.merfy.ru) на нём — можно, но не частная сеть', async () => {
    expect((await refusal(guard.resolve('ours.example', 443))).internal).toBe(true);
    expect((await refusal(guard.resolve('200.169.180.243', 443))).internal).toBe(true);
    expect((await guard.resolve('shop.dev.merfy.ru', 443)).addresses[0]?.address).toBe('200.169.180.243');
    expect((await refusal(guard.resolve('evil.merfy.ru', 443))).internal).toBe(true);
  });

  it('настройки из окружения: свои адреса и свои имена', async () => {
    const strict = DesignGuard.fromEnv(
      { OUTBOUND_BLOCKED_ADDRESSES: '93.184.216.0/24, junk', DESIGN_OWN_HOSTS: '' },
      lookup,
    );
    expect((await refusal(strict.resolve('shop.example', 443))).internal).toBe(true);
    expect((await refusal(strict.resolve('shop.dev.merfy.ru', 443))).internal).toBe(true);
    expect(DesignGuard.fromEnv({}).ownServer('176.57.218.121')).toBe(true);
  });

  it('адрес страницы: схема, порт по умолчанию, имя не разрешилось', async () => {
    expect((await guard.checkUrl('https://shop.example/a?b=1')).port).toBe(443);
    expect((await guard.checkUrl('http://shop.example/')).port).toBe(80);
    expect((await refusal(guard.checkUrl('https://shop.example:8443/'))).reason).toBe(REFUSED_PORT);
    expect((await refusal(guard.checkUrl('ftp://shop.example/'))).reason).toBe(REFUSED_SCHEME);
    expect((await refusal(guard.checkUrl('не адрес'))).reason).toBe(REFUSED_SCHEME);
    expect((await refusal(guard.checkUrl('https://nowhere.example/'))).reason).toBe(REFUSED_NAME);
    expect((await refusal(guard.checkUrl('http://[::1]/'))).internal).toBe(true);
  });

  it('мелкие разборы', () => {
    expect(unmapped('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(unmapped('::ffff:0a00:0001')).toBe('10.0.0.1');
    expect(unmapped('2001:db8::1')).toBe('2001:db8::1');
    expect(words(' A, b ,,')).toEqual(['a', 'b']);
    expect(words(undefined)).toEqual([]);
    expect(defaultPort('https:')).toBe(443);
    expect(guard.reserved('не адрес')).toBe(true);
    expect(guard.reserved('fe80::1%eth0')).toBe(true);
    expect(guard.ownServer('не адрес')).toBe(false);
  });

  it('настоящий DNS: localtest.me разрешается в 127.0.0.1 и отказывается', async () => {
    const real = new DesignGuard();
    const resolved = await systemLookup('localtest.me').catch(() => null);
    if (resolved === null) return; // нет сети у машины теста — правило выше проверено на подменённом DNS
    expect(resolved.map((entry) => entry.address)).toContain('127.0.0.1');
    expect((await refusal(real.resolve('localtest.me', 443))).internal).toBe(true);
  });
});
