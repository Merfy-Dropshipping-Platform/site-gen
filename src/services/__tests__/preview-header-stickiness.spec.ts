/**
 * @jest-environment jsdom
 *
 * Баг владельца 25.09: «Статичность → Всегда у секции Шапка не применяется».
 * Воспроизведено в конструкторе (customize.merfy.ru) на bloom и satin: у них
 * по умолчанию «При прокрутке вверх», и скрипт темы (SCROLL_UP_JS в
 * themes/<тема>/Header.astro) при первом рендере вешает слушатель прокрутки.
 * Выбор «Всегда» меняет классы на месте, но слушатель темы жил дальше и на
 * прокрутке вниз ставил шапке translateY(-100%) — она уезжала, как при
 * «прокрутке вверх».
 *
 * Тест поднимает РЕАЛЬНОЕ тело инлайн-агента превью и РЕАЛЬНЫЙ скрипт темы
 * (тем же приёмом, что preview-cart-hot-reload.spec.ts) и проверяет путь
 * мерчанта: «прокрутка вверх» → «Всегда» → прокрутка вниз → шапка на месте.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SERVICES = join(__dirname, "..");
const SRC = readFileSync(join(SERVICES, "preview.service.ts"), "utf8");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

function templateBody(name: string): string {
  const exportMarker = `export const ${name} = \``;
  const marker = SRC.indexOf(exportMarker) >= 0 ? exportMarker : `const ${name} = \``;
  const start = SRC.indexOf(marker);
  if (start < 0) throw new Error(`не нашёл ${name}`);
  const from = start + marker.length;
  const end = SRC.indexOf("\n`;", from);
  return SRC.slice(from, end).replace(/\\\\/g, "\\").replace(/\\`/g, "`");
}

function agentSource(): string {
  return templateBody("PREVIEW_NAV_AGENT_INLINE")
    .replace("${PREVIEW_SELF_SCROLL_SOURCE}", () => templateBody("PREVIEW_SELF_SCROLL_SOURCE"))
    .replace("${PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE}", () =>
      templateBody("PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE"),
    )
    .replace(/\$\{[^}]*\}/g, "''");
}

/** SCROLL_UP_JS темы — массив строк-литералов, склеенный join(""). */
function themeScrollUpScript(theme: string): string {
  const astro = readFileSync(
    join(SERVICES, "..", "..", "themes", theme, "src", "components", "Header.astro"),
    "utf8",
  );
  const from = astro.indexOf("const SCROLL_UP_JS = [");
  const to = astro.indexOf('].join("")', from);
  if (from < 0 || to < 0) throw new Error(`нет SCROLL_UP_JS у ${theme}`);
  return astro
    .slice(from, to)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"'))
    .map((line) => JSON.parse(line.replace(/,$/, "")) as string)
    .join("");
}

const attached: Array<[string, EventListenerOrEventListenerObject]> = [];

function trackListeners(run: () => void): void {
  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => {
    attached.push([type, fn]);
    return realAdd(type, fn as EventListener, opts as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  try {
    run();
  } finally {
    window.addEventListener = realAdd as typeof window.addEventListener;
  }
}

function scrollTo(y: number): void {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event("scroll"));
}

const send = (msg: Record<string, unknown>) => window.dispatchEvent(new MessageEvent("message", { data: msg }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const headerProps = (stickiness: string) => ({ id: "Header-1", stickiness });

function bootScrollUpHeader(theme: string): HTMLElement {
  document.body.innerHTML =
    '<div class="color-scheme-3" style="display:contents">' +
    `<div class="w-full transition-transform duration-300 color-scheme-3 sticky top-0 z-50" ` +
    `data-puck-component-id="Header-1" data-${theme}-sticky="scroll-up"><header>Шапка</header></div>` +
    "</div><main style=\"height:4000px\"></main>";
  Object.defineProperty(window, "parent", { configurable: true, value: { postMessage: () => {} } });
  (globalThis as unknown as { fetch: unknown }).fetch = () => Promise.reject(new Error("без сервера"));
  (window as unknown as Record<string, unknown>).__MERFY_LOCAL_PATCH_ENABLED = true;
  scrollTo(0);
  trackListeners(() => {
    // eslint-disable-next-line no-new-func
    new Function(themeScrollUpScript(theme))();
    // eslint-disable-next-line no-new-func
    new Function(agentSource())();
  });
  return document.querySelector('[data-puck-component-id="Header-1"]') as HTMLElement;
}

afterEach(() => {
  while (attached.length) {
    const entry = attached.pop();
    if (entry) window.removeEventListener(entry[0], entry[1]);
  }
  delete (window as unknown as Record<string, unknown>).__merfyScrollUp;
  document.body.innerHTML = "";
});

describe.each(THEMES)("%s: «Статичность» меняется в превью без перезагрузки", (theme) => {
  it("исходная «При прокрутке вверх» прячет шапку при прокрутке вниз (скрипт темы жив)", () => {
    const header = bootScrollUpHeader(theme);
    scrollTo(900);
    expect(header.style.transform).toBe("translateY(-100%)");
  });

  it("после «Всегда» шапка не уезжает при прокрутке вниз", async () => {
    const header = bootScrollUpHeader(theme);
    send({ type: "init", themeId: theme, siteId: "site-1", data: { content: [{ type: "Header", props: headerProps("scroll-up") }] } });
    await tick();
    send({ type: "update-block", blockId: "Header-1", blockType: "Header", props: headerProps("always") });
    await tick();
    await tick();

    scrollTo(900);
    scrollTo(1800);

    expect(header.style.transform).toBe("");
    expect(header.classList.contains("sticky")).toBe(true);
    expect(header.classList.contains("transition-transform")).toBe(false);
    expect(header.getAttribute(`data-${theme}-sticky`)).toBe("always");
  });

  it("возврат на «При прокрутке вверх» снова прячет шапку", async () => {
    const header = bootScrollUpHeader(theme);
    send({ type: "init", themeId: theme, siteId: "site-1", data: { content: [{ type: "Header", props: headerProps("scroll-up") }] } });
    await tick();
    send({ type: "update-block", blockId: "Header-1", blockType: "Header", props: headerProps("always") });
    await tick();
    send({ type: "update-block", blockId: "Header-1", blockType: "Header", props: headerProps("scroll-up") });
    await tick();
    await tick();

    scrollTo(900);
    expect(header.style.transform).toBe("translateY(-100%)");
    scrollTo(300);
    expect(header.style.transform).toBe("");
  });

  it("«Никогда» снимает прилипание и не прячет шапку", async () => {
    const header = bootScrollUpHeader(theme);
    send({ type: "init", themeId: theme, siteId: "site-1", data: { content: [{ type: "Header", props: headerProps("scroll-up") }] } });
    await tick();
    send({ type: "update-block", blockId: "Header-1", blockType: "Header", props: headerProps("none") });
    await tick();
    await tick();

    scrollTo(900);
    expect(header.style.transform).toBe("");
    expect(header.classList.contains("sticky")).toBe(false);
    expect(header.style.position).toBe("");
  });
});
