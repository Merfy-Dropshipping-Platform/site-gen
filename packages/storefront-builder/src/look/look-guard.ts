// Что страница не получает во время снимка черновика (перенесено 28.10 из merfy-mcp `src/nova/look-guard.ts`). В
// Chromium выполняется код страницы магазина (секции пишет мерчант или агент), а сам браузер запущен в сети сервера: без
// этого фильтра скрипт страницы дотянулся бы до служб внутри сети (базы, брокер, sites и шлюз по внутреннему имени,
// метаданные облака). Блокируем адреса, которые не бывают публичными. Подмену DNS это не закрывает — для неё нужна
// сетевая изоляция контейнера.

const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isInternalIpv4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return a === 100 && b >= 64 && b <= 127;
}

// Публичные адреса IPv6 начинаются с 2 или 3; всё остальное (loopback, fc00::/7, fe80::/10, ::ffff:…) — внутреннее.
const isInternalIpv6 = (host: string): boolean => !/^\[[23]/.test(host);

export function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[')) return isInternalIpv6(host);
  const ipv4 = IPV4.exec(host);
  if (ipv4) return isInternalIpv4(Number(ipv4[1]), Number(ipv4[2]));
  if (host === 'localhost' || !host.includes('.')) return true;
  return INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// Запрос разрешён, если это http(s) на публичный адрес. Адрес, который не разобрался, не разрешён.
export function isAllowedRequest(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return !isInternalHost(parsed.hostname);
}
