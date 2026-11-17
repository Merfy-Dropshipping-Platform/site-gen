import type { Locator, Page, Route } from 'playwright';
import { z } from 'zod';
import { SAMPLE_CART_ID } from './look-sample';
import type { MarkResult, MarkStatus } from './look-types';

// Проверка меток витрины в снимке черновика (владелец 06.11: «метки сторфронта… универсальные тесты… платформа у себя
// проводила бы тесты»). Тест привязан к метке, а не к дизайну: стоит метка — её нажимают настоящим кликом и смотрят, что
// ядро сделало своё дело; метки нет — нечего проверять. Запись в корзину подменяется здесь: магазин, заказы и шлюз
// остаются как были, ответ не зависит от сети, поэтому красный — это поломка секции, а не сбой окружения.

// Ядро отвечает за миллисекунды: шлюз подменён, сети в проверке нет. Запас — на занятый отрисовщик: страниц разом две.
export const CLICK_MS = 500;
export const EFFECT_MS = 1_000;
const POLL_MS = 40;
const MAX_MODALS = 3;
const FAILURE_LOG = 'Сбой секции ';
const MAX_CAUSE = 200;
const CHOSEN = 'data-merfy-look-mark';

const CART_WRITE_PATH = /\/store\/carts(?:\/[^/]+\/items(?:\/[^/]+)?)?\/?$/;
const WRITE_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
};

const ItemBody = z.object({
  product_id: z.string(),
  quantity: z.number().optional(),
  variant_id: z.string().optional(),
});

// Количество растёт с каждым добавлением, как у настоящей корзины: иначе повторное нажатие не двигает счётчик и проверка
// даёт ложный красный (`added` — сколько раз уже добавляли, с этим разом).
export function itemReply(body: unknown, added: number): { item: Record<string, unknown> } {
  const parsed = ItemBody.safeParse(body);
  const quantity = (parsed.data?.quantity ?? 1) * added;
  const item = {
    id: 'look-line',
    orderId: SAMPLE_CART_ID,
    productId: parsed.data?.product_id ?? 'look-product',
    variantCombinationId: parsed.data?.variant_id ?? null,
    quantity,
    unitPriceCents: 0,
    totalCents: 0,
    name: '',
    imageUrl: null,
    options: null,
    isBonus: false,
  };
  return { item };
}

const isItemWrite = (write: string): boolean => write.startsWith('POST') && write.includes('/items');

const replyOf = (method: string, path: string, body: unknown, writes: string[]): { status: number; body: unknown } => {
  if (method === 'POST' && path.includes('/items')) {
    return { status: 201, body: itemReply(body, writes.filter(isItemWrite).length) };
  }
  if (method === 'POST') return { status: 201, body: { cart: { id: SAMPLE_CART_ID } } };
  return { status: 200, body: {} };
};

// Корзина, созданная подменой, для чтения: ядро перечитывает её после добавления. На шлюзе такой нет: его 404 ядро приняло
// бы за «корзину удалили» и сбросило счётчик, а проверка — за поломку магазина.
export function cartReply(writes: readonly string[]): unknown {
  const added = writes.filter(isItemWrite).length;
  return { cart: { id: SAMPLE_CART_ID }, items: added === 0 ? [] : [itemReply({}, added).item] };
}

const answerJson = (route: Route, status: number, body: unknown): Promise<void> =>
  route.fulfill({ status, headers: WRITE_CORS, contentType: 'application/json', body: JSON.stringify(body) });

// Корзина снимка: запись и чтение созданной здесь корзины — ответ тут, в `writes` — что ядро отправило. Корзину образца
// читает `look-page.ts`: она идёт раньше и отвечает на всех страницах корзины.
export async function answerCartWrite(route: Route, writes: string[]): Promise<boolean> {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const method = request.method();
  if (method === 'GET') {
    if (writes.length === 0 || !path.endsWith(`/store/carts/${SAMPLE_CART_ID}`)) return false;
    await answerJson(route, 200, cartReply(writes));
    return true;
  }
  if (!CART_WRITE_PATH.test(path)) return false;
  if (method === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: WRITE_CORS });
    return true;
  }
  writes.push(`${method} ${path}`);
  const reply = replyOf(method, path, request.postDataJSON(), writes);
  await answerJson(route, reply.status, reply.body);
  return true;
}

// shown: метку видно на этом экране; ready: у неё есть товар и она не выключена.
const RawMark = z.object({
  mark: z.string(),
  shown: z.boolean(),
  section: z.string().nullable(),
  ready: z.boolean(),
});
const RawMarks = z.object({ marks: z.array(RawMark), failed: z.array(z.string()) });
type RawMark = z.infer<typeof RawMark>;
type RawMarks = z.infer<typeof RawMarks>;

interface MarkEnv {
  page: Page;
  writes: string[];
  element: Locator;
}

type Verdict = { status: MarkStatus; text: string };

const OK: Verdict = { status: 'ok', text: '' };
const broken = (text: string): Verdict => ({ status: 'broken', text });
const hidden = (text: string): Verdict => ({ status: 'hidden', text });
const GONE = hidden('метка пропала со страницы, нажать нечего');

async function until(page: Page, done: () => Promise<boolean> | boolean): Promise<boolean> {
  const deadline = Date.now() + EFFECT_MS;
  for (;;) {
    if (await done()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(POLL_MS);
  }
}

// Настоящий клик; метку закрыло окно поверх страницы — событие напрямую: проверяется связь метки с ядром, а вёрстку
// смотрят проверки снимка. У обоих путей предел: кнопку, которую убрала перерисовка, Playwright ждёт по умолчанию 30 с,
// и одна пропавшая метка съедала срок всей страницы (17.11, «метки page-cart: не успел за 8 с»). false — нажать нечего.
async function press(element: Locator): Promise<boolean> {
  return element
    .click({ timeout: CLICK_MS })
    .catch(() => element.dispatchEvent('click', undefined, { timeout: CLICK_MS }))
    .then(
      () => true,
      () => false,
    );
}

// Атрибут метки с тем же пределом; метки уже нет — undefined.
const attributeOf = (element: Locator, name: string): Promise<string | null | undefined> =>
  element.getAttribute(name, { timeout: CLICK_MS }).catch(() => undefined);

const textOf = async (page: Page, ref: string): Promise<string | null> => {
  const badge = page.locator(`[data-ref="${ref}"]`).first();
  return (await badge.count()) === 0 ? null : badge.evaluate((node) => node.textContent);
};

const visibleIn = (page: Page, selector: string): Promise<boolean> =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);

// Счётчик рядом с меткой идёт за стором: на странице его нет — проверять нечего.
async function countMoved(page: Page, ref: string, before: string | null): Promise<boolean> {
  if (before === null) return true;
  return until(page, async () => (await textOf(page, ref)) !== before);
}

async function checkAdd({ page, writes, element }: MarkEnv): Promise<Verdict> {
  const before = await textOf(page, 'cart-count');
  const sent = writes.length;
  if (!(await press(element))) return GONE;
  const added = await until(page, () => writes.slice(sent).some((write) => write.includes('/items')));
  if (!added) return broken('кнопка не положила товар: запроса в корзину не было');
  const moved = await countMoved(page, 'cart-count', before);
  return moved ? OK : broken('товар добавлен, а счётчик корзины не изменился');
}

async function checkHeart({ page, element }: MarkEnv): Promise<Verdict> {
  const before = await attributeOf(element, 'aria-pressed');
  if (before === undefined) return GONE;
  const count = await textOf(page, 'favorites-count');
  if (!(await press(element))) return GONE;
  const marked = await until(page, async () => {
    const now = await attributeOf(element, 'aria-pressed');
    return now !== undefined && now !== before;
  });
  if (!marked) return broken('сердечко не отмечается: aria-pressed не изменился');
  const moved = await countMoved(page, 'favorites-count', count);
  await press(element);
  return moved ? OK : broken('сердечко отмечено, а счётчик избранного не изменился');
}

// `methods` — какие записи считаются ответом ядра. cart.change — PATCH или DELETE: количество 0 по контракту ядра убирает
// строку (`cart-change.ts`), так «−» при одной штуке и должен работать.
const checkWrite =
  (methods: readonly string[], what: string) =>
  async ({ page, writes, element }: MarkEnv): Promise<Verdict> => {
    const sent = writes.length;
    if (!(await press(element))) return GONE;
    const done = await until(page, () =>
      writes.slice(sent).some((write) => methods.some((method) => write.startsWith(`${method} `))),
    );
    return done ? OK : broken(`${what}: запроса в корзину не было`);
  };

const isLink = (element: Locator): Promise<boolean> =>
  element.evaluate((node) => node.closest('a[href]') !== null, undefined, { timeout: CLICK_MS }).catch(() => false);

const modalOpen = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.querySelector('dialog:modal') !== null).catch(() => false);

// Escape закрывает открытое проверкой; окна друг над другом и всплывшее по таймеру — столько раз, сколько их осталось.
async function closeOverlay(page: Page): Promise<void> {
  for (let tries = 0; tries < MAX_MODALS; tries += 1) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(POLL_MS);
    if (!(await modalOpen(page))) return;
  }
}

async function checkSearch({ page, element }: MarkEnv): Promise<Verdict> {
  const panel = '[data-role="search"] input';
  const hasPanel = (await page.locator('[data-role="search"]').count()) > 0;
  if (!(await press(element))) return GONE;
  if (!hasPanel) return (await isLink(element)) ? OK : broken('кнопка никуда не ведёт: панели поиска на странице нет');
  const opened = await until(page, () => visibleIn(page, panel));
  await closeOverlay(page);
  return opened ? OK : broken('панель поиска не открылась');
}

// Выезжающая корзина открывается событием, без неё cart.open с разметки не переходит сам: нужна ссылка на /cart.
async function checkCartOpen({ page, element }: MarkEnv): Promise<Verdict> {
  const hasDrawer = (await page.locator('[data-role="cart-drawer"]').count()) > 0;
  const link = await isLink(element);
  if (!hasDrawer) return link ? OK : broken('кнопка корзины никуда не ведёт: нужна ссылка на /cart');
  if (!(await press(element))) return GONE;
  const opened = await until(page, () => visibleIn(page, '[data-role="cart-drawer"] *'));
  await closeOverlay(page);
  return opened || link ? OK : broken('корзина не открылась');
}

async function checkProfile({ element }: MarkEnv): Promise<Verdict> {
  const href = await attributeOf(element, 'href');
  if (href === undefined) return GONE;
  return href === '/login' || href === '/account' ? OK : broken(`ссылка профиля ведёт на ${href ?? 'пустой адрес'}`);
}

// Каталог: метка → её тест. Порядок — порядок запуска: окна поверх страницы открываются последними, а cart.add — самым
// последним. Шторка «Товар добавлен» открывается по ответу шлюза и закрыла бы собой всё, что проверяется после неё.
const TESTS: ReadonlyArray<readonly [string, (env: MarkEnv) => Promise<Verdict>]> = [
  ['profile', checkProfile],
  ['favorites.toggle', checkHeart],
  ['cart.change', checkWrite(['PATCH', 'DELETE'], 'количество не меняется')],
  ['cart.remove', checkWrite(['DELETE'], 'строка не удаляется')],
  ['search.open', checkSearch],
  ['cart.open', checkCartOpen],
  ['cart.add', checkAdd],
];

// Скрипт страницы: метки в секции (или на всей странице) и упавшие секции. Берётся первая видимая метка каждого имени,
// ей ставится атрибут с именем метки, по нему её находит клик; прошлый выбор снимается. ready: у метки есть товар и она
// не выключена: кнопка «Нет в наличии» и карточка без товара в магазине — не поломка. cart.change — сперва кнопка, что
// оставляет строку (data-quantity не 0, «+»): «−» при одной штуке убирает строку, и cart.remove после него нечего нажать.
const COLLECT_HELPERS = `
  const sectionOf = (node) => node.closest('[data-section-id]')?.getAttribute('data-section-id') ?? null;
  const shown = (node) => node.checkVisibility() && node.getBoundingClientRect().width > 0;
  const needsProduct = (name) => name === 'cart.add' || name === 'favorites.toggle';
  const ready = (name, node) =>
    !node.disabled && node.getAttribute('aria-disabled') !== 'true' &&
    (!needsProduct(name) || (node.getAttribute('data-product-id') ?? '') !== '');
  const keepsLine = (name, node) => name !== 'cart.change' || node.getAttribute('data-quantity') !== '0';
  const nodesOf = (name) => scope.flatMap((root) => [...root.querySelectorAll(
    name === 'profile' ? 'a[data-ref="profile"]' : '[data-action]',
  )]).filter((node) => name === 'profile' || (node.getAttribute('data-action') ?? '').split(/\\s+/)
    .some((part) => part.slice(part.indexOf(':') + 1) === name));
`;

const COLLECT_SCRIPT = (names: readonly string[], chosen: string, section: string | undefined): string => `(() => {
  const names = ${JSON.stringify(names)};
  const id = ${JSON.stringify(section ?? null)};
  const chosen = ${JSON.stringify(chosen)};
  const scope = id === null ? [document.body]
    : [...document.querySelectorAll('[data-section-id]')].filter((node) => node.getAttribute('data-section-id') === id);
  ${COLLECT_HELPERS}
  const marks = names.flatMap((mark) => {
    const nodes = nodesOf(mark);
    if (nodes.length === 0) return [];
    const usable = (one) => shown(one) && ready(mark, one);
    const node = nodes.find((one) => usable(one) && keepsLine(mark, one)) ?? nodes.find(usable) ?? nodes.find(shown);
    if (node === undefined) return [{ mark, shown: false, section: sectionOf(nodes[0]), ready: false }];
    for (const old of document.querySelectorAll('[' + chosen + ']')) {
      if (old.getAttribute(chosen) === mark) old.removeAttribute(chosen);
    }
    node.setAttribute(chosen, mark);
    return [{ mark, shown: true, section: sectionOf(node), ready: ready(mark, node) }];
  });
  const failed = scope.flatMap((root) => [root, ...root.querySelectorAll('[data-merfy-state="failed"]')])
    .filter((node) => node.getAttribute('data-merfy-state') === 'failed')
    .map((node) => node.getAttribute('data-section-id') ?? node.getAttribute('data-section') ?? 'секция');
  return { marks, failed };
})()`;

// Ссылки и формы на время проверки никуда не уводят: страница снимка — одна, переход закрыл бы её посреди проверки.
const STAY_ON_PAGE = `(() => {
  const stay = (event) => {
    if (event.type === 'submit' || event.target.closest?.('a[href]')) event.preventDefault();
  };
  document.addEventListener('click', stay, true);
  document.addEventListener('submit', stay, true);
})()`;

const resultOf = (raw: RawMark, verdict: Verdict): MarkResult => ({
  mark: raw.mark,
  section: raw.section,
  status: verdict.status,
  text: verdict.text,
});

interface MarkRun {
  page: Page;
  writes: string[];
  deadline: number;
  section: string | undefined;
}

type MarkTest = (env: MarkEnv) => Promise<Verdict>;

const collect = async (page: Page, names: readonly string[], section: string | undefined): Promise<RawMarks> =>
  RawMarks.parse(await page.evaluate(COLLECT_SCRIPT(names, CHOSEN, section)));

// Одна попытка: метка ищется заново прямо перед нажатием. Проверка до неё могла перерисовать секцию — cart.change
// перечитывает корзину, и строки рисуются новыми узлами, — тогда найденная заранее кнопка уже не на странице (17.11).
async function attempt(run: MarkRun, first: RawMark, test: MarkTest): Promise<{ raw: RawMark; verdict: Verdict }> {
  const raw = (await collect(run.page, [first.mark], run.section)).marks[0];
  if (raw === undefined) return { raw: first, verdict: GONE };
  if (!raw.shown) return { raw, verdict: hidden('на этом экране метки не видно') };
  if (!raw.ready) return { raw, verdict: hidden('нет товара или кнопка выключена') };
  const element = run.page.locator(`[${CHOSEN}="${raw.mark}"]`).first();
  return { raw, verdict: await test({ page: run.page, writes: run.writes, element }) };
}

// Второй заход нужен двум исходам первого: провалу и метке, пропавшей до нажатия. Красное — только повторённый провал
// (ложный красный хуже его отсутствия): окно, всплывшее по таймеру, закрывает страницу на первом нажатии. А метка
// пропадает, когда её нашли до перерисовки секции: запись cart.change засчитана сразу, а ядро ещё перечитывает корзину
// и рисует строки заново. Перед повтором окна закрываются; срок вышел или метки нет и на повторе — без подтверждения.
const worthRetry = (verdict: Verdict): boolean => verdict.status === 'broken' || verdict === GONE;

async function checkOne(run: MarkRun, found: RawMark, test: MarkTest): Promise<MarkResult> {
  if (!found.shown) return resultOf(found, hidden('на этом экране метки не видно'));
  if (!found.ready) return resultOf(found, hidden('нет товара или кнопка выключена'));
  if (Date.now() >= run.deadline) return resultOf(found, hidden('не успел проверить'));
  const first = await attempt(run, found, test);
  if (!worthRetry(first.verdict)) return resultOf(first.raw, first.verdict);
  const unconfirmed = (why: string): MarkResult =>
    resultOf(first.raw, first.verdict === GONE ? GONE : hidden(`${why}: ${first.verdict.text}`));
  if (Date.now() >= run.deadline) return unconfirmed('не успел подтвердить');
  await closeOverlay(run.page);
  const again = await attempt(run, first.raw, test);
  return again.verdict.status === 'hidden'
    ? unconfirmed('не подтвердилось, метка пропала')
    : resultOf(again.raw, again.verdict);
}

// Причина из журнала ядра: «Сбой секции <имя>#<id> (<стадия>): <текст>» (`instance.ts`). Агенту нужна она, а не факт падения.
function failureText(name: string, errors: readonly string[]): string {
  const line = errors.find((text) => text.startsWith(FAILURE_LOG) && text.includes(name));
  const at = line?.indexOf('): ') ?? -1;
  const cause = line === undefined || at === -1 ? 'её функции не работают' : line.slice(at + 3, at + 3 + MAX_CAUSE);
  return `скрипт секции упал: ${cause}`;
}

// Проверяет метки по порядку каталога за `limitMs`; ошибка одной метки — отказ всей проверки, а не красная метка: что-то
// пошло не так у самой проверки, а не у магазина. `errors` — консоль страницы, из неё причина падения секции.
export async function checkMarks(
  page: Page,
  writes: string[],
  limitMs: number,
  section?: string,
  errors: readonly string[] = [],
): Promise<MarkResult[]> {
  const run: MarkRun = { page, writes, deadline: Date.now() + limitMs, section };
  const names = TESTS.map(([name]) => name);
  await page.evaluate(STAY_ON_PAGE);
  const found = await collect(page, names, section);
  const results: MarkResult[] = found.failed.map((name) => ({
    mark: 'section',
    section: name,
    status: 'broken',
    text: failureText(name, errors),
  }));
  for (const [name, test] of TESTS) {
    const raw = found.marks.find((mark) => mark.mark === name);
    if (raw !== undefined) results.push(await checkOne(run, raw, test));
  }
  return results;
}
