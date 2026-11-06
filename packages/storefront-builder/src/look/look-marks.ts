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
export function itemReply(body: unknown, added: number): unknown {
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

// Запись в корзину снимка: ответ здесь, в `writes` — что ядро отправило. Чтение идёт своим путём (`look-page.ts`).
export async function answerCartWrite(route: Route, writes: string[]): Promise<boolean> {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const method = request.method();
  if (method === 'GET' || !CART_WRITE_PATH.test(path)) return false;
  if (method === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: WRITE_CORS });
    return true;
  }
  writes.push(`${method} ${path}`);
  const reply = replyOf(method, path, request.postDataJSON(), writes);
  await route.fulfill({
    status: reply.status,
    headers: WRITE_CORS,
    contentType: 'application/json',
    body: JSON.stringify(reply.body),
  });
  return true;
}

const RawMark = z.object({
  mark: z.string(),
  index: z.number().nullable(),
  section: z.string().nullable(),
  ready: z.boolean(),
});
const RawMarks = z.object({ marks: z.array(RawMark), failed: z.array(z.string()) });
type RawMark = z.infer<typeof RawMark>;

interface MarkEnv {
  page: Page;
  writes: string[];
  element: Locator;
}

type Verdict = { status: MarkStatus; text: string };

const OK: Verdict = { status: 'ok', text: '' };
const broken = (text: string): Verdict => ({ status: 'broken', text });

async function until(page: Page, done: () => Promise<boolean> | boolean): Promise<boolean> {
  const deadline = Date.now() + EFFECT_MS;
  for (;;) {
    if (await done()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(POLL_MS);
  }
}

// Настоящий клик; метку закрыло окно поверх страницы — событие напрямую: проверяется связь метки с ядром, а вёрстку
// смотрят проверки снимка.
async function press(element: Locator): Promise<void> {
  await element.click({ timeout: CLICK_MS }).catch(() => element.dispatchEvent('click'));
}

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
  await press(element);
  const added = await until(page, () => writes.slice(sent).some((write) => write.includes('/items')));
  if (!added) return broken('кнопка не положила товар: запроса в корзину не было');
  const moved = await countMoved(page, 'cart-count', before);
  return moved ? OK : broken('товар добавлен, а счётчик корзины не изменился');
}

async function checkHeart({ page, element }: MarkEnv): Promise<Verdict> {
  const before = await element.getAttribute('aria-pressed');
  const count = await textOf(page, 'favorites-count');
  await press(element);
  const marked = await until(page, async () => (await element.getAttribute('aria-pressed')) !== before);
  if (!marked) return broken('сердечко не отмечается: aria-pressed не изменился');
  const moved = await countMoved(page, 'favorites-count', count);
  await press(element);
  return moved ? OK : broken('сердечко отмечено, а счётчик избранного не изменился');
}

const checkWrite =
  (method: string, what: string) =>
  async ({ page, writes, element }: MarkEnv): Promise<Verdict> => {
    const sent = writes.length;
    await press(element);
    const done = await until(page, () => writes.slice(sent).some((write) => write.startsWith(method)));
    return done ? OK : broken(`${what}: запроса в корзину не было`);
  };

const isLink = (element: Locator): Promise<boolean> => element.evaluate((node) => node.closest('a[href]') !== null);

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
  await press(element);
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
  await press(element);
  const opened = await until(page, () => visibleIn(page, '[data-role="cart-drawer"] *'));
  await closeOverlay(page);
  return opened || link ? OK : broken('корзина не открылась');
}

async function checkProfile({ element }: MarkEnv): Promise<Verdict> {
  const href = await element.getAttribute('href');
  return href === '/login' || href === '/account' ? OK : broken(`ссылка профиля ведёт на ${href ?? 'пустой адрес'}`);
}

// Каталог: метка → её тест. Порядок — порядок запуска: окна поверх страницы открываются последними, а cart.add — самым
// последним. Шторка «Товар добавлен» открывается по ответу шлюза и закрыла бы собой всё, что проверяется после неё.
const TESTS: ReadonlyArray<readonly [string, (env: MarkEnv) => Promise<Verdict>]> = [
  ['profile', checkProfile],
  ['favorites.toggle', checkHeart],
  ['cart.change', checkWrite('PATCH', 'количество не меняется')],
  ['cart.remove', checkWrite('DELETE', 'строка не удаляется')],
  ['search.open', checkSearch],
  ['cart.open', checkCartOpen],
  ['cart.add', checkAdd],
];

// Скрипт страницы: метки в секции (или на всей странице) и упавшие секции. Берётся первая видимая метка каждого имени,
// ей ставится атрибут, по нему её находит клик. ready: у метки есть товар и она не выключена: кнопка «Нет в наличии» и
// карточка без товара в магазине — не поломка.
const COLLECT_SCRIPT = (names: readonly string[], chosen: string, section: string | undefined): string => `(() => {
  const names = ${JSON.stringify(names)};
  const id = ${JSON.stringify(section ?? null)};
  const scope = id === null ? [document.body]
    : [...document.querySelectorAll('[data-section-id]')].filter((node) => node.getAttribute('data-section-id') === id);
  const sectionOf = (node) => node.closest('[data-section-id]')?.getAttribute('data-section-id') ?? null;
  const shown = (node) => node.checkVisibility() && node.getBoundingClientRect().width > 0;
  const needsProduct = (name) => name === 'cart.add' || name === 'favorites.toggle';
  const ready = (name, node) =>
    !node.disabled && node.getAttribute('aria-disabled') !== 'true' &&
    (!needsProduct(name) || (node.getAttribute('data-product-id') ?? '') !== '');
  const nodesOf = (name) => scope.flatMap((root) => [...root.querySelectorAll(
    name === 'profile' ? 'a[data-ref="profile"]' : '[data-action]',
  )]).filter((node) => name === 'profile' || (node.getAttribute('data-action') ?? '').split(/\\s+/)
    .some((part) => part.slice(part.indexOf(':') + 1) === name));
  const marks = names.flatMap((mark, index) => {
    const nodes = nodesOf(mark);
    if (nodes.length === 0) return [];
    const node = nodes.find((one) => shown(one) && ready(mark, one)) ?? nodes.find(shown);
    if (node === undefined) return [{ mark, index: null, section: sectionOf(nodes[0]), ready: false }];
    node.setAttribute(${JSON.stringify(chosen)}, String(index));
    return [{ mark, index, section: sectionOf(node), ready: ready(mark, node) }];
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
}

// Красное — только повторённый провал (ложный красный хуже его отсутствия): окно, всплывшее по таймеру, закрывает
// страницу на первом нажатии. Перед повтором окна закрываются; срок вышел — первый провал остаётся без подтверждения.
async function confirmed(run: MarkRun, env: MarkEnv, test: (env: MarkEnv) => Promise<Verdict>): Promise<Verdict> {
  const first = await test(env);
  if (first.status !== 'broken') return first;
  if (Date.now() >= run.deadline) return { status: 'hidden', text: `не успел подтвердить: ${first.text}` };
  await closeOverlay(run.page);
  return test(env);
}

async function checkOne(run: MarkRun, raw: RawMark, test: (env: MarkEnv) => Promise<Verdict>): Promise<MarkResult> {
  if (raw.index === null) return resultOf(raw, { status: 'hidden', text: 'на этом экране метки не видно' });
  if (!raw.ready) return resultOf(raw, { status: 'hidden', text: 'нет товара или кнопка выключена' });
  if (Date.now() >= run.deadline) return resultOf(raw, { status: 'hidden', text: 'не успел проверить' });
  const element = run.page.locator(`[${CHOSEN}="${raw.index}"]`).first();
  return resultOf(raw, await confirmed(run, { page: run.page, writes: run.writes, element }, test));
}

// Проверяет метки по порядку каталога за `limitMs`; ошибка одной метки — отказ всей проверки, а не красная метка: что-то
// пошло не так у самой проверки, а не у магазина.
export async function checkMarks(
  page: Page,
  writes: string[],
  limitMs: number,
  section?: string,
): Promise<MarkResult[]> {
  const run: MarkRun = { page, writes, deadline: Date.now() + limitMs };
  const names = TESTS.map(([name]) => name);
  await page.evaluate(STAY_ON_PAGE);
  const found = RawMarks.parse(await page.evaluate(COLLECT_SCRIPT(names, CHOSEN, section)));
  const results: MarkResult[] = found.failed.map((name) => ({
    mark: 'section',
    section: name,
    status: 'broken',
    text: 'скрипт секции упал: её функции не работают',
  }));
  for (const [name, test] of TESTS) {
    const raw = found.marks.find((mark) => mark.mark === name);
    if (raw !== undefined) results.push(await checkOne(run, raw, test));
  }
  return results;
}
