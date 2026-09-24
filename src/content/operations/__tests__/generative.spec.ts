/**
 * Генеративные тесты движка операций на золотых документах пяти тем
 * (этап 2, кусок 2.1). Детерминированный генератор (mulberry32, свой seed на
 * тему) — упавший прогон воспроизводится тем же номером итерации.
 *
 * Свойства:
 *  1. `apply(a, diff(a, b)) ≡ b` и обратно, `diff(b, b) = []`;
 *  2. непересекающиеся правки (разные страницы / настройки) сливаются в обе,
 *     без overwritten и conflicts, при любом порядке сторон;
 *  3. одно и то же поле: last-writer-wins → входящее + overwritten,
 *     reject-conflicts → merged = null + conflicts;
 *  4. перестановка двух секций — ровно одна операция `order`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apply, diff, merge3, readAt } from "..";

type Doc = Record<string, any>;
type Rng = () => number;

const THEMES = ["rose", "flux", "bloom", "satin", "vanilla"] as const;
const ITERATIONS = 120;

function golden(theme: string): Doc {
  const file = resolve(
    __dirname,
    "../../../__tests__/golden",
    theme,
    "fresh-store.json",
  );
  return JSON.parse(readFileSync(file, "utf-8")).item.data;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function randomValue(rng: Rng, n: number): unknown {
  const kinds = [
    () => `значение-${n}`,
    () => n,
    () => rng() < 0.5,
    () => ({ text: `вложено-${n}`, size: "m" }),
    () => [{ label: `пункт-${n}` }],
    () => null,
  ];
  return pick(rng, kinds)();
}

/** Страницы с настоящим списком секций (без служебных ключей pagesData). */
function contentPages(d: Doc): string[] {
  return Object.keys(d.pagesData ?? {}).filter((k) =>
    Array.isArray(d.pagesData[k]?.content),
  );
}

type Mutator = (d: Doc, rng: Rng, n: number, page: string) => void;

/** Правки внутри одной страницы (для свойства «разные страницы сливаются»). */
const PAGE_MUTATORS: Record<string, Mutator> = {
  setBlockProp(d, rng, n, page) {
    const blocks = d.pagesData[page].content;
    if (!blocks.length) return;
    const b = pick(rng, blocks as Doc[]);
    b.props = b.props ?? {};
    b.props[
      pick(rng, [
        "heading",
        "subtitle",
        "colorScheme",
        "padding",
        `gen${n % 3}`,
      ])
    ] = randomValue(rng, n);
  },
  setNestedProp(d, rng, n, page) {
    const blocks = d.pagesData[page].content;
    if (!blocks.length) return;
    const b = pick(rng, blocks as Doc[]);
    b.props.deep = {
      ...(b.props.deep ?? {}),
      [`k${n % 4}`]: randomValue(rng, n),
    };
  },
  removeBlockProp(d, rng, _n, page) {
    const blocks = d.pagesData[page].content;
    if (!blocks.length) return;
    const b = pick(rng, blocks as Doc[]);
    const keys = Object.keys(b.props ?? {}).filter((k) => k !== "id");
    if (keys.length) delete b.props[pick(rng, keys)];
  },
  addBlock(d, rng, n, page) {
    const blocks = d.pagesData[page].content;
    const at = Math.floor(rng() * (blocks.length + 1));
    blocks.splice(at, 0, {
      type: "MainText",
      props: { id: `Gen-${page}-${n}`, text: `текст ${n}` },
    });
  },
  removeBlock(d, rng, _n, page) {
    const blocks = d.pagesData[page].content;
    if (blocks.length > 1) blocks.splice(Math.floor(rng() * blocks.length), 1);
  },
  moveBlock(d, rng, _n, page) {
    const blocks = d.pagesData[page].content;
    if (blocks.length < 2) return;
    const [moved] = blocks.splice(Math.floor(rng() * blocks.length), 1);
    blocks.splice(Math.floor(rng() * (blocks.length + 1)), 0, moved);
  },
  setRoot(d, _rng, n, page) {
    const pd = d.pagesData[page];
    pd.root = {
      ...(pd.root ?? {}),
      props: { ...(pd.root?.props ?? {}), title: `заголовок ${n}` },
    };
  },
  addZoneBlock(d, _rng, n, page) {
    const pd = d.pagesData[page];
    pd.zones = {
      ...(pd.zones ?? {}),
      [`Columns-${n}:left`]: [{ type: "MainText", props: { id: `Z-${n}` } }],
    };
  },
};

/** Правки документа целиком (страницы, настройки, служебные поля). */
const DOC_MUTATORS: Record<string, (d: Doc, rng: Rng, n: number) => void> = {
  addPage(d, _rng, n) {
    const id = `page-custom-gen-${n}`;
    d.pages.push({
      id,
      name: `Страница ${n}`,
      slug: `/gen-${n}`,
      role: "custom",
    });
    d.pagesData[id] = {
      content: [{ type: "Page", props: { id: `Page-${id}` } }],
      root: { props: {} },
      zones: {},
    };
  },
  removePage(d, rng) {
    const candidates = d.pages.filter((p: Doc) => p.id !== "home");
    if (!candidates.length) return;
    const victim = pick(rng, candidates as Doc[]).id;
    d.pages = d.pages.filter((p: Doc) => p.id !== victim);
    delete d.pagesData[victim];
  },
  renamePage(d, rng, n) {
    pick(rng, d.pages as Doc[]).name = `имя ${n}`;
  },
  movePage(d, rng) {
    if (d.pages.length < 2) return;
    const [moved] = d.pages.splice(Math.floor(rng() * d.pages.length), 1);
    d.pages.splice(Math.floor(rng() * (d.pages.length + 1)), 0, moved);
  },
  setThemeSetting(d, rng, n) {
    d.themeSettings = {
      ...(d.themeSettings ?? {}),
      [pick(rng, ["fontHeading", "colorSchemes", "radius"])]: randomValue(
        rng,
        n,
      ),
    };
  },
  setVolatile(d, rng, n) {
    d.currentPageId = pick(rng, d.pages as Doc[]).id;
    d.lockVersion = n;
  },
  duplicateBlockId(d, rng) {
    const page = pick(rng, contentPages(d));
    const blocks = d.pagesData[page].content;
    if (blocks.length) blocks.push(clone(blocks[0]));
  },
};

function mutate(a: Doc, rng: Rng, n: number): Doc {
  const d = clone(a);
  const steps = 1 + Math.floor(rng() * 5);
  for (let s = 0; s < steps; s += 1) {
    const i = n * 10 + s;
    if (rng() < 0.7) {
      const page = pick(rng, contentPages(d));
      PAGE_MUTATORS[pick(rng, Object.keys(PAGE_MUTATORS))](d, rng, i, page);
    } else {
      DOC_MUTATORS[pick(rng, Object.keys(DOC_MUTATORS))](d, rng, i);
    }
  }
  return d;
}

describe.each(THEMES)("генеративно, тема %s", (theme) => {
  const a = golden(theme);

  it(`apply(a, diff(a, b)) ≡ b и обратно — ${ITERATIONS} случайных правок`, () => {
    const rng = mulberry32(seedOf(`roundtrip-${theme}`));
    const kinds = new Set<string>();
    let changed = 0;
    for (let n = 0; n < ITERATIONS; n += 1) {
      const b = mutate(a, rng, n);
      const forward = diff(a, b);
      forward.forEach((op) => kinds.add(op.op));
      changed += forward.length > 0 ? 1 : 0;
      expect({ n, doc: apply(a, forward) }).toEqual({ n, doc: b });
      expect({ n, doc: apply(b, diff(b, a)) }).toEqual({ n, doc: a });
      expect({ n, ops: diff(b, clone(b)) }).toEqual({ n, ops: [] });
    }
    // Генератор не сторожит пустоту: почти каждая итерация что-то меняет, и
    // встречаются все четыре вида операций.
    expect(changed).toBeGreaterThan(ITERATIONS * 0.9);
    expect([...kinds].sort()).toEqual(["add", "order", "remove", "set"]);
  });

  it("цепочка правок: a → b → c, apply по шагам = c", () => {
    const rng = mulberry32(seedOf(`chain-${theme}`));
    let current = a;
    for (let n = 0; n < 40; n += 1) {
      const next = mutate(current, rng, n);
      current = apply(current, diff(current, next));
      expect({ n, doc: current }).toEqual({ n, doc: next });
    }
  });

  it("правки на разных страницах сливаются в обе при любом порядке сторон", () => {
    const rng = mulberry32(seedOf(`disjoint-${theme}`));
    const pages = contentPages(a);
    let bothSidesChanged = 0;
    for (let n = 0; n < ITERATIONS; n += 1) {
      const [p1, p2] = [pick(rng, pages), pick(rng, pages)];
      if (p1 === p2) continue;
      const b1 = clone(a);
      const b2 = clone(a);
      for (let s = 0; s < 3; s += 1) {
        PAGE_MUTATORS[pick(rng, Object.keys(PAGE_MUTATORS))](
          b1,
          rng,
          n * 10 + s,
          p1,
        );
        PAGE_MUTATORS[pick(rng, Object.keys(PAGE_MUTATORS))](
          b2,
          rng,
          n * 10 + s + 5,
          p2,
        );
      }
      bothSidesChanged +=
        diff(a, b1).length > 0 && diff(a, b2).length > 0 ? 1 : 0;
      for (const [current, incoming] of [
        [b1, b2],
        [b2, b1],
      ]) {
        const r = merge3(a, current, incoming, "reject-conflicts");
        expect({ n, conflicts: r.conflicts }).toEqual({ n, conflicts: [] });
        expect({ n, p1: (r.merged as Doc).pagesData[p1] }).toEqual({
          n,
          p1: b1.pagesData[p1],
        });
        expect({ n, p2: (r.merged as Doc).pagesData[p2] }).toEqual({
          n,
          p2: b2.pagesData[p2],
        });
      }
    }
    expect(bothSidesChanged).toBeGreaterThan(ITERATIONS * 0.6);
  });

  it("правка настроек темы и правка страницы сливаются", () => {
    const rng = mulberry32(seedOf(`settings-${theme}`));
    for (let n = 0; n < 40; n += 1) {
      const current = clone(a);
      DOC_MUTATORS.setThemeSetting(current, rng, n);
      const incoming = clone(a);
      PAGE_MUTATORS.setBlockProp(incoming, rng, n, "home");
      const r = merge3(a, current, incoming, "reject-conflicts");
      expect(r.conflicts).toEqual([]);
      expect((r.merged as Doc).themeSettings).toEqual(current.themeSettings);
      expect((r.merged as Doc).pagesData.home).toEqual(incoming.pagesData.home);
    }
  });

  it("одно и то же поле: по политике", () => {
    const rng = mulberry32(seedOf(`same-field-${theme}`));
    const pages = contentPages(a).filter(
      (p) => a.pagesData[p].content.length > 0,
    );
    for (let n = 0; n < 40; n += 1) {
      const page = pick(rng, pages);
      const blockId = pick(rng, a.pagesData[page].content as Doc[]).props.id;
      const path = `page:${page}/block:${blockId}/props/genField`;
      const current = clone(a);
      const incoming = clone(a);
      current.pagesData[page].content.find(
        (x: Doc) => x.props.id === blockId,
      ).props.genField = `чужое ${n}`;
      incoming.pagesData[page].content.find(
        (x: Doc) => x.props.id === blockId,
      ).props.genField = `моё ${n}`;

      const lww = merge3(a, current, incoming, "last-writer-wins");
      expect(readAt(lww.merged!, path)).toBe(`моё ${n}`);
      expect(lww.overwritten).toEqual([
        { path, current: `чужое ${n}`, incoming: `моё ${n}` },
      ]);

      const strict = merge3(a, current, incoming, "reject-conflicts");
      expect(strict.merged).toBeNull();
      expect(strict.conflicts).toEqual([
        { path, current: `чужое ${n}`, incoming: `моё ${n}` },
      ]);
    }
  });

  it("перестановка двух секций — ровно одна операция порядка", () => {
    const rng = mulberry32(seedOf(`reorder-${theme}`));
    const pages = contentPages(a).filter(
      (p) => a.pagesData[p].content.length >= 2,
    );
    for (let n = 0; n < 40; n += 1) {
      const page = pick(rng, pages);
      const b = clone(a);
      const blocks = b.pagesData[page].content;
      const i = Math.floor(rng() * blocks.length);
      const j =
        (i + 1 + Math.floor(rng() * (blocks.length - 1))) % blocks.length;
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      const ops = diff(a, b);
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ op: "order", path: `page:${page}/order` });
      expect(apply(a, ops)).toEqual(b);
    }
  });
});
