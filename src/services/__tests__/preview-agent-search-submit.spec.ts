/**
 * @jest-environment jsdom
 *
 * «Найти» в превью конструктора: форма поиска в шапке (`form[role="search"]`)
 * обязана переключать страницу превью на каталог с запросом — так же, как
 * ссылки уже переключают страницу через `navigate`. Остальные формы (подписка,
 * заявка) по-прежнему блокируются: в песочнице превью им нечего отправлять.
 *
 * Тело инлайн-агента (`PREVIEW_NAV_AGENT_INLINE`) поднимается в jsdom и
 * выполняется взаправду — проверяется поведение, а не текст исходника, тем же
 * приёмом, что `preview-agent-init-handshake.spec.ts`.
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
  return SRC.slice(from, end)
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`")
    .replace(/\$\{[^}]*\}/g, "''");
}

let posted: Array<Record<string, unknown>>;

/** Ставит разметку формы, шлёт submit и возвращает последнее сообщение агента. */
function submitForm(formHtml: string): Record<string, unknown> | undefined {
  document.body.innerHTML = formHtml;
  const form = document.querySelector("form") as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  return posted[posted.length - 1];
}

beforeAll(() => {
  // Реальные таймеры оставили бы включённым повтор 'ready' (см.
  // preview-agent-init-handshake.spec.ts) — здесь он не нужен и не должен
  // засорять posted между проверками.
  jest.useFakeTimers();
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: {
      postMessage: (msg: Record<string, unknown>) => posted.push(msg),
    },
  });

  // Тело агента — исходник этого же сервиса, не строка из внешнего ввода.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(agentSource())();
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  posted = [];
  document.body.innerHTML = "";
});

describe("превью: сабмит формы поиска ведёт в каталог", () => {
  it("форма поиска с запросом → navigate с закодированным q", () => {
    const msg = submitForm(
      '<form role="search" action="/catalog"><input name="q" value="рамка" /></form>',
    );
    expect(msg).toEqual({
      type: "navigate",
      path: "/catalog?q=%D1%80%D0%B0%D0%BC%D0%BA%D0%B0",
    });
  });

  it("форма поиска без запроса → navigate без query-строки", () => {
    const msg = submitForm(
      '<form role="search" action="/catalog"><input name="q" value="" /></form>',
    );
    expect(msg).toEqual({ type: "navigate", path: "/catalog" });
  });

  it("любая другая форма по-прежнему блокируется", () => {
    const msg = submitForm(
      '<form id="newsletter"><input name="email" /></form>',
    );
    expect(msg).toEqual({ type: "form-submit-blocked", formId: "newsletter" });
  });
});
