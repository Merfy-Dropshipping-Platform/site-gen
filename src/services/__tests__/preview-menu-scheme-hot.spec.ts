/**
 * @jest-environment jsdom
 *
 * «Цветовая схема меню» в превью должна применяться сразу — и к инлайн-меню, и
 * к панели бокового меню.
 *
 * Предыстория. 21.09 класс схемы меню завели на КОРЕНЬ шторки во всех пяти
 * темах (пункт 24 документа владельца «баги шапки и меню»): до этого панель
 * оставалась белой. На витрине это заработало, а в превью — нет: точечная
 * правка (`LOCAL_PATCH_REGISTRY.Header.menuColorScheme`) перекрашивала только
 * `[data-nav-inline]`. Замер в этом же харнессе до правки:
 *
 *   инлайн-навигация: flex color-scheme-1   ← поехала
 *   шторка:           color-scheme-3 …      ← осталась на старой схеме
 *
 * То есть мерчант менял схему меню, открывал шторку и видел прежние цвета до
 * ручной перезагрузки — ровно класс жалоб «применяется только после
 * перезагрузки».
 *
 * Тест поднимает РЕАЛЬНОЕ тело инлайн-агента превью (`PREVIEW_NAV_AGENT_INLINE`)
 * в jsdom — тем же приёмом, что `preview-cart-hot-reload.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "preview.service.ts"), "utf8");

function templateBody(name: string): string {
  const marker = `const ${name} = \``;
  const exportMarker = `export const ${name} = \``;
  const start = SRC.indexOf(exportMarker) >= 0 ? SRC.indexOf(exportMarker) : SRC.indexOf(marker);
  const usedMarker = SRC.indexOf(exportMarker) >= 0 ? exportMarker : marker;
  if (start < 0) throw new Error(`не нашёл ${name}`);
  const from = start + usedMarker.length;
  const end = SRC.indexOf("\n`;", from);
  if (end < 0) throw new Error(`не нашёл конец шаблона ${name}`);
  return SRC.slice(from, end)
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`");
}

/** Тот же приём распаковки шаблона агента, что в preview-agent-block-not-found.spec.ts. */
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
  send: (msg: Record<string, unknown>) => void;
};

const attached: Array<[string, EventListenerOrEventListenerObject]> = [];

function bootAgent(): Ctx {
  const fetches: string[] = [];
  const errors: unknown[][] = [];

  // Ровно та разметка, что реально отдаёт /preview для page-cart у bloom
  // (проверено curl'ом на живом сайте 17.09): CartBody внутри scheme-обёртки
  // v2-page-composer, схема 3 — и на самой секции, и на обёртке (сервер их
  // синхронизирует при первичном рендере).
  document.body.innerHTML =
    '<main>' +
    '<div class="color-scheme-2" data-block-scheme="2" data-header-wrapper>' +
    '<div data-puck-component-id="Header-1">' +
    '<header><button id="rose-burger-btn" data-burger-toggle aria-controls="rose-burger"></button>' +
    '<nav data-nav-inline class="flex color-scheme-3"><a href="/catalog">Каталог</a></nav></header>' +
    '<div id="rose-burger" class="color-scheme-3 fixed hidden"><nav><a href="/catalog">Каталог</a></nav></div>' +
    '</div></div>' +
    '</main>';

  (globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
    fetches.push(String(url));
    return Promise.reject(new Error("update-block НЕ обязан идти на сервер для Cart colorScheme (spec 110 — local patch)"));
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

  // Ключевое отличие от preview-agent-block-not-found.spec.ts: local-patch
  // ВКЛЮЧЁН — именно эта ветка обрабатывает colorScheme у Cart (spec 110).
  (window as unknown as Record<string, unknown>).__MERFY_LOCAL_PATCH_ENABLED = true;

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

const INIT = {
  type: "init",
  themeId: "rose",
  siteId: "site-1",
  data: {
    content: [
      { type: "Header", props: { id: "Header-1", menuColorScheme: "scheme-3" } },
    ],
  },
};

async function changeMenuScheme(next: string) {
  const ctx = bootAgent();
  ctx.send(INIT);
  await tick();
  ctx.send({
    type: "update-block",
    blockId: "Header-1",
    blockType: "Header",
    props: { id: "Header-1", menuColorScheme: next },
  });
  await tick();
  await tick();
  return ctx;
}

describe("превью: «Цветовая схема меню» применяется без перезагрузки", () => {
  it("инлайн-навигация перекрашивается", async () => {
    await changeMenuScheme("scheme-1");
    const nav = document.querySelector("[data-nav-inline]");
    expect(nav?.className).toContain("color-scheme-1");
    expect(nav?.className).not.toContain("color-scheme-3");
  });

  it("панель бокового меню перекрашивается вместе с ней", async () => {
    await changeMenuScheme("scheme-1");
    const drawer = document.getElementById("rose-burger");
    expect(drawer?.className).toContain("color-scheme-1");
    expect(drawer?.className).not.toContain("color-scheme-3");
  });

  it("кнопка бургера остаётся нетронутой", async () => {
    // Суффикс `-burger` не должен цеплять `…-burger-btn`: это кнопка в шапке,
    // она красится схемой СЕКЦИИ, а не схемой меню.
    await changeMenuScheme("scheme-1");
    const btn = document.getElementById("rose-burger-btn");
    expect(btn?.className ?? "").not.toContain("color-scheme-1");
  });

  it("правка не ходит на сервер — перерисовки шапки не происходит", async () => {
    const ctx = await changeMenuScheme("scheme-1");
    expect(ctx.fetches.filter((u) => u.includes("/preview/block"))).toHaveLength(0);
    expect(ctx.errors).toHaveLength(0);
  });

  it("снятие схемы меню убирает класс с обоих мест", async () => {
    await changeMenuScheme("");
    const nav = document.querySelector("[data-nav-inline]");
    const drawer = document.getElementById("rose-burger");
    expect(nav?.className).not.toMatch(/color-scheme-\d/);
    expect(drawer?.className).not.toMatch(/color-scheme-\d/);
  });
});
