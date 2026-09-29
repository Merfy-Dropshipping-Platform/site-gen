import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * И1 (этап 2, кусок 2.3): ни один путь не правит строку ревизии на месте;
 * любое изменение контента — новая ревизия через `StoreContent.save`
 * (`src/content/`). Сторож — пара к `no-direct-revision-reads.spec.ts`.
 *
 * Сигналы записи (комментарии срезаются):
 *   ORM — `.update(schema.siteRevision)`, `.insert(…)`, `.delete(…)`;
 *   SQL — `UPDATE site_revision`, `INSERT INTO site_revision`, `DELETE FROM site_revision`.
 *
 * `src/` (код сервиса): правка на месте запрещена без исключений. Вставка и
 * удаление мимо порта — только из WRITE_ALLOWANCES, с причиной и точным
 * числом (разошлось в любую сторону — красный: либо появился новый писатель,
 * либо старый ушёл и запись протухла).
 *
 * `scripts/` (разовые скрипты): правка на месте — только у перечисленных в
 * SCRIPT_UPDATE_ALLOWANCES исторических скриптов. Новый скрипт, который
 * правит ревизию на месте, — красный: данные меняются новой ревизией.
 *
 * Указатель текущей ревизии (`site.current_revision_id`) в `src/` двигает
 * только порт: `.update(schema.site).set({ … currentRevisionId: … })`,
 * `.insert(schema.site).values({ … currentRevisionId: … })` или SQL
 * `UPDATE site SET … current_revision_id =` мимо порта — красный, кроме
 * POINTER_ALLOWANCES (точное число).
 *
 * Не сканируется: `src/content/**` (сам порт) и тесты.
 *
 * Границы (что сторож НЕ видит — это текстовая проверка, не разбор кода):
 *  - таблица под другим именем (`const t = schema.siteRevision; db.update(t)`);
 *  - upsert `insert(…).onConflictDoUpdate(…)` — считается вставкой, правку на
 *    месте в нём не видно;
 *  - SQL, собранный по кускам в рантайме (имя таблицы в переменной);
 *  - указатель в объекте, собранном заранее (`const patch = { currentRevisionId };
 *    db.update(schema.site).set(patch)`).
 */

const SRC_ROOT = resolve(__dirname, "..", "..");
const SCRIPTS_ROOT = resolve(SRC_ROOT, "..", "scripts");
const SKIP_DIRS = ["node_modules", "/content/", "__tests__"];

type WriteKind = "update" | "insert" | "delete";
type Counts = Record<WriteKind, number>;

const SIGNALS: Record<WriteKind, RegExp[]> = {
  update: [
    /\.update\(\s*(?:schema\.)?siteRevision\s*\)/g,
    /\bupdate\s+"?site_revision"?\s/gi,
  ],
  insert: [
    /\.insert\(\s*(?:schema\.)?siteRevision\s*\)/g,
    /\binsert\s+into\s+"?site_revision"?[\s(]/gi,
  ],
  delete: [
    /\.delete\(\s*(?:schema\.)?siteRevision\s*\)/g,
    /\bdelete\s+from\s+"?site_revision"?[\s;`'"]/gi,
  ],
};

type Allowance = { path: string; counts: Partial<Counts>; reason: string };

/** Писатели `src/` мимо порта. Правки на месте здесь нет и быть не может. */
const WRITE_ALLOWANCES: Allowance[] = [
  {
    path: "generator/build.service.ts",
    counts: { insert: 2 },
    reason:
      "сборка магазина без текущей ревизии вставляет ревизию с контентом шаблона " +
      "по умолчанию (снэпшот-деплой и stageMerge) — новая строка, не текущая, не " +
      "правка на месте; уйдёт в провижининг этапа 3 (досоздание магазина).",
  },
  {
    path: "generator/generator.service.ts",
    counts: { insert: 1 },
    reason:
      "легаси-генератор: тот же запасной путь «у сайта нет ревизии» — вставка " +
      "новой строки с дефолтом шаблона.",
  },
  {
    path: "modules/theme-preset/theme-preset.service.ts",
    counts: { insert: 1 },
    reason:
      "применение пресета = смена темы: новая ревизия вставляется в одной " +
      "транзакции с указателем и журналом миграций темы; смена темы — объём " +
      "этапа 3 (SetTheme), туда же переезжает эта запись.",
  },
  {
    path: "admin/bulk/bulk.service.ts",
    counts: { delete: 1 },
    reason:
      "жёсткое удаление магазина удаляет все его ревизии — не правка контента.",
  },
];

/** Исторические разовые скрипты, правившие ревизии на месте (уже прогнаны). */
const SCRIPT_UPDATE_ALLOWANCES: Allowance[] = [
  {
    path: "backfill-theme-colorschemes.ts",
    counts: { update: 1 },
    reason:
      "Phase 0b (апрель 2026): замена legacy-схем цветов с бэкапом в site_revision_prebackfill.",
  },
  {
    path: "rollback-theme-colorschemes.ts",
    counts: { update: 1 },
    reason: "откат Phase 0b из site_revision_prebackfill.",
  },
  {
    path: "migrations/2026-06-05-rose-header-padding-32-to-24.mjs",
    counts: { update: 1 },
    reason: "разовая миграция rose Header (июнь 2026).",
  },
  {
    path: "migrations/2026-06-05-rose-header-sitetitle-to-rose.mjs",
    counts: { update: 1 },
    reason: "разовая миграция rose Header siteTitle (июнь 2026).",
  },
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function countWrites(code: string): Counts {
  const clean = stripComments(code);
  const count = (kind: WriteKind) =>
    SIGNALS[kind].reduce((sum, re) => sum + (clean.match(re)?.length ?? 0), 0);
  return {
    update: count("update"),
    insert: count("insert"),
    delete: count("delete"),
  };
}

/** Где указатель текущей ревизии двигается мимо порта — начало аргумента вызова. */
const POINTER_CALLS: RegExp[] = [
  /\.update\(\s*(?:schema\.)?site\s*\)\s*\.set\(/g,
  /\.insert\(\s*(?:schema\.)?site\s*\)\s*\.values\(/g,
];

const POINTER_SQL =
  /\bupdate\s+"?site"?\s+set\b[^;`]*\bcurrent_revision_id\s*=/gi;

const PAREN_DEPTH: Record<string, number> = { "(": 1, ")": -1 };

/** Аргумент вызова по балансу скобок, начиная с открывающей. */
function argumentFrom(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    depth += PAREN_DEPTH[code[i]] ?? 0;
    if (depth === 0) return code.slice(open, i + 1);
  }
  return code.slice(open);
}

export function countPointerWrites(code: string): number {
  const clean = stripComments(code);
  const calls = POINTER_CALLS.flatMap((re) => [...clean.matchAll(re)]);
  const orm = calls
    .map((m) => argumentFrom(clean, (m.index ?? 0) + m[0].length - 1))
    .filter((arg) => /\bcurrentRevisionId\s*:/.test(arg)).length;
  return orm + (clean.match(POINTER_SQL)?.length ?? 0);
}

/** Кто двигает указатель мимо порта — точное число. */
const POINTER_ALLOWANCES: Array<{
  path: string;
  count: number;
  reason: string;
}> = [
  {
    path: "modules/theme-preset/theme-preset.service.ts",
    count: 1,
    reason:
      "мёртвый путь theme/apply (пресет темы): ревизия и указатель в одной " +
      "транзакции с журналом смены темы; уходит в уборке этапа 3 (SetTheme).",
  },
];

function isTestFile(rel: string): boolean {
  return /\.(spec|test)\.[mc]?[jt]s$/.test(rel);
}

function walk(root: string, extensions: RegExp): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const rel = full.slice(root.length + 1);
      if (SKIP_DIRS.some((x) => `/${rel}/`.includes(x))) continue;
      if (statSync(full).isDirectory()) visit(full);
      else if (extensions.test(rel) && !isTestFile(rel)) out.push(rel);
    }
  };
  visit(root);
  return out;
}

function withCounts(root: string, files: string[]) {
  return files.map((rel) => ({
    rel,
    ...countWrites(readFileSync(resolve(root, rel), "utf-8")),
  }));
}

const SRC_FILES = withCounts(SRC_ROOT, walk(SRC_ROOT, /\.ts$/));
const SCRIPT_FILES = withCounts(
  SCRIPTS_ROOT,
  walk(SCRIPTS_ROOT, /\.(ts|mjs|js)$/),
);
const zero: Counts = { update: 0, insert: 0, delete: 0 };

describe("И1: запись в site_revision только через порт StoreContent", () => {
  it("ОПОРА: обход видит src/ и scripts/, а сигналы ловят настоящие формы записи", () => {
    expect(SRC_FILES.length).toBeGreaterThan(100);
    expect(SRC_FILES.map((f) => f.rel)).toContain("pages/pages.service.ts");
    expect(SRC_FILES.map((f) => f.rel)).not.toContain(
      "content/document.adapter.ts",
    );
    expect(SCRIPT_FILES.length).toBeGreaterThan(10);
    expect(
      countWrites(
        "await this.db\n  .update(schema.siteRevision)\n  .set({ data })",
      ),
    ).toEqual({ ...zero, update: 1 });
    expect(countWrites("`UPDATE site_revision\n SET data = $1`")).toEqual({
      ...zero,
      update: 1,
    });
    expect(
      countWrites("await tx.insert(schema.siteRevision).values(v)"),
    ).toEqual({ ...zero, insert: 1 });
    expect(countWrites("`INSERT INTO site_revision (id) VALUES ($1)`")).toEqual(
      { ...zero, insert: 1 },
    );
    expect(
      countWrites("`INSERT INTO site_revision_prebackfill (revision_id)`"),
    ).toEqual(zero);
    expect(
      countWrites("// .update(schema.siteRevision) в комментарии"),
    ).toEqual(zero);
  });

  it("src/: ни одной правки строки ревизии на месте", () => {
    const inPlace = SRC_FILES.filter((f) => f.update > 0).map(
      (f) => `${f.rel}: ${f.update}`,
    );
    expect(inPlace).toEqual([]);
  });

  it("src/: новый писатель мимо порта (вставка/удаление) вне белого списка — красный", () => {
    const allowed = new Set(WRITE_ALLOWANCES.map((a) => a.path));
    const violators = SRC_FILES.filter(
      (f) => !allowed.has(f.rel) && f.insert + f.delete > 0,
    ).map((f) => f.rel);
    expect(violators).toEqual([]);
  });

  it.each(WRITE_ALLOWANCES.map((a) => [a.path, a] as const))(
    "src/: запись белого списка точна — %s",
    (path, allowance) => {
      const found = SRC_FILES.find((f) => f.rel === path) ?? {
        rel: path,
        ...zero,
      };
      const counts: Counts = {
        update: found.update,
        insert: found.insert,
        delete: found.delete,
      };
      expect({ path, counts }).toEqual({
        path,
        counts: { ...zero, ...allowance.counts },
      });
    },
  );

  it("scripts/: новый скрипт, правящий ревизию на месте, — красный", () => {
    const allowed = new Set(SCRIPT_UPDATE_ALLOWANCES.map((a) => a.path));
    const violators = SCRIPT_FILES.filter(
      (f) => !allowed.has(f.rel) && f.update > 0,
    ).map((f) => f.rel);
    expect(violators).toEqual([]);
  });

  it.each(SCRIPT_UPDATE_ALLOWANCES.map((a) => [a.path, a] as const))(
    "scripts/: историческое исключение точно — %s",
    (path, allowance) => {
      const found = SCRIPT_FILES.find((f) => f.rel === path);
      expect({ path, update: found?.update ?? 0 }).toEqual({
        path,
        update: allowance.counts.update,
      });
    },
  );
});

const POINTER_FILES = walk(SRC_ROOT, /\.ts$/).map((rel) => ({
  rel,
  count: countPointerWrites(readFileSync(resolve(SRC_ROOT, rel), "utf-8")),
}));

describe("указатель текущей ревизии двигает только порт", () => {
  it("ОПОРА: сигналы ловят настоящие формы и не ловят чтение", () => {
    expect(
      countPointerWrites(
        'await this.db.update(schema.site).set({\n  status: "published",\n  currentRevisionId: revisionId,\n})',
      ),
    ).toBe(1);
    expect(
      countPointerWrites(
        "tx.update(schema.site).set({ ...(a ? { b: 1 } : {}), currentRevisionId: id })",
      ),
    ).toBe(1);
    expect(
      countPointerWrites(
        "db.insert(schema.site).values({ id, currentRevisionId: r })",
      ),
    ).toBe(1);
    expect(
      countPointerWrites("`UPDATE site SET current_revision_id = $1`"),
    ).toBe(1);
    expect(
      countPointerWrites(
        "db.select({ currentRevisionId: schema.site.currentRevisionId }).from(schema.site)",
      ),
    ).toBe(0);
    expect(
      countPointerWrites("db.update(schema.site).set({ status: 'published' })"),
    ).toBe(0);
    expect(
      countPointerWrites(
        "// db.update(schema.site).set({ currentRevisionId: x })",
      ),
    ).toBe(0);
  });

  it("src/: мимо порта указатель не двигает никто вне белого списка", () => {
    const allowed = new Set(POINTER_ALLOWANCES.map((a) => a.path));
    const violators = POINTER_FILES.filter(
      (f) => !allowed.has(f.rel) && f.count > 0,
    ).map((f) => `${f.rel}: ${f.count}`);
    expect(violators).toEqual([]);
  });

  it.each(POINTER_ALLOWANCES.map((a) => [a.path, a] as const))(
    "src/: исключение точно — %s",
    (path, allowance) => {
      const found = POINTER_FILES.find((f) => f.rel === path);
      expect({ path, count: found?.count ?? 0 }).toEqual({
        path,
        count: allowance.count,
      });
    },
  );
});
