/**
 * @jest-environment jsdom
 *
 * Рукопожатие превью: правка, сделанная до прихода 'init', не теряется.
 *
 * Жалоба владельца 2026-09-16, дословно: «все темы… при изменениях в секция или
 * параметрах на всех страницах, всех секциях и всех параметров, требуется
 * перезагрузка страницы для их применения», и следом — «И в Rose так же».
 *
 * Механика бага. Агент внутри iframe ОДИН раз шлёт родителю 'ready'; родитель
 * (constructor/src/components/editor/PreviewFrame.tsx) отвечает 'init' с темой
 * и сайтом, и вешает свой слушатель в useEffect. Если iframe поднялся из кеша и
 * выстрелил 'ready' раньше, чем родитель начал слушать, 'init' не приходит
 * НИКОГДА. А в обработчике 'update-block' стояло `if (!currentThemeId) return`
 * — каждая последующая правка отбрасывалась молча: ни записи в консоль, ни
 * запроса к /preview/block. Перезагрузка страницы переигрывала гонку, и всё
 * начинало работать — отсюда «требуется перезагрузка».
 *
 * Здесь проверяется ПОВЕДЕНИЕ настоящего агента, а не текст исходника: тело
 * достаётся из `PREVIEW_NAV_AGENT_INLINE` и выполняется в jsdom.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "preview.service.ts"), "utf8");

/** Тело инлайн-агента — ровно то, что уезжает в браузер. */
function agentSource(): string {
  const marker = "const PREVIEW_NAV_AGENT_INLINE = `";
  const start = SRC.indexOf(marker);
  if (start < 0) throw new Error("не нашёл PREVIEW_NAV_AGENT_INLINE");
  const from = start + marker.length;
  const end = SRC.indexOf("\n`;", from);
  if (end < 0) throw new Error("не нашёл конец шаблона агента");
  // Шаблонная строка: удвоенный слэш в исходнике = одинарный в браузере.
  // Подстановки вида ${...} сервер вычисляет при вклейке; для проверки
  // рукопожатия их значения не нужны — заменяем пустой строкой, иначе тело
  // не разберётся как JavaScript.
  return SRC.slice(from, end)
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`")
    .replace(/\$\{[^}]*\}/g, "''");
}

type Ctx = {
  fetches: string[];
  posted: Array<Record<string, unknown>>;
  send: (msg: Record<string, unknown>) => void;
};

/**
 * jsdom даёт один общий `window` на весь файл, а агент вешает свои слушатели
 * на него. Без уборки второй поднятый агент слышал бы сообщения первого, и
 * счёт запросов врал бы (замер: 6 вместо 1). Запоминаем всё, что агент
 * навесил, и снимаем после каждого теста.
 */
const attached: Array<[string, EventListenerOrEventListenerObject]> = [];

/** Поднимает агент в jsdom со всем, что он трогает, и возвращает крючки. */
function bootAgent(): Ctx {
  const fetches: string[] = [];
  const posted: Array<Record<string, unknown>> = [];

  document.body.innerHTML =
    '<div data-puck-component-id="Hero-1"><h1>Заголовок</h1></div>';

  (globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
    fetches.push(String(url));
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<div data-puck-component-id="Hero-1">новое</div>'),
    });
  }) as unknown as typeof fetch;

  // Агент шлёт наружу через parent.postMessage — родителя подменяем.
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: {
      postMessage: (msg: Record<string, unknown>) => {
        posted.push(msg);
      },
    },
  });

  // Локальные патчи выключены: нас интересует именно доезд до сервера.
  (window as unknown as Record<string, unknown>).__MERFY_LOCAL_PATCH_ENABLED = false;

  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => {
    attached.push([type, fn]);
    return realAdd(type, fn as EventListener, opts as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  try {
    // eslint-disable-next-line no-new-func
    new Function(agentSource())();
  } finally {
    window.addEventListener = realAdd as typeof window.addEventListener;
  }

  return {
    fetches,
    posted,
    send: (msg) => window.dispatchEvent(new MessageEvent("message", { data: msg })),
  };
}

const INIT = {
  type: "init",
  themeId: "rose",
  siteId: "site-1",
  data: { content: [{ type: "Hero", props: { id: "Hero-1", heading: "старый" } }] },
};
const EDIT = {
  type: "update-block",
  blockId: "Hero-1",
  blockType: "Hero",
  props: { id: "Hero-1", heading: "новый" },
};

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  jest.useRealTimers();
  while (attached.length) {
    const entry = attached.pop();
    if (entry) window.removeEventListener(entry[0], entry[1]);
  }
  document.body.innerHTML = "";
});

describe("превью: правка до 'init' не теряется", () => {
  it("агент сообщает о готовности сразу", () => {
    const ctx = bootAgent();
    expect(ctx.posted.some((m) => m.type === "ready")).toBe(true);
  });

  it("правка, пришедшая ДО 'init', уходит на сервер после него", async () => {
    const ctx = bootAgent();
    ctx.send(EDIT);
    await tick();
    // До рукопожатия слать некуда — запроса быть не должно.
    expect(ctx.fetches).toHaveLength(0);

    ctx.send(INIT);
    await tick();
    await tick();
    // А вот теперь отложенная правка обязана доехать сама, без перезагрузки.
    expect(ctx.fetches.filter((u) => u.includes("/preview/block"))).toHaveLength(1);
  });

  it("на блок хранится только последняя правка, очередь не растёт", async () => {
    const ctx = bootAgent();
    ctx.send({ ...EDIT, props: { id: "Hero-1", heading: "первый" } });
    ctx.send({ ...EDIT, props: { id: "Hero-1", heading: "второй" } });
    ctx.send({ ...EDIT, props: { id: "Hero-1", heading: "третий" } });
    await tick();
    ctx.send(INIT);
    await tick();
    await tick();
    expect(ctx.fetches.filter((u) => u.includes("/preview/block"))).toHaveLength(1);
  });

  it("'ready' повторяется, пока родитель молчит", () => {
    jest.useFakeTimers();
    const ctx = bootAgent();
    const before = ctx.posted.filter((m) => m.type === "ready").length;
    jest.advanceTimersByTime(1000);
    const after = ctx.posted.filter((m) => m.type === "ready").length;
    expect(after).toBeGreaterThan(before);
  });

  it("после 'init' повторы прекращаются", () => {
    jest.useFakeTimers();
    const ctx = bootAgent();
    ctx.send(INIT);
    const afterInit = ctx.posted.filter((m) => m.type === "ready").length;
    jest.advanceTimersByTime(5000);
    expect(ctx.posted.filter((m) => m.type === "ready").length).toBe(afterInit);
  });

  it("обычная правка ПОСЛЕ 'init' работает как раньше", async () => {
    const ctx = bootAgent();
    ctx.send(INIT);
    await tick();
    ctx.send(EDIT);
    await tick();
    expect(ctx.fetches.filter((u) => u.includes("/preview/block"))).toHaveLength(1);
  });
});
