/**
 * Фоновый перевод ревизий (revision-blog-refs.job.ts) на хранилище в памяти:
 * пачки по возрастанию id, отбор регуляркой, запись только при неизменной
 * data (гонка с конструктором), идемпотентность, блокировка, ошибка строки.
 */
import { createHash } from "node:crypto";
import {
  runRevisionBlogRefs,
  type RevisionBlogRefsStore,
  type RevisionRow,
} from "../revision-blog-refs.job";
import {
  LEGACY_PUBLICATIONS_PATTERN,
  type BlogIdsByHandle,
} from "../revision-blog-refs";

const md5 = (data: unknown) =>
  createHash("md5").update(JSON.stringify(data)).digest("hex");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const legacyRe = new RegExp(LEGACY_PUBLICATIONS_PATTERN, "i");

class MemoryStore implements RevisionBlogRefsStore {
  readonly rows = new Map<string, { siteId: string; data: unknown }>();
  readonly blogs = new Map<string, BlogIdsByHandle>();
  readonly batchCalls: string[][] = [];
  lockHeld = false;
  writes = 0;
  /** Перед записью строки: имитация сохранения из конструктора. */
  beforeWrite?: (id: string) => void;
  failWrite?: (id: string) => boolean;

  private matches(id: string): boolean {
    const row = this.rows.get(id);
    return Boolean(
      row && row.data !== null && legacyRe.test(JSON.stringify(row.data)),
    );
  }

  async tryLock() {
    if (this.lockHeld) return false;
    this.lockHeld = true;
    return true;
  }
  async unlock() {
    this.lockHeld = false;
  }
  async legacyIds() {
    return [...this.rows.keys()].filter((id) => this.matches(id)).sort();
  }
  async loadBatch(ids: readonly string[]): Promise<RevisionRow[]> {
    this.batchCalls.push([...ids]);
    return [...ids]
      .filter((id) => this.matches(id))
      .sort()
      .map((id) => {
        const r = this.rows.get(id)!;
        return { id, siteId: r.siteId, data: clone(r.data), hash: md5(r.data) };
      });
  }
  async blogIds(siteIds: readonly string[]) {
    const out = new Map<string, BlogIdsByHandle>();
    for (const id of siteIds) {
      const b = this.blogs.get(id);
      if (b) out.set(id, b);
    }
    return out;
  }
  async writeIfUnchanged(id: string, hash: string, data: unknown) {
    this.beforeWrite?.(id);
    if (this.failWrite?.(id)) throw new Error("connection reset");
    const row = this.rows.get(id);
    if (!row || md5(row.data) !== hash) return false;
    row.data = clone(data);
    this.writes += 1;
    return true;
  }
}

const logger = { log: jest.fn(), warn: jest.fn() };
beforeEach(() => {
  logger.log.mockClear();
  logger.warn.mockClear();
});

const legacy = (publicationType: string) => ({
  pagesData: {
    home: {
      content: [{ type: "Publications", props: { id: "P", publicationType } }],
    },
  },
});
const propsOf = (store: MemoryStore, id: string) =>
  (store.rows.get(id)!.data as ReturnType<typeof legacy>).pagesData.home
    .content[0].props as Record<string, unknown>;

function seed(count: number): MemoryStore {
  const store = new MemoryStore();
  store.blogs.set("s1", { novosti: "b-novosti", stati: "b-stati" });
  for (let i = 0; i < count; i += 1) {
    store.rows.set(`r${String(i).padStart(4, "0")}`, {
      siteId: "s1",
      data: legacy(i % 2 ? "articles" : "news"),
    });
  }
  return store;
}

describe("runRevisionBlogRefs — фоновый перевод ревизий", () => {
  it("идёт пачками по возрастанию id и переводит все строки", async () => {
    const store = seed(250);
    store.rows.set("a-clean", { siteId: "s1", data: legacy("all") });
    const summary = await runRevisionBlogRefs(store, {
      logger,
      batchSize: 100,
    });

    expect(summary).toEqual(
      expect.objectContaining({
        locked: true,
        batches: 3,
        scanned: 250,
        updated: 250,
        sections: 250,
        conflicts: 0,
        failed: 0,
      }),
    );
    expect(
      store.batchCalls.map((ids) => [ids.length, ids[0], ids[ids.length - 1]]),
    ).toEqual([
      [100, "r0000", "r0099"],
      [100, "r0100", "r0199"],
      [50, "r0200", "r0249"],
    ]);
    expect(propsOf(store, "r0000")).toEqual(
      expect.objectContaining({
        publicationSource: "blog",
        blogId: "b-novosti",
        publicationType: "b-novosti",
      }),
    );
    expect(propsOf(store, "r0001")).toEqual(
      expect.objectContaining({ blogId: "b-stati" }),
    );
    // Строка без прежних категорий регуляркой не выбрана и не тронута.
    expect(store.batchCalls.flat()).not.toContain("a-clean");
    expect(propsOf(store, "a-clean")).toEqual({
      id: "P",
      publicationType: "all",
    });
    expect(store.lockHeld).toBe(false);
    expect(logger.log.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(
      /старт[\s\S]*строк с прежними категориями 250, пачек 3[\s\S]*пачка 3[\s\S]*конец.*пачек 3, строк 250, записано 250/,
    );
  });

  it("повторный запуск ничего не меняет", async () => {
    const store = seed(30);
    await runRevisionBlogRefs(store, { logger, batchSize: 10 });
    const after = clone([...store.rows.entries()]);
    store.writes = 0;
    store.batchCalls.length = 0;

    const again = await runRevisionBlogRefs(store, { logger, batchSize: 10 });
    expect(again).toEqual(
      expect.objectContaining({ batches: 0, scanned: 0, updated: 0 }),
    );
    expect(store.batchCalls).toHaveLength(0);
    expect(store.writes).toBe(0);
    expect([...store.rows.entries()]).toEqual(after);
  });

  it("строки, которые перевод не меняет (новый формат, нет блогов), выбираются, но не пишутся", async () => {
    const store = seed(0);
    store.rows.set("r1", {
      siteId: "s1",
      data: {
        content: [
          {
            type: "Publications",
            props: {
              publicationSource: "publication",
              publicationType: "news",
            },
          },
        ],
      },
    });
    store.rows.set("r2", { siteId: "no-blogs", data: legacy("news") });
    const summary = await runRevisionBlogRefs(store, { logger });
    expect(summary).toEqual(
      expect.objectContaining({ scanned: 2, unchanged: 2, updated: 0 }),
    );
    expect(store.writes).toBe(0);
  });

  it("конструктор сохранил ревизию между чтением и записью — строку не перезаписываем", async () => {
    const store = seed(3);
    const saved = legacy("articles");
    saved.pagesData.home.content[0].props.id = "свежая правка";
    store.beforeWrite = (id) => {
      if (id === "r0000") store.rows.get(id)!.data = saved;
    };
    const summary = await runRevisionBlogRefs(store, { logger });
    expect(summary).toEqual(
      expect.objectContaining({ updated: 2, conflicts: 1 }),
    );
    expect(store.rows.get("r0000")!.data).toEqual(saved);
    expect(propsOf(store, "r0002")).toEqual(
      expect.objectContaining({ blogId: "b-novosti" }),
    );
  });

  it("строка ушла из-под регулярки между проходом и пачкой — не читается и не пишется", async () => {
    const store = seed(3);
    const original = store.legacyIds.bind(store);
    store.legacyIds = async () => {
      const ids = await original();
      store.rows.get("r0001")!.data = legacy("b-stati");
      return ids;
    };
    const summary = await runRevisionBlogRefs(store, { logger });
    expect(summary).toEqual(
      expect.objectContaining({ batches: 1, scanned: 2, updated: 2 }),
    );
    expect(propsOf(store, "r0001")).toEqual({
      id: "P",
      publicationType: "b-stati",
    });
  });

  it("ошибка одной строки не валит задачу", async () => {
    const store = seed(3);
    store.failWrite = (id) => id === "r0000";
    const summary = await runRevisionBlogRefs(store, { logger });
    expect(summary).toEqual(expect.objectContaining({ updated: 2, failed: 1 }));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("r0000"));
    expect(store.lockHeld).toBe(false);
  });

  it("блокировку держит другой экземпляр — ничего не делаем", async () => {
    const store = seed(5);
    store.lockHeld = true;
    const legacyIds = jest.spyOn(store, "legacyIds");
    const summary = await runRevisionBlogRefs(store, { logger });
    expect(summary).toEqual(
      expect.objectContaining({ locked: false, batches: 0, updated: 0 }),
    );
    expect(legacyIds).not.toHaveBeenCalled();
    expect(store.lockHeld).toBe(true);
  });

  it("падение выборки снимает блокировку и пробрасывается", async () => {
    const store = seed(5);
    store.loadBatch = async () => {
      throw new Error("db down");
    };
    await expect(runRevisionBlogRefs(store, { logger })).rejects.toThrow(
      "db down",
    );
    expect(store.lockHeld).toBe(false);
  });

  it("остановка сервиса прерывает перевод между пачками", async () => {
    const store = seed(50);
    let stop = false;
    const original = store.loadBatch.bind(store);
    store.loadBatch = async (ids) => {
      const rows = await original(ids);
      stop = true;
      return rows;
    };
    const summary = await runRevisionBlogRefs(store, {
      logger,
      batchSize: 10,
      shouldStop: () => stop,
    });
    expect(summary).toEqual(
      expect.objectContaining({ batches: 1, updated: 10 }),
    );
    expect(store.lockHeld).toBe(false);
  });
});
