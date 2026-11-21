import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Правила адресов для чужих сайтов «Дизайна по ссылке» — те же, что `net-guard.ts` у merfy-mcp и `vizi/web/guard.py`:
//
// - только порты 80 и 443;
// - имя разрешается один раз, проверяется КАЖДЫЙ адрес: loopback, 0.0.0.0/8, частные сети, link-local (метаданные
//   облака), CGNAT, multicast, зарезервированные, то же в IPv6 (включая ::ffff:<v4>, NAT64, 6to4) — отказ;
// - адреса нашего сервера (умолчание плюс OUTBOUND_BLOCKED_ADDRESSES) — отказ, кроме имён из DESIGN_OWN_HOSTS
//   (по умолчанию merfy.ru): витрины магазинов платформы стоят на нашем сервере и открыты всему интернету, поэтому им
//   прощается только «наш сервер», не частные сети;
// - соединение идёт на уже проверенный адрес (`design-egress.ts`), имя второй раз не разрешается.
//
// Нынешний `look-guard.ts` (только по имени) остаётся для снимков черновика: там открывается наш HTML.

export const ALLOWED_PORTS: ReadonlySet<number> = new Set([80, 443]);
const OWN_SERVER_ADDRESSES = ['200.169.180.243', '176.57.218.121'];
const OWN_HOSTS_DEFAULT = ['merfy.ru'];

export const REFUSED_INTERNAL = 'адрес ведёт во внутреннюю сеть';
export const REFUSED_PORT = 'принимаются только порты 80 и 443';
export const REFUSED_SCHEME = 'принимается только http(s)-адрес';
export const REFUSED_NAME = 'имя сайта не разрешилось';

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_V6: Array<[string, number]> = [
  ['::', 96],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

const familyOf = (address: string): 'ipv4' | 'ipv6' => (isIP(address) === 6 ? 'ipv6' : 'ipv4');

function subnets(entries: Array<[string, number]>, list: BlockList): BlockList {
  for (const [network, prefix] of entries) list.addSubnet(network, prefix, familyOf(network));
  return list;
}

const RESERVED = subnets([...BLOCKED_V4, ...BLOCKED_V6], new BlockList());

// Запись «IP» или «IP/префикс»; непонятная пропускается, а не роняет процесс.
function entryOf(raw: string): [string, number] | null {
  const [address = '', prefix] = raw.trim().split('/');
  const family = isIP(address);
  if (family === 0) return null;
  const whole = family === 6 ? 128 : 32;
  return [address, prefix !== undefined && /^\d+$/.test(prefix) ? Number(prefix) : whole];
}

export const words = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);

// ::ffff:a.b.c.d — тот же IPv4, проверяется по правилам IPv4.
export function unmapped(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1] !== undefined) return mapped[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex?.[1] === undefined || hex[2] === undefined) return address;
  const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type HostLookup = (host: string) => Promise<ResolvedAddress[]>;

export const systemLookup: HostLookup = async (host) => {
  const found = await dnsLookup(host, { all: true, verbatim: true });
  return found.map((entry) => ({ address: entry.address, family: entry.family === 6 ? 6 : 4 }));
};

// Отказ фильтра. `internal` — адрес во внутренней сети или на нашем сервере; иначе порт, схема или имя.
export class AddressRefused extends Error {
  constructor(
    readonly reason: string,
    readonly internal: boolean,
    options?: { cause?: unknown },
  ) {
    super(reason, options);
    this.name = 'AddressRefused';
  }
}

export interface Target {
  host: string;
  port: number;
  // Уже проверенные адреса, IPv4 первыми: в контейнере без IPv6 соединение по нему не встанет.
  addresses: ResolvedAddress[];
}

export interface GuardOptions {
  lookup?: HostLookup;
  // Ещё адреса и сети нашего сервера (OUTBOUND_BLOCKED_ADDRESSES).
  blocked?: string[];
  // Имена (с поддоменами), которым прощается «наш сервер» (DESIGN_OWN_HOSTS).
  ownHosts?: string[];
}

const ownHost = (host: string, suffixes: string[]): boolean =>
  suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));

export class DesignGuard {
  private readonly lookup: HostLookup;
  private readonly own: BlockList;
  private readonly ownHosts: string[];

  constructor(options: GuardOptions = {}) {
    this.lookup = options.lookup ?? systemLookup;
    const entries = [...OWN_SERVER_ADDRESSES, ...(options.blocked ?? [])].map(entryOf);
    this.own = subnets(
      entries.filter((entry) => entry !== null),
      new BlockList(),
    );
    this.ownHosts = options.ownHosts ?? OWN_HOSTS_DEFAULT;
  }

  static fromEnv(env: NodeJS.ProcessEnv, lookup?: HostLookup): DesignGuard {
    const ownHosts = env.DESIGN_OWN_HOSTS === undefined ? OWN_HOSTS_DEFAULT : words(env.DESIGN_OWN_HOSTS);
    return new DesignGuard({ blocked: words(env.OUTBOUND_BLOCKED_ADDRESSES), ownHosts, ...(lookup ? { lookup } : {}) });
  }

  // Адрес во внутренней сети или зарезервирован (без «нашего сервера»).
  reserved(raw: string): boolean {
    const address = unmapped(raw.replace(/^\[|\]$/g, ''));
    if (address.includes('%') || isIP(address) === 0) return true;
    return RESERVED.check(address, familyOf(address));
  }

  ownServer(raw: string): boolean {
    const address = unmapped(raw.replace(/^\[|\]$/g, ''));
    return isIP(address) !== 0 && this.own.check(address, familyOf(address));
  }

  // Проверить `host:port` и разрешить имя один раз. Любой запретный адрес среди найденных — отказ целиком.
  async resolve(rawHost: string, port: number): Promise<Target> {
    if (!ALLOWED_PORTS.has(port)) throw new AddressRefused(REFUSED_PORT, false);
    const host = rawHost
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '')
      .toLowerCase();
    const literal = isIP(host);
    const given: ResolvedAddress = { address: host, family: literal === 6 ? 6 : 4 };
    const addresses = literal === 0 ? await this.names(host) : [given];
    const forgiven = literal === 0 && ownHost(host, this.ownHosts);
    const bad = (entry: ResolvedAddress): boolean =>
      this.reserved(entry.address) || (!forgiven && this.ownServer(entry.address));
    if (addresses.length === 0 || addresses.some(bad)) throw new AddressRefused(REFUSED_INTERNAL, true);
    const sorted = [...addresses].sort((a, b) => a.family - b.family);
    return { host, port, addresses: sorted };
  }

  // Полный адрес страницы: схема, порт, имя.
  async checkUrl(raw: string): Promise<Target> {
    const url = URL.canParse(raw) ? new URL(raw) : null;
    if (url === null || !['http:', 'https:'].includes(url.protocol)) throw new AddressRefused(REFUSED_SCHEME, false);
    const port = url.port === '' ? defaultPort(url.protocol) : Number(url.port);
    return this.resolve(url.hostname, port);
  }

  private async names(host: string): Promise<ResolvedAddress[]> {
    try {
      return await this.lookup(host);
    } catch (error) {
      throw new AddressRefused(REFUSED_NAME, false, { cause: error });
    }
  }
}

export const defaultPort = (protocol: string): number => (protocol === 'https:' ? 443 : 80);
