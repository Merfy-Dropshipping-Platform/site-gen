/**
 * @jest-environment jsdom
 *
 * Живые миниатюры «Онлайн-магазина» в кабинете (ревью 28.09): на скриншотах
 * карточки в обоих кадрах была видна плашка согласия на cookie — кадр чужого
 * origin, из кабинета её не спрятать снаружи. Кабинет шлёт агенту
 * `{type:'merfy:thumbnail'}` ПОСЛЕ 'ready' — здесь проверяется ПОВЕДЕНИЕ
 * настоящего агента (тело `PREVIEW_NAV_AGENT_INLINE` исполняется в jsdom, как
 * в соседних `preview-agent-*.spec.ts`), а не текст исходника:
 *  • без сообщения — баннер как был (агент его не трогает);
 *  • сообщение пришло — баннер скрыт (`hidden`), видео на паузе, добавлен
 *    стиль, глушащий CSS-анимации;
 *  • повторное сообщение не плодит второй `<style>`;
 *  • конструктор (не шлёт этот тип) баннер не трогает — покрыто самим фактом
 *    «без сообщения — видна».
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
// jsdom не реализует настоящее воспроизведение видео — .pause() без стаба
// шумит в консоль "Not implemented" (безвредно, но засоряет вывод тестов).
let pauseSpy: jest.SpyInstance;

function bootAgent(): void {
  posted = [];
  // Баннер БЕЗ hidden — так рантайм cookie-consent оставляет его, когда
  // согласия ещё нет (initCookieConsent снимает hidden сам, до прихода
  // сообщения от кабинета). Плюс <video> — проверить паузу.
  document.body.innerHTML =
    '<main><div data-puck-component-id="Hero-1"><h1>Заголовок</h1></div></main>' +
    '<div data-cookie-consent><div data-cookie-consent-card>' +
    "<p><span data-cookie-consent-text>Мы используем cookie</span></p>" +
    '<button type="button" data-cookie-consent-accept>Принять</button>' +
    "</div></div>" +
    '<video data-hero-video></video>';
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
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  jest.restoreAllMocks();
  pauseSpy = jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
}

afterEach(() => {
  for (const [type, fn, opts] of attached.splice(0)) {
    window.removeEventListener(type, fn, opts as boolean);
    document.removeEventListener(type, fn, opts as boolean);
  }
  delete (window as unknown as Record<string, unknown>).__MERFY_COOKIE_BANNER__;
  document.body.innerHTML = "";
  document.head.querySelectorAll("#__merfy_thumbnail_freeze").forEach((el) => el.remove());
  pauseSpy?.mockRestore();
});

const banner = () => document.querySelector<HTMLElement>("[data-cookie-consent]")!;
const video = () => document.querySelector<HTMLVideoElement>("video")!;
const send = (data: Record<string, unknown>) =>
  window.dispatchEvent(new MessageEvent("message", { data }));

describe("агент превью — режим миниатюры (merfy:thumbnail)", () => {
  it("без сообщения — баннер как был, агент его не трогает", () => {
    bootAgent();
    expect(banner().hidden).toBe(false);
  });

  it("merfy:thumbnail — баннер скрыт", () => {
    bootAgent();
    expect(banner().hidden).toBe(false);
    send({ type: "merfy:thumbnail" });
    expect(banner().hidden).toBe(true);
  });

  it("merfy:thumbnail — видео поставлено на паузу", () => {
    bootAgent();
    send({ type: "merfy:thumbnail" });
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy.mock.instances[0]).toBe(video());
  });

  it("merfy:thumbnail — добавляет стиль, глушащий CSS-анимации (один раз)", () => {
    bootAgent();
    send({ type: "merfy:thumbnail" });
    const styles = document.head.querySelectorAll("#__merfy_thumbnail_freeze");
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain("animation-duration:0.001ms");
    // Пауза замораживала появление на нулевой прозрачности (прод 29.09) — её быть не должно.
    expect(styles[0].textContent).not.toContain("animation-play-state:paused");

    // Повторное сообщение не плодит второй <style>.
    send({ type: "merfy:thumbnail" });
    expect(document.head.querySelectorAll("#__merfy_thumbnail_freeze")).toHaveLength(1);
  });

  it("merfy:thumbnail не ломает существующие типы сообщений (set-selection всё ещё работает)", () => {
    bootAgent();
    send({ type: "merfy:thumbnail" });
    send({
      type: "set-selection",
      sectionId: "Hero-1",
      subsectionParentId: null,
      subsectionIndex: null,
    });
    expect(
      document
        .querySelector('[data-puck-component-id="Hero-1"]')!
        .getAttribute("data-puck-section-selected"),
    ).toBe("true");
  });
});
