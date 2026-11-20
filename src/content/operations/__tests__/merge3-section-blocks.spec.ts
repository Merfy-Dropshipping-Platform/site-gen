/**
 * Блоки экземпляра секции новой темы (`sections.<страница>[].blocks`) —
 * список по `id`, а не одно значение: правки соседних блоков одной секции не
 * спорят о массиве целиком (shape.ts, `SECTIONS`).
 */
import { apply, diff, merge3, readAt } from "..";

type Doc = Record<string, any>;

const block = (id: string, settings: Doc = {}): Doc => ({
  id,
  type: "shop:heading",
  settings,
});

const instance = (id: string, blocks?: Doc[]): Doc => ({
  id,
  section: "shop:hero",
  settings: {},
  ...(blocks === undefined ? {} : { blocks }),
});

function shop(blocks: Doc[]): Doc {
  return {
    currentPageId: "home",
    pages: [{ id: "home", name: "Главная", slug: "/" }],
    pagesData: { home: { content: [], root: { props: {} }, zones: {} } },
    sections: { home: [instance("hero-x", blocks)] },
  };
}

const BLOCKS = "sections/home/hero-x/blocks";

const blocksOf = (doc: Doc | null): Doc[] =>
  doc?.sections?.home?.[0]?.blocks ?? [];

const blockIds = (doc: Doc | null): string[] =>
  blocksOf(doc).map((item) => item.id);

const settingsOf = (doc: Doc | null, id: string): Doc =>
  blocksOf(doc).find((item) => item.id === id)?.settings;

const base = () =>
  shop([
    block("heading-1", { heading: "Один", text: "Текст 1" }),
    block("heading-2", { heading: "Два", text: "Текст 2" }),
  ]);

describe("merge3 keep-current: блоки одной секции", () => {
  it("(1) мерчант правит блок A, агент — блок B: легли обе правки", () => {
    const current = base();
    current.sections.home[0].blocks[0].settings.heading = "Мерчант";
    const incoming = base();
    incoming.sections.home[0].blocks[1].settings.heading = "Агент";
    const r = merge3(base(), current, incoming, "keep-current");
    expect(r.conflicts).toEqual([]);
    expect(settingsOf(r.merged, "heading-1").heading).toBe("Мерчант");
    expect(settingsOf(r.merged, "heading-2").heading).toBe("Агент");
  });

  it("(2) один блок, одно поле: остаётся мерчант, конфликт по адресу поля, остальное агента легло", () => {
    const current = base();
    current.sections.home[0].blocks[0].settings.heading = "Мерчант";
    const incoming = base();
    incoming.sections.home[0].blocks[0].settings.heading = "Агент";
    incoming.sections.home[0].blocks[1].settings.heading = "Агент-2";
    const r = merge3(base(), current, incoming, "keep-current");
    expect(r.overwritten).toEqual([]);
    expect(r.conflicts).toEqual([
      {
        path: `${BLOCKS}/heading-1/settings/heading`,
        current: "Мерчант",
        incoming: "Агент",
      },
    ]);
    expect(settingsOf(r.merged, "heading-1").heading).toBe("Мерчант");
    expect(settingsOf(r.merged, "heading-2").heading).toBe("Агент-2");
  });

  it("(3) один блок, разные поля: легли обе правки", () => {
    const current = base();
    current.sections.home[0].blocks[0].settings.heading = "Мерчант";
    const incoming = base();
    incoming.sections.home[0].blocks[0].settings.text = "Агент";
    const r = merge3(base(), current, incoming, "keep-current");
    expect(r.conflicts).toEqual([]);
    expect(settingsOf(r.merged, "heading-1")).toEqual({
      heading: "Мерчант",
      text: "Агент",
    });
  });

  it("(4) мерчант добавил блок, агент правит другой: оба на месте, порядок цел", () => {
    const current = base();
    current.sections.home[0].blocks.push(
      block("heading-3", { heading: "Три" }),
    );
    const incoming = base();
    incoming.sections.home[0].blocks[0].settings.heading = "Агент";
    const r = merge3(base(), current, incoming, "keep-current");
    expect(r.conflicts).toEqual([]);
    expect(blockIds(r.merged)).toEqual(["heading-1", "heading-2", "heading-3"]);
    expect(settingsOf(r.merged, "heading-1").heading).toBe("Агент");
  });

  it("(5) мерчант удалил блок B, агент правит блок B: удаление остаётся, конфликт в отчёте", () => {
    const current = shop([base().sections.home[0].blocks[0]]);
    const incoming = base();
    incoming.sections.home[0].blocks[1].settings.heading = "Агент";
    const r = merge3(base(), current, incoming, "keep-current");
    expect(blockIds(r.merged)).toEqual(["heading-1"]);
    expect(r.conflicts).toEqual([
      {
        path: `${BLOCKS}/heading-2`,
        current: null,
        incoming: expect.objectContaining({ id: "heading-2" }),
      },
    ]);
  });

  it("(6) одна сторона переставила блоки, другая правит поле: легли обе", () => {
    const reordered = shop([...base().sections.home[0].blocks].reverse());
    const edited = base();
    edited.sections.home[0].blocks[0].settings.heading = "Агент";

    const agentEdits = merge3(base(), reordered, edited, "keep-current");
    expect(agentEdits.conflicts).toEqual([]);
    expect(blockIds(agentEdits.merged)).toEqual(["heading-2", "heading-1"]);
    expect(settingsOf(agentEdits.merged, "heading-1").heading).toBe("Агент");

    const agentReorders = merge3(base(), edited, reordered, "keep-current");
    expect(agentReorders.conflicts).toEqual([]);
    expect(blockIds(agentReorders.merged)).toEqual(["heading-2", "heading-1"]);
    expect(settingsOf(agentReorders.merged, "heading-1").heading).toBe("Агент");
  });

  it("(7) блоки без годных id остаются одним значением: прежнее поведение", () => {
    const noIds = (heading: string) =>
      shop([{ type: "shop:heading", settings: { heading } }]);
    const dupIds = (heading: string) =>
      shop([block("same", { heading }), block("same", { heading: "Два" })]);
    for (const make of [noIds, dupIds]) {
      const r = merge3(
        make("Было"),
        make("Мерчант"),
        make("Агент"),
        "keep-current",
      );
      expect(r.conflicts.map((c) => c.path)).toEqual([BLOCKS]);
      expect(blocksOf(r.merged)[0].settings.heading).toBe("Мерчант");
    }
    const a = noIds("Было");
    const b = noIds("Стало");
    expect(diff(a, b)).toEqual([
      { op: "set", path: BLOCKS, value: b.sections.home[0].blocks },
    ]);
  });
});

describe("merge3 last-writer-wins: блоки одной секции", () => {
  it("(8) соседние блоки: оба на месте, overwritten пуст", () => {
    const current = base();
    current.sections.home[0].blocks[0].settings.heading = "Другая вкладка";
    const incoming = base();
    incoming.sections.home[0].blocks[1].settings.heading = "Конструктор";
    const r = merge3(base(), current, incoming, "last-writer-wins");
    expect(r.overwritten).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(settingsOf(r.merged, "heading-1").heading).toBe("Другая вкладка");
    expect(settingsOf(r.merged, "heading-2").heading).toBe("Конструктор");
  });

  it("один блок, одно поле: побеждает входящая, чужое — в overwritten", () => {
    const current = base();
    current.sections.home[0].blocks[0].settings.heading = "Другая вкладка";
    const incoming = base();
    incoming.sections.home[0].blocks[0].settings.heading = "Конструктор";
    const r = merge3(base(), current, incoming, "last-writer-wins");
    expect(r.overwritten.map((item) => item.path)).toEqual([
      `${BLOCKS}/heading-1/settings/heading`,
    ]);
    expect(settingsOf(r.merged, "heading-1").heading).toBe("Конструктор");
  });
});

describe("адреса блоков", () => {
  it("правка поля, добавление, удаление и порядок — по id блока; apply(a, diff(a, b)) равен b", () => {
    const a = base();
    const b = shop([
      block("heading-3", { heading: "Три" }),
      { ...a.sections.home[0].blocks[0], settings: { heading: "Новый" } },
    ]);
    const ops = diff(a, b);
    expect(ops.map((op) => `${op.op} ${op.path}`)).toEqual([
      `remove ${BLOCKS}/heading-2`,
      `add ${BLOCKS}/heading-3`,
      `set ${BLOCKS}/heading-1/settings/heading`,
      `remove ${BLOCKS}/heading-1/settings/text`,
    ]);
    expect(apply(a, ops)).toEqual(b);
    expect(readAt(a, `${BLOCKS}/heading-2/settings/heading`)).toBe("Два");
    expect(readAt(a, `${BLOCKS}/order`)).toEqual(["heading-1", "heading-2"]);
  });

  it("перестановка блоков — одна операция порядка", () => {
    const a = base();
    const b = shop([...a.sections.home[0].blocks].reverse());
    expect(diff(a, b)).toEqual([
      { op: "order", path: `${BLOCKS}/order`, ids: ["heading-2", "heading-1"] },
    ]);
    expect(apply(a, diff(a, b))).toEqual(b);
  });

  it("блок с id «order»: адрес экранирован и не путается с порядком", () => {
    const a = shop([block("order", { heading: "Был" }), block("heading-2")]);
    const b = shop([block("order", { heading: "Стал" }), block("heading-2")]);
    const ops = diff(a, b);
    expect(ops).toEqual([
      {
        op: "set",
        path: `${BLOCKS}/~3order/settings/heading`,
        value: "Стал",
      },
    ]);
    expect(apply(a, ops)).toEqual(b);
    expect(readAt(a, `${BLOCKS}/order`)).toEqual(["order", "heading-2"]);

    const current = shop([
      block("order", { heading: "Мерчант" }),
      block("heading-2"),
    ]);
    const incoming = shop([
      block("order", { heading: "Был" }),
      block("heading-2", { heading: "Агент" }),
    ]);
    const r = merge3(a, current, incoming, "keep-current");
    expect(r.conflicts).toEqual([]);
    expect(settingsOf(r.merged, "order").heading).toBe("Мерчант");
    expect(settingsOf(r.merged, "heading-2").heading).toBe("Агент");
  });

  it("у экземпляра нет blocks, у стороны появились: одно значение, как раньше", () => {
    const a = shop([]);
    delete a.sections.home[0].blocks;
    const b = base();
    expect(diff(a, b)).toEqual([
      { op: "set", path: BLOCKS, value: b.sections.home[0].blocks },
    ]);
    expect(apply(a, diff(a, b))).toEqual(b);
  });
});
