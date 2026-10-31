/**
 * @jest-environment jsdom
 *
 * Выделение секций и подсекций в превью конструктора (жалоба владельца:
 * «при выбранной секции она никак не выделяется, также плохо работает
 * выделение прочих более мелких элементов»). Проверяется ПОВЕДЕНИЕ настоящего
 * агента — тело `PREVIEW_NAV_AGENT_INLINE` исполняется в jsdom:
 *  • наведение подсвечивает ОДНУ подсекцию под курсором, а не все параметры
 *    секции сразу;
 *  • рамки — отдельные слои `.__merfy_hl` по координатам узла (их не
 *    перекрывают дочерние слои с z-index и absolute);
 *  • выбор переживает горячую замену разметки секции (update-block);
 *  • клики по подсекции по-прежнему уходят в конструктор.
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

type Box = { top: number; left: number; width: number; height: number };

/** jsdom не раскладывает страницу — координаты задаём руками. */
function setBox(el: Element, box: Box): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
      toJSON: () => ({}),
    }) as DOMRect;
}

const SECTION_HTML = (extra = "") =>
  '<section data-puck-component-id="Hero-1">' +
  '<h1 data-puck-subsection-parent="Hero-1" data-puck-subsection-index="100" data-puck-subsection-field="heading">Заголовок</h1>' +
  '<p data-puck-subsection-parent="Hero-1" data-puck-subsection-index="101" data-puck-subsection-field="text">Текст</p>' +
  extra +
  "</section>";

function bootAgent(): void {
  posted = [];
  document.body.innerHTML = "<main>" + SECTION_HTML() + "</main>";
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
}

afterEach(() => {
  for (const [type, fn, opts] of attached.splice(0)) {
    window.removeEventListener(type, fn, opts as boolean);
    document.removeEventListener(type, fn, opts as boolean);
  }
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((s) => s.remove());
});

const section = () => document.querySelector<HTMLElement>("[data-puck-component-id]")!;
const h1 = () => document.querySelector<HTMLElement>("h1")!;
const para = () => document.querySelector<HTMLElement>("p")!;
const layer = (kind: string) =>
  document.querySelector<HTMLElement>(`.__merfy_hl[data-kind="${kind}"]`)!;
const send = (data: Record<string, unknown>) =>
  window.dispatchEvent(new MessageEvent("message", { data }));
const hover = (el: Element) =>
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

const SEC_BOX: Box = { top: 100, left: 0, width: 1280, height: 600 };
const H1_BOX: Box = { top: 200, left: 100, width: 400, height: 40 };
const P_BOX: Box = { top: 260, left: 100, width: 400, height: 20 };

function layout(): void {
  setBox(section(), SEC_BOX);
  setBox(h1(), H1_BOX);
  setBox(para(), P_BOX);
}

describe("агент превью — рамки выделения", () => {
  it("слои рамок созданы, лежат у body и не принимают мышь", () => {
    bootAgent();
    for (const kind of ["section-hover", "section-selected", "sub-hover", "sub-selected"]) {
      expect(layer(kind)).not.toBeNull();
      expect(layer(kind).parentElement).toBe(document.body);
    }
    const css = document.getElementById("__merfy_preview_overlay_styles")!.textContent!;
    expect(css).toContain("pointer-events:none");
    expect(css).toContain("z-index:2147483000");
    expect(css).toContain("#71C0FF");
  });

  it("наведение подсвечивает одну подсекцию под курсором, а не все сразу", () => {
    bootAgent();
    layout();
    hover(h1());
    expect(h1().getAttribute("data-puck-subsection-hover")).toBe("true");
    expect(para().hasAttribute("data-puck-subsection-hover")).toBe(false);
    const sub = layer("sub-hover");
    expect(sub.dataset.visible).toBe("true");
    // Рамка подсекции выходит наружу на 2px, чтобы не закрывать сам параметр.
    expect(sub.style.top).toBe("198px");
    expect(sub.style.left).toBe("98px");
    expect(sub.style.width).toBe("404px");
    expect(sub.style.height).toBe("44px");
    expect(layer("section-hover").dataset.visible).toBe("true");

    // Курсор перешёл на соседний параметр — рамка переехала, старая снята.
    hover(para());
    expect(h1().hasAttribute("data-puck-subsection-hover")).toBe(false);
    expect(para().getAttribute("data-puck-subsection-hover")).toBe("true");
    expect(layer("sub-hover").style.top).toBe("258px");
  });

  it("курсор над секцией вне подсекций: рамка секции есть, рамки подсекции нет", () => {
    bootAgent();
    layout();
    const filler = document.createElement("div");
    section().appendChild(filler);
    hover(filler);
    expect(layer("section-hover").dataset.visible).toBe("true");
    expect(layer("sub-hover").dataset.visible).toBe("false");
    expect(document.querySelector("[data-puck-subsection-hover]")).toBeNull();
  });

  it("выбранная секция получает рамку по своим границам", () => {
    bootAgent();
    layout();
    send({ type: "set-selection", sectionId: "Hero-1", subsectionParentId: null, subsectionIndex: null });
    const sel = layer("section-selected");
    expect(sel.dataset.visible).toBe("true");
    expect(sel.style.top).toBe("100px");
    expect(sel.style.width).toBe("1280px");
    expect(sel.style.height).toBe("600px");
    expect(section().getAttribute("data-puck-section-selected")).toBe("true");
  });

  it("выбранная подсекция видна отдельно от секции; у выбранной нет рамки наведения", () => {
    bootAgent();
    layout();
    send({ type: "set-selection", sectionId: "Hero-1", subsectionParentId: "Hero-1", subsectionIndex: 100 });
    expect(layer("section-selected").dataset.visible).toBe("true");
    expect(layer("sub-selected").dataset.visible).toBe("true");
    expect(layer("sub-selected").style.top).toBe("198px");
    hover(h1());
    expect(layer("sub-hover").dataset.visible).toBe("false");
    hover(para());
    expect(layer("sub-hover").dataset.visible).toBe("true");
  });

  // 31.10, dev: у выбранного «Заголовка» (Hero, индекс 100) рамка 2px пропадала. Причина на стороне
  // конструктора: доскролл к секции (CustomOutline.scrollToComponent) слал set-selection с подсекцией
  // null через DEBOUNCE после выбора строки в дереве. Агент выполняет такое сообщение как «подсекции
  // нет» — это его контракт. Тесты фиксируют обе стороны: рамка постоянна, пока выбор не сменился,
  // а сообщение без подсекции её честно снимает (поэтому конструктор обязан слать текущую).
  describe("рамка выбранной подсекции постоянна", () => {
    const selectHeading = () =>
      send({ type: "set-selection", sectionId: "Hero-1", sectionType: "Hero", subsectionParentId: "Hero-1", subsectionIndex: 100, cookieBanner: false });

    it("держится при наведении на соседей, уходе курсора, скролле и повторных сообщениях", () => {
      bootAgent();
      layout();
      selectHeading();
      expect(layer("sub-selected").dataset.visible).toBe("true");

      hover(para());
      hover(section());
      document.dispatchEvent(new MouseEvent("mouseleave"));
      window.dispatchEvent(new Event("resize"));
      send({ type: "set-labels" });
      expect(layer("sub-selected").dataset.visible).toBe("true");

      // Доскролл конструктора с тем же выбором (scrollSelectionMessage) — рамка на месте.
      selectHeading();
      expect(layer("sub-selected").dataset.visible).toBe("true");
      expect(layer("sub-selected").style.top).toBe("198px");
      expect(h1().getAttribute("data-puck-subsection-selected")).toBe("true");
    });

    it("клик по h1 в превью: рамка появляется после ответа конструктора и остаётся под курсором", () => {
      bootAgent();
      layout();
      h1().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(posted).toContainEqual({ type: "select-subsection", parentId: "Hero-1", index: 100, field: "heading" });
      selectHeading(); // ответ конструктора на select-subsection
      hover(h1()); // курсор остался над h1
      expect(layer("sub-selected").dataset.visible).toBe("true");
      expect(layer("sub-hover").dataset.visible).toBe("false");
    });

    it("сообщение без подсекции (старый доскролл конструктора) снимает рамку — контракт агента", () => {
      bootAgent();
      layout();
      selectHeading();
      send({ type: "set-selection", sectionId: "Hero-1", sectionType: "Hero", subsectionParentId: null, subsectionIndex: null });
      expect(layer("sub-selected").dataset.visible).toBe("false");
      expect(layer("section-selected").dataset.visible).toBe("true");
    });
  });

  it("смена выбора снимает прежние рамки", () => {
    bootAgent();
    layout();
    send({ type: "set-selection", sectionId: "Hero-1", subsectionParentId: "Hero-1", subsectionIndex: 100 });
    send({ type: "set-selection", sectionId: null, subsectionParentId: null, subsectionIndex: null });
    expect(layer("section-selected").dataset.visible).toBe("false");
    expect(layer("sub-selected").dataset.visible).toBe("false");
  });

  it("выбор переживает горячую замену разметки секции", () => {
    bootAgent();
    layout();
    send({ type: "set-selection", sectionId: "Hero-1", subsectionParentId: "Hero-1", subsectionIndex: 101 });
    // update-block кладёт свежую разметку: атрибутов выбора в ней нет.
    document.querySelector("main")!.innerHTML = SECTION_HTML();
    expect(section().hasAttribute("data-puck-section-selected")).toBe(false);
    setBox(section(), { top: 50, left: 0, width: 1280, height: 300 });
    setBox(para(), { top: 120, left: 100, width: 400, height: 20 });
    send({ type: "set-labels" });
    expect(section().getAttribute("data-puck-section-selected")).toBe("true");
    expect(para().getAttribute("data-puck-subsection-selected")).toBe("true");
    expect(layer("section-selected").style.top).toBe("50px");
    expect(layer("sub-selected").style.top).toBe("118px");
  });

  it("узел без размеров (display:none, display:contents) рамки не получает", () => {
    bootAgent();
    send({ type: "set-selection", sectionId: "Hero-1", subsectionParentId: null, subsectionIndex: null });
    expect(layer("section-selected").dataset.visible).toBe("false");
  });

  it("агент не трогает раскладку темы: position подсекций не меняется", () => {
    bootAgent();
    layout();
    hover(h1());
    send({ type: "set-selection", sectionId: "Hero-1", subsectionParentId: "Hero-1", subsectionIndex: 100 });
    expect(h1().style.position).toBe("");
    expect(section().style.position).toBe("");
  });

  it("клик по подсекции по-прежнему уходит в конструктор как select-subsection", () => {
    bootAgent();
    layout();
    h1().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(posted).toContainEqual({
      type: "select-subsection",
      parentId: "Hero-1",
      index: 100,
      field: "heading",
    });
  });
});
