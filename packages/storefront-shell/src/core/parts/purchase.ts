import { tokenOf } from '../customer-token';
import type { Reply } from '../failures';
import { EXT_POINT_ATTRIBUTE } from '../ext-points';
import { requestJson, type JsonRequest } from '../requests';
import { pageStorage } from '../storage';
import type { CoreHandle, InstanceHost, SdkPart } from '../types';

// Часть purchase (блок 12 «Секций и SDK», место — 12б, Р12б-12; без theme-base — 12д, Р12д-8): рантайма theme-base
// здесь нет — форму покупки показывает секция расширения. Часть прячет детей места data-ext-point="product" с
// data-product-id (кнопку «В корзину»), если функция формы точки product включённого расширения отдала форму для
// товара места. Имён расширений часть не знает: список функций — из карты /store/extensions/storefront. В превью
// конструктора блоков нет (Р12б-17). api — пустой замороженный объект: своих методов для секций нет.
export const purchase: SdkPart<'purchase', Readonly<Record<string, never>>> = {
  name: 'purchase',
  create: (core): Readonly<Record<string, never>> => {
    CORES.set(EMPTY_API, core);
    return EMPTY_API;
  },
  attach: (api, host): void => {
    if (host.mode === 'preview') return;
    const core = CORES.get(api);
    if (core === undefined) return;
    void hideCartButtons(core, host);
  },
};

const EMPTY_API: Readonly<Record<string, never>> = Object.freeze({});
const CORES = new WeakMap<Readonly<Record<string, never>>, CoreHandle>();

// Данные для запросов функций формы: адрес шлюза, магазин и токен покупательницы, если она вошла.
interface FormApi {
  readonly url: string;
  readonly storeId: string;
  readonly token: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Функция формы дала форму: успех и data — объект (не массив, не null).
function hasForm(reply: Reply): boolean {
  if (reply.status !== 200) return false;
  const body = reply.body;
  return isRecord(body) && body.success === true && isRecord(body.data);
}

// Пары «id расширения → функция формы точки product» из карты включённых расширений, по порядку ключей карты.
function formPairsOf(body: unknown): readonly (readonly [string, string])[] {
  if (!isRecord(body)) return [];
  return Object.entries(body).flatMap(([id, entry]): readonly (readonly [string, string])[] => {
    if (!isRecord(entry) || !isRecord(entry.product)) return [];
    const form = entry.product.form;
    return typeof form === 'string' && form !== '' ? [[id, form]] : [];
  });
}

// Данные ответа шлюза: внутри конверт { success, data } — карта расширений или форма.
const dataOf = (reply: Reply): unknown => {
  const body = reply.body;
  return isRecord(body) ? body.data : null;
};

function soldByForm(api: FormApi, pair: readonly [string, string], productId: string): Promise<boolean> {
  const [id, form] = pair;
  const path = `/store/extensions/${encodeURIComponent(id)}/fn/${encodeURIComponent(form)}`;
  const url = `${api.url}${path}?store_id=${encodeURIComponent(api.storeId)}`;
  const init: JsonRequest =
    api.token === null
      ? { method: 'POST', body: { productId } }
      : { method: 'POST', body: { productId }, token: api.token };
  return requestJson(url, init).then(hasForm);
}

// Дети места — кнопки товара: прячем, как только первая функция формы ответила формой; остальные пары не зовутся.
async function hideIfSold(
  api: FormApi,
  pairs: readonly (readonly [string, string])[],
  place: HTMLElement,
): Promise<void> {
  const productId = place.getAttribute('data-product-id');
  if (productId === null) return;
  for (const pair of pairs) {
    if (!(await soldByForm(api, pair, productId))) continue;
    for (const child of place.querySelectorAll<HTMLElement>(':scope > *')) {
      child.hidden = true;
      child.style.display = 'none';
    }
    return;
  }
}

async function hideCartButtons(core: CoreHandle, host: InstanceHost): Promise<void> {
  const config = core.config;
  if (config === null) return;
  const places = [...host.element.querySelectorAll<HTMLElement>(`[${EXT_POINT_ATTRIBUTE}="product"][data-product-id]`)];
  if (places.length === 0) return;
  const mapUrl = `${config.api.url}/store/extensions/storefront?store_id=${encodeURIComponent(config.shop.id)}`;
  const map = await requestJson(mapUrl, { method: 'GET' });
  const pairs = formPairsOf(dataOf(map));
  if (pairs.length === 0) return;
  const api: FormApi = { url: config.api.url, storeId: config.shop.id, token: tokenOf(pageStorage(window, core.mode)) };
  for (const place of places) await hideIfSold(api, pairs, place);
}
