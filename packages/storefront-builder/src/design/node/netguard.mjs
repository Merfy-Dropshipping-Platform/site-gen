// Сеть Node-процесса инструмента дизайна: только loopback-адреса из DESIGN_NET_ALLOW. Подключается до кода инструмента
// (`node --import ./netguard.mjs ...`, `design-node.ts`). Разрешены два адреса: наш фильтр (через него идут fetch и http
// по HTTP(S)_PROXY и NODE_USE_ENV_PROXY=1) и CDP нашего Chromium. Любое другое TCP-соединение, сокет по пути и UDP —
// отказ EACCES до соединения. Образец — прототип Визи `vizi/design/node/netguard.mjs`.
import dgram from 'node:dgram';
import net from 'node:net';

const allowed = new Set((process.env.DESIGN_NET_ALLOW || '').split(',').filter(Boolean));
const LOOPBACK = new Map([
  ['127.0.0.1', '127.0.0.1'],
  ['localhost', '127.0.0.1'],
]);

function target(args) {
  const [first, second] = args;
  if (Array.isArray(first)) return target(first); // внутренняя форма Node: [options, cb]
  if (first && typeof first === 'object') {
    return first.path ? { path: first.path } : { host: first.host ?? 'localhost', port: Number(first.port) };
  }
  if (typeof first === 'string' && Number.isNaN(Number(first))) return { path: first };
  return { host: typeof second === 'string' ? second : 'localhost', port: Number(first) };
}

function refused(what) {
  return Object.assign(new Error(`design: сеть процесса закрыта (${what})`), { code: 'EACCES' });
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guarded(...args) {
  const t = target(args);
  const key = t.path ? null : `${LOOPBACK.get(t.host) ?? t.host}:${t.port}`;
  if (key && LOOPBACK.has(t.host) && allowed.has(key)) return connect.apply(this, args);
  const error = refused(t.path ?? key);
  process.nextTick(() => this.destroy(error));
  return this;
};

dgram.createSocket = () => {
  throw refused('udp');
};
