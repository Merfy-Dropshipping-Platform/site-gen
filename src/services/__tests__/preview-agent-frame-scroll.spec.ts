import {
  PREVIEW_SELF_SCROLL_SOURCE,
  PreviewService,
  type ComponentResolver,
  type ContainerFactory,
  type IAstroContainer,
} from "../preview.service";

/**
 * Жалоба тестировщика 2026-09-13: «при нажатии на Подвал появляется белая
 * полоса, которая сопровождается по всему магазину».
 *
 * Замер в Chromium (customize.merfy.ru, vanilla, сайт 76ae9332):
 *   до клика  — канвас конструктора `.bg-white.shadow-lg` scrollTop 0,  iframe top  89
 *   после     —                                          scrollTop 321, iframe top -232
 * Прокрутка ВНУТРИ кадра при этом не менялась (scrollY 4637 до и после).
 *
 * Причина — `scrollIntoView` в агенте превью. По спецификации он прокручивает
 * всю цепочку scroll-контейнеров, включая документ конструктора за границей
 * кадра. Коробка канваса — 845px в высоту при потомке 1166px (`transform:
 * scale` не ужимает layout-бокс), то есть невидимый запас прокрутки ровно
 * 1166 − 845 = 321px и собственный белый фон. Подвал — последняя секция:
 * внутренний документ уже в самом низу, остаток добирался прокруткой предка,
 * коробку уводило до упора, снизу открывался её фон. scrollTop сам не
 * возвращается — полоса жила на всех страницах превью до перезагрузки.
 *
 * Сторожим ДВА факта:
 *   1) агент превью не зовёт `scrollIntoView` (и значит физически не может
 *      достать до документа конструктора) — по всем пяти темам;
 *   2) замена `scrollSelfTo` доскроллит кадр туда же, куда доскроллил бы
 *      `scrollIntoView`, и не трогает ничего, кроме собственного окна.
 *
 * Исполняется РОВНО тот текст функции, который уходит в кадр
 * (`PREVIEW_SELF_SCROLL_SOURCE` подставляется в агента интерполяцией), —
 * копия разъехалась бы с оригиналом молча.
 */

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

function buildStubService(): PreviewService {
  const container: IAstroContainer = {
    async renderToString(component, opts) {
      const id = String(opts?.props?.id ?? "");
      const tag = (component as { __block?: string }).__block ?? "Unknown";
      return `<section data-puck-component-id="${id}" data-stub="${tag}"></section>`;
    },
  };
  const factory: ContainerFactory = async () => container;
  const resolver: ComponentResolver = async (blockName) => ({
    __block: blockName,
  });
  return new PreviewService(factory, resolver);
}

// ---------------------------------------------------------------------------
// Песочница: минимальное окно/документ, в котором исполняется текст функции.
// ---------------------------------------------------------------------------

interface Rect {
  top: number;
  height: number;
}

interface Sandbox {
  scrollCalls: Array<{ top: number; behavior?: string }>;
  escapes: string[];
  run: (rect: Rect, mode: "start" | "center") => void;
}

function makeSandbox(opts: {
  scrollY: number;
  innerHeight: number;
  docHeight: number;
}): Sandbox {
  const scrollCalls: Array<{ top: number; behavior?: string }> = [];
  const escapes: string[] = [];

  const win: Record<string, unknown> = {
    pageYOffset: opts.scrollY,
    pageXOffset: 0,
    innerHeight: opts.innerHeight,
    scrollTo: (a: unknown, b?: unknown) => {
      if (a && typeof a === "object") {
        const o = a as { top?: number; behavior?: string };
        scrollCalls.push({ top: Number(o.top), behavior: o.behavior });
      } else {
        scrollCalls.push({ top: Number(b) });
      }
    },
    // Любое обращение к родителю = выход за границу кадра.
    get parent() {
      escapes.push("window.parent");
      return undefined;
    },
    get top() {
      escapes.push("window.top");
      return undefined;
    },
    get frameElement() {
      escapes.push("window.frameElement");
      return undefined;
    },
  };

  const doc = {
    documentElement: { scrollTop: opts.scrollY, scrollHeight: opts.docHeight },
    body: { scrollHeight: opts.docHeight },
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    "window",
    "document",
    `${PREVIEW_SELF_SCROLL_SOURCE}\nreturn scrollSelfTo;`,
  ) as (w: unknown, d: unknown) => (el: unknown, mode: string) => void;

  const scrollSelfTo = factory(win, doc);

  return {
    scrollCalls,
    escapes,
    run: (rect, mode) => {
      const el = {
        getBoundingClientRect: () => ({
          top: rect.top,
          bottom: rect.top + rect.height,
          height: rect.height,
          left: 0,
          right: 0,
          width: 0,
        }),
        // Запрещённый путь: он и уводил канвас конструктора.
        scrollIntoView: () => {
          escapes.push("element.scrollIntoView");
        },
        // Прокрутка предков «руками» — та же дыра другим способом.
        get parentElement() {
          escapes.push("element.parentElement");
          return undefined;
        },
        get offsetParent() {
          escapes.push("element.offsetParent");
          return undefined;
        },
      };
      scrollSelfTo(el, mode);
    },
  };
}

describe("агент превью не прокручивает документ конструктора (белая полоса у «Подвала»)", () => {
  it.each(THEMES)("агент темы %s не зовёт scrollIntoView", async (themeId) => {
    const svc = buildStubService();
    const html = await svc.renderPreviewPage({
      themeId,
      blocks: [{ type: "Hero", props: { id: `hero-${themeId}` } }],
      tokensCss: "",
      fontHead: "",
    });

    // Ровно тот путь, который уводил канвас: доступ к предкам за границей кадра.
    expect(html).not.toMatch(/scrollIntoView\s*\(/);
    // И при этом доскролл к выбранной секции не выброшен, а заменён.
    expect(html).toContain("scrollSelfTo(sectionEl, 'start')");
    expect(html).toContain("scrollSelfTo(subEl, 'center')");
  });

  it("в блоб-путь (injectNavAgent) уходит тот же безопасный агент", () => {
    const svc = buildStubService();
    const html = svc.injectNavAgent("<html><body><main></main></body></html>");
    expect(html).not.toMatch(/scrollIntoView\s*\(/);
    expect(html).toContain("function scrollSelfTo(el, mode)");
  });

  describe("scrollSelfTo", () => {
    it("ставит верх секции к верху кадра и не выходит за пределы кадра", () => {
      const box = makeSandbox({
        scrollY: 1000,
        innerHeight: 800,
        docHeight: 5000,
      });
      // Секция на 300px ниже верха кадра → абсолютный верх 1300.
      box.run({ top: 300, height: 450 }, "start");

      expect(box.scrollCalls).toEqual([{ top: 1300, behavior: "smooth" }]);
      expect(box.escapes).toEqual([]);
    });

    it("центрирует подсекцию", () => {
      const box = makeSandbox({
        scrollY: 0,
        innerHeight: 800,
        docHeight: 5000,
      });
      // Элемент высотой 200 на отметке 1000 → центр кадра: 1000 − (800−200)/2.
      box.run({ top: 1000, height: 200 }, "center");

      expect(box.scrollCalls).toEqual([{ top: 700, behavior: "smooth" }]);
      expect(box.escapes).toEqual([]);
    });

    it("ПОДВАЛ: остаток не добирается прокруткой предка, а упирается в низ кадра", () => {
      // Геометрия замера: документ 5803, кадр 1166, прокрутка уже в самом низу
      // (5803 − 1166 = 4637), подвал начинается на 713-м пикселе кадра.
      // `scrollIntoView` здесь добирал недостающие 713px предком и уводил
      // канвас конструктора на его максимум (321px) — это и была белая полоса.
      const box = makeSandbox({
        scrollY: 4637,
        innerHeight: 1166,
        docHeight: 5803,
      });
      box.run({ top: 713, height: 450 }, "start");

      expect(box.scrollCalls).toEqual([{ top: 4637, behavior: "smooth" }]);
      expect(box.escapes).toEqual([]);
    });

    it("не уводит кадр выше нуля", () => {
      const box = makeSandbox({
        scrollY: 0,
        innerHeight: 800,
        docHeight: 5000,
      });
      box.run({ top: 0, height: 900 }, "center");

      expect(box.scrollCalls).toEqual([{ top: 0, behavior: "smooth" }]);
      expect(box.escapes).toEqual([]);
    });

    it("без элемента не прокручивает ничего", () => {
      const box = makeSandbox({
        scrollY: 100,
        innerHeight: 800,
        docHeight: 5000,
      });
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const factory = new Function(
        "window",
        "document",
        `${PREVIEW_SELF_SCROLL_SOURCE}\nreturn scrollSelfTo;`,
      ) as (w: unknown, d: unknown) => (el: unknown, mode: string) => void;
      expect(() => factory({}, {})(null, "start")).not.toThrow();
      expect(box.scrollCalls).toEqual([]);
    });
  });
});
