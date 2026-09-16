/**
 * @jest-environment jsdom
 *
 * Владелец 16.09 (уже ПОСЛЕ починки гонки рукопожатия, коммит 4ec8545c):
 * «Баг все темы — при изменениях в секция или параметрах всех секциях и всех
 * параметров, требуется перезагрузка страницы» на служебных страницах
 * (Корзина, Личный кабинет, Заказы, Вход, Страницы, Избранное, Оформление
 * заказа).
 *
 * Корневая причина (см. `src/utils/__tests__/revision-migrations-system-pages-stable-ids.test.ts`):
 * `migrateRevisionData` досеивала тело этих страниц `Date.now()`-id на КАЖДОМ
 * чтении ревизии, не персистя результат. Конструктор грузит данные редактора
 * и iframe грузит `/preview` ДВУМЯ независимыми HTTP-запросами — на каждом id
 * получался свой. Правка уходила с blockId, которого в ЖИВОМ DOM не было:
 * сервер валидно рендерил блок (isValidBlockHtml проходил — ответ содержит
 * запрошенный blockId), но `document.querySelector('[data-puck-component-id=
 * "<blockId>"]')` в текущей странице ничего не находил, и обработчик молча
 * выходил — `if (!el) return;` без единой строки в консоли. Владелец не мог
 * отличить «баг снова тут» от «ничего не происходит по другой причине».
 *
 * Этот тест проверяет ПОВЕДЕНИЕ настоящего агента (тело берётся из
 * `PREVIEW_NAV_AGENT_INLINE` и выполняется в jsdom), а не текст исходника —
 * тем же приёмом, что `preview-agent-init-handshake.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "preview.service.ts"), "utf8");

/** Достаёт тело шаблонной строки `const <name> = \`...\`;` по имени константы. */
function templateBody(name: string): string {
  const marker = `const ${name} = \``;
  const exportMarker = `export const ${name} = \``;
  const start = SRC.indexOf(exportMarker) >= 0 ? SRC.indexOf(exportMarker) : SRC.indexOf(marker);
  const usedMarker = SRC.indexOf(exportMarker) >= 0 ? exportMarker : marker;
  if (start < 0) throw new Error(`не нашёл ${name}`);
  const from = start + usedMarker.length;
  const end = SRC.indexOf("\n`;", from);
  if (end < 0) throw new Error(`не нашёл конец шаблона ${name}`);
  // Та же расшифровка escape-последовательностей, что и для внешнего шаблона
  // ниже — иначе `\\d+` (экранированный бэкслеш в .ts-исходнике) попадёт в
  // итоговый скрипт буквально, вместо `\d+`, которым он становится после
  // РЕАЛЬНОГО вычисления шаблонной строки рантаймом.
  return SRC.slice(from, end)
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`");
}

/**
 * Тело инлайн-агента — ровно то, что уезжает в браузер. Update-block
 * безусловно зовёт `applyCheckoutColumnScheme`/`applyCheckoutTermsScheme` для
 * ЛЮБОГО блока (не только чекаута — внутри они сами решают, применимы ли),
 * поэтому эти два инжекта (обычно `${...}` внутри шаблона) подставляем ИХ
 * РЕАЛЬНЫМ телом, а не пустой строкой — иначе вызов падает как
 * "not a function", промис уходит в .catch, и DOM никогда не обновляется
 * (ложный провал теста, не имеющий отношения к b45-багу). Остальные `${...}`
 * (напр. `CHROME_REORDER_INLINE`, DOMContentLoaded-only) update-block не
 * трогает — их по-прежнему безопасно занулять, как в
 * `preview-agent-init-handshake.spec.ts`.
 */
function agentSource(): string {
  const marker = "const PREVIEW_NAV_AGENT_INLINE = `";
  const start = SRC.indexOf(marker);
  if (start < 0) throw new Error("не нашёл PREVIEW_NAV_AGENT_INLINE");
  const from = start + marker.length;
  const end = SRC.indexOf("\n`;", from);
  if (end < 0) throw new Error("не нашёл конец шаблона агента");
  const scrollSource = templateBody("PREVIEW_SELF_SCROLL_SOURCE");
  const checkoutSchemeSource = templateBody("PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE");
  return SRC.slice(from, end)
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`")
    .replace("${PREVIEW_SELF_SCROLL_SOURCE}", () => scrollSource)
    .replace("${PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE}", () => checkoutSchemeSource)
    .replace(/\$\{[^}]*\}/g, "''");
}

type Ctx = {
  fetches: string[];
  errors: unknown[][];
  posted: Array<Record<string, unknown>>;
  send: (msg: Record<string, unknown>) => void;
};

const attached: Array<[string, EventListenerOrEventListenerObject]> = [];

/**
 * Поднимает агент в jsdom. `domHasMatchingNode=false` воспроизводит реальный
 * баг: сервер отдаёт валидный HTML для запрошенного blockId (проходит
 * isValidBlockHtml), но в текущем документе узла с таким id нет — ровно то,
 * что давал рассинхрон двух независимых read-time миграций.
 */
function bootAgent(opts: { domHasMatchingNode: boolean }): Ctx {
  const fetches: string[] = [];
  const errors: unknown[][] = [];

  document.body.innerHTML = opts.domHasMatchingNode
    ? '<section data-puck-component-id="AccountSection-1"><h1>Старое</h1></section>'
    : '<section data-puck-component-id="AccountSection-stale-id"><h1>Старое</h1></section>';

  (globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
    fetches.push(String(url));
    // Сервер валиден: возвращает HTML именно с запрошенным blockId — ветка
    // isValidBlockHtml проходит. Баг не в ответе сервера, а в том, что этого
    // id нет в ЖИВОМ document (см. domHasMatchingNode).
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () =>
        Promise.resolve(
          '<section data-puck-component-id="AccountSection-1">новое</section>',
        ),
    });
  }) as unknown as typeof fetch;

  Object.defineProperty(window, "parent", {
    configurable: true,
    value: { postMessage: () => {} },
  });

  const realError = console.error;
  console.error = ((...args: unknown[]) => {
    errors.push(args);
  }) as typeof console.error;
  (globalThis as unknown as { __restoreConsoleError: () => void }).__restoreConsoleError = () => {
    console.error = realError;
  };

  (window as unknown as Record<string, unknown>).__MERFY_LOCAL_PATCH_ENABLED = false;

  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts2?: unknown) => {
    attached.push([type, fn]);
    return realAdd(type, fn as EventListener, opts2 as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  try {
    // eslint-disable-next-line no-new-func
    new Function(agentSource())();
  } finally {
    window.addEventListener = realAdd as typeof window.addEventListener;
  }

  return {
    fetches,
    errors,
    posted: [],
    send: (msg) => window.dispatchEvent(new MessageEvent("message", { data: msg })),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  (globalThis as unknown as { __restoreConsoleError?: () => void }).__restoreConsoleError?.();
  while (attached.length) {
    const entry = attached.pop();
    if (entry) window.removeEventListener(entry[0], entry[1]);
  }
  document.body.innerHTML = "";
});

const INIT = { type: "init", themeId: "rose", siteId: "site-1", data: { content: [] } };
const EDIT = {
  type: "update-block",
  blockId: "AccountSection-1",
  blockType: "AccountSection",
  props: { id: "AccountSection-1", padding: { top: 5, bottom: 5 } },
};

describe("превью: узел не найден в DOM (blockId разошёлся)", () => {
  it("узел есть в DOM → запрос уходит, DOM обновляется, консоль молчит", async () => {
    const ctx = bootAgent({ domHasMatchingNode: true });
    ctx.send(INIT);
    await tick();
    ctx.send(EDIT);
    await tick();
    await tick();

    expect(ctx.fetches.filter((u) => u.includes("/preview/block"))).toHaveLength(1);
    expect(document.querySelector('[data-puck-component-id="AccountSection-1"]')?.textContent).toBe(
      "новое",
    );
    expect(ctx.errors).toHaveLength(0);
  });

  it("узла в DOM нет → запрос всё равно уходит (сервер валиден), но правка не применяется И это видно в консоли", async () => {
    const ctx = bootAgent({ domHasMatchingNode: false });
    ctx.send(INIT);
    await tick();
    ctx.send(EDIT);
    await tick();
    await tick();

    // Запрос ушёл — сервер честно отработал по blockId/blockType.
    expect(ctx.fetches.filter((u) => u.includes("/preview/block"))).toHaveLength(1);
    // DOM НЕ поменялся — старый узел (с другим id) остался как был.
    expect(document.querySelector('[data-puck-component-id="AccountSection-stale-id"]')?.textContent).toBe(
      "Старое",
    );
    // Раньше здесь падал молчаливый `if (!el) return;` — 0 сообщений в
    // консоли, владелец полдня искал баг без единой зацепки. Теперь —
    // обязана быть запись с blockId И blockType.
    expect(ctx.errors.length).toBeGreaterThan(0);
    const joined = ctx.errors.map((a) => a.join(" ")).join("\n");
    expect(joined).toContain("AccountSection-1");
    expect(joined).toContain("AccountSection");
    expect(joined.toLowerCase()).toMatch(/not found|не найден/);
  });
});
