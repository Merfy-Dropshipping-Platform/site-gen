/**
 * @jest-environment jsdom
 *
 * Баннер cookie в превью конструктора (владелец 28.09: «При нажатии на баннер
 * открывается правый сайдбар»). Проверяется ПОВЕДЕНИЕ настоящего агента —
 * тело `PREVIEW_NAV_AGENT_INLINE` исполняется в jsdom:
 *  • нажатие по баннеру (текст или кнопка) → родителю `select-cookie-banner`,
 *    дальше нажатие не идёт (баннер в превью не отвечают, а настраивают);
 *  • родитель выделил баннер (`set-selection` c `cookieBanner`) → рамка
 *    выделения на баннере; выделили секцию — рамка с баннера снята;
 *  • `update-tokens` кладёт настройки баннера в глобал рантайма и шлёт
 *    событие — тексты меняются без перезагрузки превью.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE,
  PREVIEW_SELF_SCROLL_SOURCE,
} from "../preview.service";

const SRC = readFileSync(join(__dirname, "..", "preview.service.ts"), "utf8");

function agentSource(): string {
  const marker = "const PREVIEW_NAV_AGENT_INLINE = `";
  const from = SRC.indexOf(marker) + marker.length;
  const end = SRC.indexOf("\n`;", from);
  // Вклеенные исходники помощников — настоящими строками (выделение зовёт
  // доскролл), прочие подстановки агенту здесь не нужны.
  const inserts: Record<string, string> = {
    "${PREVIEW_SELF_SCROLL_SOURCE}": PREVIEW_SELF_SCROLL_SOURCE,
    "${PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE}": PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE,
  };
  const body = SRC.slice(from, end)
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`");
  return body.replace(/\$\{[^}]*\}/g, (m) => inserts[m] ?? "''");
}

const attached: Array<[string, EventListenerOrEventListenerObject, unknown]> = [];
let posted: Array<Record<string, unknown>> = [];

function bootAgent(): void {
  posted = [];
  document.body.innerHTML =
    '<main><div data-puck-component-id="Hero-1"><h1>Заголовок</h1></div></main>' +
    '<div data-cookie-consent><div data-cookie-consent-card>' +
    "<p><span data-cookie-consent-text>Мы используем cookie</span></p>" +
    '<button type="button" data-cookie-consent-accept>Принять</button>' +
    "</div></div>";
  (globalThis as unknown as { fetch: unknown }).fetch = (() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve("") })) as unknown;
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: { postMessage: (msg: Record<string, unknown>) => posted.push(msg) },
  });
  for (const target of [window, document] as EventTarget[]) {
    const realAdd = target.addEventListener.bind(target);
    jest.spyOn(target, "addEventListener").mockImplementation((type, fn, opts) => {
      attached.push([type, fn!, opts]);
      realAdd(type, fn, opts);
    });
  }
  // eslint-disable-next-line no-new-func
  new Function(agentSource())();
  // Доскролл к выделенной секции jsdom не умеет.
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  jest.restoreAllMocks();
}

afterEach(() => {
  for (const [type, fn, opts] of attached.splice(0)) {
    window.removeEventListener(type, fn, opts as boolean);
    document.removeEventListener(type, fn, opts as boolean);
  }
  delete (window as unknown as Record<string, unknown>).__MERFY_COOKIE_BANNER__;
  document.body.innerHTML = "";
});

const banner = () => document.querySelector<HTMLElement>("[data-cookie-consent]")!;
const send = (data: Record<string, unknown>) =>
  window.dispatchEvent(new MessageEvent("message", { data }));

describe("агент превью — баннер cookie", () => {
  it.each([
    ["текст", "[data-cookie-consent-text]"],
    ["кнопка «Принять»", "[data-cookie-consent-accept]"],
  ])("нажатие на %s → select-cookie-banner, дальше не идёт", (_what, selector) => {
    bootAgent();
    const pageHandler = jest.fn();
    document.body.addEventListener("click", pageHandler);
    const el = document.querySelector<HTMLElement>(selector)!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    expect(posted).toContainEqual({ type: "select-cookie-banner" });
    expect(posted.some((m) => m.type === "select-block")).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(pageHandler).not.toHaveBeenCalled();
    document.body.removeEventListener("click", pageHandler);
  });

  it("set-selection c cookieBanner → рамка на баннере; выбрали секцию → снята", () => {
    bootAgent();
    send({ type: "set-selection", sectionId: null, subsectionParentId: null, subsectionIndex: null, cookieBanner: true });
    expect(banner().getAttribute("data-puck-section-selected")).toBe("true");
    send({ type: "set-selection", sectionId: "Hero-1", subsectionParentId: null, subsectionIndex: null });
    expect(banner().hasAttribute("data-puck-section-selected")).toBe(false);
  });

  it("update-tokens → настройки баннера в глобале и событие перерисовки", () => {
    bootAgent();
    const redraw = jest.fn();
    document.addEventListener("merfy:cookie-banner", redraw);
    send({ type: "update-tokens", themeSettings: { cookieBanner: { heading: "Куки" } } });
    expect(
      (window as unknown as Record<string, unknown>).__MERFY_COOKIE_BANNER__,
    ).toEqual({ heading: "Куки" });
    expect(redraw).toHaveBeenCalledTimes(1);
    send({ type: "update-tokens", themeSettings: {} });
    expect(
      (window as unknown as Record<string, unknown>).__MERFY_COOKIE_BANNER__,
    ).toBeNull();
    document.removeEventListener("merfy:cookie-banner", redraw);
  });
});
