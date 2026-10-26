import { tokenOf } from './customer-token';
import type { Reply } from './failures';
import { requestJson, type JsonRequest } from './requests';
import { pageStorage } from './storage';
import type { CoreHandle } from './types';

// Товар продаётся формой расширения, а не корзиной (блок 15, часть 15г, Р15г-1; как extension-sale.ts пяти тем на dev).
export const SOLD_CACHE_KEY = 'merfy:sold-by-form:v1';
export const SOLD_CACHE_TTL_MS = 5 * 60 * 1000;
export const SOLD_PARALLEL = 4;

export interface SoldByForm {
  // Ответ уже известен (ядро или кэш вкладки своего магазина, моложе SOLD_CACHE_TTL_MS); undefined — не спрашивали.
  known(productId: string): boolean | undefined;
  // Один запрос на товар (повторный вызов ждёт тот же ответ); сбой и превью — false без запоминания.
  check(productId: string): Promise<boolean>;
}

// Один объект на ядро (WeakMap по CoreHandle).
export function soldByFormOf(core: CoreHandle): SoldByForm {
  const state = STATES.get(core) ?? createState(core);
  STATES.set(core, state);
  if (core.mode === 'preview') return PREVIEW;
  return { known: (id) => state.known.get(id), check: (id) => check(state, id) };
}

const STATES = new WeakMap<CoreHandle, SoldState>();
const PREVIEW: SoldByForm = { known: () => undefined, check: () => Promise.resolve(false) };

// Пара «id расширения → функция формы точки product».
type Pair = readonly [id: string, form: string];

interface SoldState {
  readonly storeId: string;
  readonly apiUrl: string; // '' — конфиг витрины не прочитан: запросов нет
  readonly token: string | null;
  readonly known: Map<string, boolean>;
  readonly pending: Map<string, Promise<boolean>>;
  readonly queue: (() => Promise<void>)[]; // запуск отложенных запросов функции формы
  readonly pairs: readonly Pair[]; // функции формы мест product из config.extPoints (часть 15д, Р15д-1)
  active: number; // запросов функции формы идёт сейчас
}

// Пары «id расширения → функция формы места product» из конфига страницы, по порядку ключей (по алфавиту id).
const pairsOfConfig = (core: CoreHandle): readonly Pair[] =>
  Object.entries(core.config?.extPoints ?? {}).flatMap(([id, places]): readonly Pair[] =>
    places.product === undefined ? [] : [[id, places.product.form]],
  );

function createState(core: CoreHandle): SoldState {
  const config = core.config;
  const storeId = config === null ? '' : config.shop.id;
  const apiUrl = config === null ? '' : config.api.url;
  return { storeId, apiUrl, token: tokenOf(pageStorage(window, core.mode)), known: knownFromCache(storeId), pending: new Map(), queue: [], pairs: pairsOfConfig(core), active: 0 };
}

// Ответы вкладки: свежие и своего магазина; иначе — пусто, ядро спросит заново.
function knownFromCache(storeId: string): Map<string, boolean> {
  const saved = savedOf();
  if (saved === null || saved.storeId !== storeId || Date.now() - saved.at > SOLD_CACHE_TTL_MS) return new Map();
  return saved.ids;
}

// Запись кэша вкладки; хранилище недоступно или запись битая — null.
function savedOf(): { storeId: string; at: number; ids: Map<string, boolean> } | null {
  try {
    return checkedSaved(JSON.parse(sessionStorage.getItem(SOLD_CACHE_KEY) ?? 'null'));
  } catch {
    return null; // ошибки чтения — молча: ответы живут только в памяти ядра
  }
}

function checkedSaved(parsed: unknown): { storeId: string; at: number; ids: Map<string, boolean> } | null {
  if (!isRecord(parsed) || typeof parsed.storeId !== 'string' || typeof parsed.at !== 'number' || !isRecord(parsed.ids)) {
    return null;
  }
  return { storeId: parsed.storeId, at: parsed.at, ids: new Map(Object.entries(parsed.ids).flatMap(idBooleanOf)) };
}

// Пара «id товара → ответ», только булевы значения; остальные записи кэша отброшены.
const idBooleanOf = ([id, value]: readonly [string, unknown]): readonly (readonly [string, boolean])[] =>
  typeof value === 'boolean' ? [[id, value]] : [];

function writeCache(state: SoldState): void {
  const entry = JSON.stringify({ storeId: state.storeId, at: Date.now(), ids: Object.fromEntries(state.known) });
  try {
    sessionStorage.setItem(SOLD_CACHE_KEY, entry);
  } catch {
    // запись не удалась — ответы остаются в памяти ядра
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Функция формы дала форму: успех — любой 2xx (шлюз отвечает на POST функций расширения статусом 201, как ext.ts),
// data — объект (не массив, не null).
function hasForm(reply: Reply): boolean {
  if (reply.status < 200 || reply.status > 299) return false;
  const body = reply.body;
  return isRecord(body) && body.success === true && isRecord(body.data);
}

function askForm(state: SoldState, pair: Pair, productId: string): Promise<Reply> {
  const [id, form] = pair;
  const path = `/store/extensions/${encodeURIComponent(id)}/fn/${encodeURIComponent(form)}`;
  const url = `${state.apiUrl}${path}?store_id=${encodeURIComponent(state.storeId)}`;
  const init: JsonRequest = { method: 'POST', body: { productId }, ...(state.token === null ? {} : { token: state.token }) };
  return requestJson(url, init);
}

// Не больше SOLD_PARALLEL запросов функции формы разом (как createLimiter на dev).
function limited<T>(state: SoldState, task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    state.queue.push(() => task().then(resolve, reject));
    pump(state);
  });
}

function pump(state: SoldState): void {
  while (state.active < SOLD_PARALLEL && state.queue.length > 0) {
    const next = state.queue.shift();
    if (next === undefined) return;
    state.active += 1;
    void Promise.resolve()
      .then(next)
      .finally(() => {
        state.active -= 1;
        pump(state);
      });
  }
}

// Ответ по товару: true — первая функция формы дала форму, false — форм нет; null — сбой, не запоминаем.
async function answerOf(state: SoldState, productId: string): Promise<boolean | null> {
  for (const pair of state.pairs) {
    const reply = await limited(state, () => askForm(state, pair, productId));
    if (reply.status === 0) return null;
    if (hasForm(reply)) return true;
  }
  return false;
}

// Один запрос на товар: повторный вызов ждёт тот же ответ; сбой — false без запоминания и без ожидания в pending.
async function askOf(state: SoldState, productId: string): Promise<boolean> {
  const answer = await answerOf(state, productId);
  if (answer !== null) {
    state.known.set(productId, answer);
    writeCache(state);
    return answer;
  }
  state.pending.delete(productId);
  return false;
}

function check(state: SoldState, productId: string): Promise<boolean> {
  const done = state.pending.get(productId) ?? askOf(state, productId);
  state.pending.set(productId, done);
  return done;
}
