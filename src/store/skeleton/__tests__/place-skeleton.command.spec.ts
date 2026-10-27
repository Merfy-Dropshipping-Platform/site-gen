/**
 * Команда «заготовка магазина» — `PlaceSkeleton` (решение 7 спеки MCP «Секции и SDK»).
 *
 * Сборщик и реестр секций — заглушка порта `SkeletonSections` (сохранённое попадает в «есть у магазина»), ревизия —
 * заглушка порта StoreContent, блокировка — в памяти. Проверяется, что ушло в сборщик и что записано в ревизию.
 */
import { newThemeStarterRevision } from "../../../content/new-theme-pages";
import { RevisionConflictError } from "../../../content/store-content.port";
import { PlaceSkeletonCommand } from "../place-skeleton.command";
import { skeletonLibrary } from "../skeleton-library";
import { SKELETON_LAYOUT, skeletonSectionNames } from "../skeleton-layout";
import type {
  ShopSection,
  SkeletonLock,
  SkeletonSections,
} from "../skeleton-sections";

const TENANT = "t1";
const SITE = "11111111-1111-4111-8111-111111111111";
const ALL = skeletonSectionNames();

type Doc = Record<string, any>;

function setup(
  opts: {
    themeId?: string;
    have?: ShopSection[];
    reject?: Record<string, string>;
    document?: Doc;
    currentRevisionId?: string | null;
    conflict?: boolean;
  } = {},
) {
  const site = {
    id: SITE,
    tenantId: TENANT,
    name: "Сезон",
    themeId: opts.themeId ?? "nova",
    publicUrl: null,
    currentRevisionId:
      opts.currentRevisionId === undefined ? "rev-1" : opts.currentRevisionId,
  };
  const shop: ShopSection[] = [...(opts.have ?? [])];
  const saved: string[] = [];
  const present = jest.fn(async () => shop.map((s) => ({ ...s })));
  const save = jest.fn(
    async (_siteId: string, files: Record<string, string>) => {
      const manifest = JSON.parse(files["section.json"]);
      const name = manifest.name as string;
      const reason = opts.reject?.[name];
      if (reason) return { ok: false as const, reason };
      saved.push(name);
      shop.push({ name, role: manifest.role ?? null });
      return { ok: true as const };
    },
  );
  const sections: SkeletonSections = { present, save };
  let held = false;
  const lock: SkeletonLock = {
    withSiteLock: async (_siteId, work) => {
      if (held) return { locked: false };
      held = true;
      try {
        return { locked: true, value: await work() };
      } finally {
        held = false;
      }
    },
  };
  let current: { version: string; document: Doc } = {
    version: site.currentRevisionId ?? "rev-0",
    document: opts.document ?? newThemeStarterRevision(),
  };
  const writes: any[] = [];
  const content = {
    load: jest.fn(async () => structuredClone(current)),
    save: jest.fn(async (_siteId: string, params: any) => {
      if (opts.conflict) throw new RevisionConflictError();
      writes.push(params);
      current = {
        version: `rev-${writes.length + 1}`,
        document: params.document,
      };
      return { version: current.version };
    }),
  };
  const sites = {
    get: jest.fn(async (t: string, id: string) =>
      t === TENANT && id === SITE ? site : null,
    ),
  };
  const command = new PlaceSkeletonCommand(
    sites as any,
    content as any,
    sections,
    lock,
  );
  return {
    command,
    present,
    save,
    content,
    writes,
    saved,
    current: () => current,
  };
}

const input = { tenantId: TENANT, siteId: SITE, actorUserId: "u1" };

describe("PlaceSkeleton: новый магазин nova", () => {
  it("копирует 25 секций библиотеки файлами из пакетов sites и одной записью ставит их по раскладке", async () => {
    const { command, saved, writes, save, current } = setup();

    const result = await command.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(saved.sort()).toEqual([...ALL].sort());
    // Файлы — как в библиотеке: тот же section.json и шаблон.
    const heroCall = save.mock.calls.find(
      ([, files]) => JSON.parse(files["section.json"]).name === "hero",
    );
    expect(heroCall?.[1]).toEqual(skeletonLibrary().get("hero")!.files);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      mode: "on-base",
      base: "rev-1",
      mergePolicy: "last-writer-wins",
      tenantId: TENANT,
      actor: "system",
      source: "skeleton",
      actorUserId: "u1",
    });
    const doc = current().document;
    for (const [key, names] of Object.entries(SKELETON_LAYOUT.lists))
      expect(doc.sections[key].map((i: Doc) => i.section)).toEqual(
        names.map((n) => `shop:${n}`),
      );

    expect(result.effect).toMatchObject({
      siteId: SITE,
      changed: true,
      complete: true,
      revisionId: "rev-2",
      about: "created",
      sections: { total: 25, kept: 0, skipped: [] },
    });
    // Порядок «добавлено» — порядок раскладки, не порядок ответа сборщика.
    expect(result.effect.sections.added).toEqual(ALL);
    expect(result.effect.lists.filled.map((l) => l.label)).toEqual([
      "Шапка",
      "Подвал",
      "Поверх страниц",
      "Главная",
      "Каталог",
      "Коллекция",
      "Товар",
      "Блог",
      "Запись блога",
      "Политика",
      "Страница 404",
      "Корзина",
      "Вход",
      "Заказы",
      "Профиль",
      "Избранное",
      "О нас",
    ]);
  });

  it("повтор: секции не копируются, ревизия не пишется, ответ «всё на месте»", async () => {
    const harness = setup();
    await harness.command.execute(input);
    const before = JSON.stringify(harness.current());
    harness.save.mockClear();

    const again = await harness.command.execute(input);

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(harness.save).not.toHaveBeenCalled();
    expect(harness.writes).toHaveLength(1);
    expect(JSON.stringify(harness.current())).toBe(before);
    expect(again.effect).toMatchObject({
      changed: false,
      complete: true,
      revisionId: "rev-2",
      about: "kept",
      sections: { added: [], kept: 25, skipped: [] },
      lists: { filled: [], waiting: [], absent: [] },
    });
    expect(again.effect.lists.kept).toHaveLength(17);
  });
});

describe("PlaceSkeleton: магазин, где уже что-то есть", () => {
  it("секция с тем же именем уже есть — не перезаписывается (мерчант мог её править)", async () => {
    const { command, saved } = setup({
      have: [
        { name: "header", role: null },
        { name: "hero", role: null },
      ],
    });
    const result = await command.execute(input);
    expect(saved).not.toContain("header");
    expect(saved).not.toContain("hero");
    expect(saved).toHaveLength(23);
    expect(result.ok && result.effect.sections.kept).toBe(2);
  });

  it("роль занята своей секцией магазина — секция пропускается с причиной, её список ждёт", async () => {
    const { command, saved, current } = setup({
      have: [{ name: "my-cart", role: "cart" }],
    });
    const result = await command.execute(input);
    expect(saved).not.toContain("cart");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.complete).toBe(false);
    expect(result.effect.sections.skipped).toEqual([
      {
        name: "cart",
        title: "Корзина",
        reason: "её роль уже у секции магазина «my-cart»",
      },
    ]);
    expect(result.effect.lists.waiting).toEqual([
      { key: "page-cart", label: "Корзина", missing: ["cart"] },
    ]);
    expect(current().document.sections["page-cart"]).toBeUndefined();
    expect(current().document.sections.home).toHaveLength(5);
  });

  it("сборщик не принял секцию — пропуск с причиной; повтор докопирует и заполнит её список", async () => {
    const reject: Record<string, string> = {
      blog: "обработчик onclick не нужен",
    };
    const harness = setup({ reject });
    const first = await harness.command.execute(input);
    expect(first.ok && first.effect.sections.skipped).toEqual([
      {
        name: "blog",
        title: expect.any(String),
        reason: "обработчик onclick не нужен",
      },
    ]);
    expect(first.ok && first.effect.lists.waiting.map((l) => l.key)).toEqual([
      "blog",
    ]);

    delete reject.blog;
    const second = await harness.command.execute(input);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.effect.sections.added).toEqual(["blog"]);
    expect(second.effect.lists.filled).toEqual([
      { key: "blog", label: "Блог", sections: 1 },
    ]);
    expect(second.effect.complete).toBe(true);
    expect(
      harness.current().document.sections.blog.map((i: Doc) => i.section),
    ).toEqual(["shop:blog"]);
  });

  it("непустой список не трогается", async () => {
    const document = newThemeStarterRevision() as Doc;
    document.sections = {
      home: [{ id: "mine-1", section: "shop:hero", settings: { overlay: 50 } }],
    };
    const { command, current } = setup({ document });
    const result = await command.execute(input);
    expect(current().document.sections.home).toEqual([
      { id: "mine-1", section: "shop:hero", settings: { overlay: 50 } },
    ]);
    expect(result.ok && result.effect.lists.kept).toEqual([
      { key: "home", label: "Главная" },
    ]);
  });
});

describe("PlaceSkeleton: отказы кодом", () => {
  it("магазин не на новой теме — not_new_theme; сборщик и ревизию не трогает", async () => {
    const { command, present, content } = setup({ themeId: "rose" });
    expect(await command.execute(input)).toEqual({
      ok: false,
      error: { code: "not_new_theme", themeId: "rose" },
    });
    expect(present).not.toHaveBeenCalled();
    expect(content.load).not.toHaveBeenCalled();
  });

  it("чужой или несуществующий магазин — site_not_found", async () => {
    const { command } = setup();
    expect(await command.execute({ ...input, tenantId: "t2" })).toEqual({
      ok: false,
      error: { code: "site_not_found" },
    });
  });

  it("у магазина ещё нет ревизии — no_revision", async () => {
    const { command, save } = setup({ currentRevisionId: null });
    expect(await command.execute(input)).toEqual({
      ok: false,
      error: { code: "no_revision" },
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("заготовка этого магазина уже идёт — skeleton_in_progress, вторая ничего не делает", async () => {
    const { command, save } = setup();
    const [first, second] = await Promise.all([
      command.execute(input),
      command.execute(input),
    ]);
    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      error: { code: "skeleton_in_progress" },
    });
    expect(save.mock.calls).toHaveLength(25);
  });

  it("CAS проиграл все попытки — revision_conflict", async () => {
    const { command } = setup({ conflict: true });
    expect(await command.execute(input)).toEqual({
      ok: false,
      error: { code: "revision_conflict" },
    });
  });

  it.each([
    ["без siteId", { tenantId: TENANT }],
    ["без tenantId", { siteId: SITE }],
    ["не объект", "x"],
  ])("%s — invalid_input", async (_t, raw) => {
    const { command } = setup();
    expect(await command.execute(raw)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", issues: expect.any(Array) },
    });
  });
});
