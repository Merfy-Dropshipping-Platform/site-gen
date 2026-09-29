/**
 * Автозначения панели в слиянии (дополнение главного агента к этапу 2).
 *
 * Конструктор при правке одного поля секции пишет в блок
 * `{...defaultProps, ...existingProps, [field]: value}` (CustomFieldsPanel
 * `updateProp`), то есть вписывает значения по умолчанию панели в ключи,
 * которых в секции не было. Такие операции — не правка мерчанта.
 *
 * Сценарий-ловушка: ключа нет в базе; другая вкладка (или агент) поставила в
 * current не-дефолтное значение; устаревшая вкладка правит соседнее поле той
 * же секции и вписывает дефолт этого ключа. Без правила last-writer-wins молча
 * затёр бы чужую правку дефолтом. С правилом (`isAuto`) чужое выживает.
 */
import { merge3, readAt } from "..";
import type { Op } from "..";

type Doc = Record<string, any>;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const DEFAULT_ALIGN = "center";

function base(): Doc {
  return {
    pages: [{ id: "home", name: "Главная", slug: "/" }],
    pagesData: {
      home: {
        content: [
          { type: "Hero", props: { id: "Hero-1", heading: { text: "Было" } } },
        ],
        root: { props: {} },
        zones: {},
      },
    },
  };
}

function hero(d: Doc): Doc {
  return d.pagesData.home.content[0].props;
}

/** Правило для теста: ключ `alignment` появился со значением по умолчанию панели. */
const isAuto = (op: Op, b: Doc): boolean =>
  op.op === "set" &&
  op.path === "page:home/block:Hero-1/props/alignment" &&
  readAt(b, op.path) === undefined &&
  op.value === DEFAULT_ALIGN;

describe("merge3: автозначение панели не спорит и не затирает чужую правку", () => {
  function scenario() {
    const b = base();
    const current = clone(b);
    hero(current).alignment = "left"; // чужая настоящая правка
    const incoming = clone(b);
    hero(incoming).heading.text = "Моё"; // правка соседнего поля…
    hero(incoming).alignment = DEFAULT_ALIGN; // …и вписанный конструктором дефолт
    return { b, current, incoming };
  }

  it("last-writer-wins: чужое alignment выжило, моя правка заголовка на месте, overwritten пуст", () => {
    const { b, current, incoming } = scenario();
    const r = merge3(b, current, incoming, "last-writer-wins", { isAuto });
    expect(hero(r.merged as Doc).alignment).toBe("left");
    expect(hero(r.merged as Doc).heading.text).toBe("Моё");
    expect(r.overwritten).toEqual([]);
    expect(r.applied.map((op) => op.path)).toEqual([
      "page:home/block:Hero-1/props/heading/text",
    ]);
  });

  it("reject-conflicts: автозначение — не конфликт", () => {
    const { b, current, incoming } = scenario();
    const r = merge3(b, current, incoming, "reject-conflicts", { isAuto });
    expect(r.conflicts).toEqual([]);
    expect(hero(r.merged as Doc).alignment).toBe("left");
  });

  it("без правила (как раньше) дефолт затёр бы чужое — сторож того, что правило реально работает", () => {
    const { b, current, incoming } = scenario();
    const r = merge3(b, current, incoming, "last-writer-wins");
    expect(hero(r.merged as Doc).alignment).toBe(DEFAULT_ALIGN);
    expect(r.overwritten.map((o) => o.path)).toEqual([
      "page:home/block:Hero-1/props/alignment",
    ]);
  });

  it("чужое автозначение не мешает моей настоящей правке того же ключа", () => {
    const b = base();
    const current = clone(b);
    hero(current).alignment = DEFAULT_ALIGN; // другая вкладка лишь вписала дефолт
    const incoming = clone(b);
    hero(incoming).alignment = "right"; // а здесь мерчант выбрал значение
    const r = merge3(b, current, incoming, "reject-conflicts", { isAuto });
    expect(r.conflicts).toEqual([]);
    expect(hero(r.merged as Doc).alignment).toBe("right");
  });
});
