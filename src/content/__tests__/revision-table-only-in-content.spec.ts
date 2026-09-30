import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Одна дверь к таблице ревизий — `src/content/`. Сторож
 * (`merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`, R1): ЛЮБОЕ упоминание `schema.siteRevision` в `src/` вне модуля (кроме
 * тестов) — красный, не важно, чтение это, запись или просто выборка
 * метаданных.
 *
 * ИСТОРИЯ. Раньше здесь стояли ДВА сторожа с раздельными, узкими сигналами:
 * `no-direct-revision-reads.spec.ts` ловил только `schema.siteRevision.data`
 * и «голый» `.select()`, `no-direct-revision-writes.spec.ts` — отдельно
 * insert/update/delete и отдельно сдвиг указателя. У каждого сигнала было
 * своё слепое пятно (например, чтение ТОЛЬКО meta/id не ловил никто), и оба
 * держали разраставшийся список ALLOWANCES (7 файлов на чтение + 4 на запись
 * + 1 на указатель) — часть которых были не «нельзя перевести», а просто
 * «эту функцию ещё не перевели». R1 перевёл ВСЕ такие места на
 * методы модуля (`load`/`save`/`history`/`get`/`envelope`/`rollback`/`diff`/
 * `historyCounts`) — один широкий сигнал ниже сводит список к тому, что
 * ДЕЙСТВИТЕЛЬНО нельзя перевести без растяжения контракта порта (см.
 * ALLOWANCES) или относится к историческим разовым скриптам (SCRIPT_
 * ALLOWANCES) — таких сегодня всего два места в `src/` и четыре в `scripts/`.
 *
 * Указатель `site.current_revision_id` — отдельная таблица (`site`, не
 * `site_revision`), отдельная проверка ниже (POINTER_ALLOWANCES): её тоже
 * должен двигать только порт.
 *
 * Что НЕ сканируется: `src/content/**` (сам порт — это каноническая
 * реализация, не «второй путь») и тесты (`__tests__/`, `.spec.ts`,
 * `.test.ts` — моки БД в них не читают и не пишут реальный контент).
 */

const SRC_ROOT = resolve(__dirname, "..", "..");
const SCRIPTS_ROOT = resolve(SRC_ROOT, "..", "scripts");
const SKIP_DIRS = ["node_modules", "/content/", "__tests__"];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function isTestFile(rel: string): boolean {
  return /\.(spec|test)\.[mc]?[jt]s$/.test(rel);
}

function walk(root: string, extensions: RegExp): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = resolve(dir, entry);
      const rel = full.slice(root.length + 1);
      if (SKIP_DIRS.some((x) => `/${rel}/`.includes(x))) continue;
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) visit(full);
      else if (extensions.test(rel) && !isTestFile(rel)) out.push(rel);
    }
  };
  visit(root);
  return out;
}

/** Любое упоминание `schema.siteRevision` — не важно, чтение это или запись. */
function countMentions(code: string): number {
  return (stripComments(code).match(/schema\.siteRevision\b/g) ?? []).length;
}

type Allowance = { path: string; count: number; reason: string };

// ---------------------------------------------------------------------------
// 1. src/: любое упоминание schema.siteRevision вне src/content/ — красное,
//    кроме двух именованных исключений.
// ---------------------------------------------------------------------------

/**
 * Единственные два оставшихся прямых упоминания в `src/` (после R1, второй
 * круг): оба — не про содержимое ревизии (не read/write контента через
 * порт), а про операцию над строками таблицы, которая не укладывается в
 * контракт порта `StoreContent`.
 */
const ALLOWANCES: Allowance[] = [
  {
    path: "admin/bulk/bulk.service.ts",
    count: 2, // .delete(schema.siteRevision) + .where(eq(schema.siteRevision.siteId, id))
    reason:
      "жёсткое удаление магазина удаляет ВСЕ его ревизии одним DELETE по " +
      "siteId — это не правка контента (порту нечем ответить на «удалить " +
      "всё для сайта», он говорит только про одну ревизию за раз), а часть " +
      "уничтожения самого сайта в той же операции.",
  },
  {
    path: "modules/theme-preset/theme-preset.service.ts",
    count: 1, // tx.insert(schema.siteRevision)
    reason:
      "мёртвый путь theme/apply (пресет темы: POST /api/sites/:id/theme/apply, " +
      "RPC theme-presets.apply) — ОДНА транзакция пишет ТРИ таблицы разом: " +
      "site_revision (опционально, если replaceContent), site (themeId/" +
      "currentRevisionId/needsRebuild — needsRebuild вне закрытого набора " +
      "SitePatch) и siteThemeMigrations (аудит-журнал смены темы, порту " +
      "вообще не известная таблица). Растягивать контракт порта ради пути " +
      "без потребителя (числится на уборку в этапе 3, план " +
      "2026-09-24-stage3-store-commands-saga.md, кусок 3.9) — не стал. " +
      "Второй прямой сигнал этого же файла — указатель current_revision_id, " +
      "см. POINTER_ALLOWANCES ниже (та же транзакция, другая таблица).",
  },
];

const ALLOWED_PATHS = new Set(ALLOWANCES.map((a) => a.path));

// ---------------------------------------------------------------------------
// 2. Указатель site.current_revision_id — отдельная таблица, тот же принцип:
//    двигает только порт (DocumentAdapter.commit()).
// ---------------------------------------------------------------------------

const POINTER_CALLS: RegExp[] = [
  /\.update\(\s*(?:schema\.)?site\s*\)\s*\.set\(/g,
  /\.insert\(\s*(?:schema\.)?site\s*\)\s*\.values\(/g,
];
const POINTER_SQL = /\bupdate\s+"?site"?\s+set\b[^;`]*\bcurrent_revision_id\s*=/gi;
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

function countPointerWrites(code: string): number {
  const clean = stripComments(code);
  const calls = POINTER_CALLS.flatMap((re) => [...clean.matchAll(re)]);
  const orm = calls
    .map((m) => argumentFrom(clean, (m.index ?? 0) + m[0].length - 1))
    .filter((arg) => /\bcurrentRevisionId\s*:/.test(arg)).length;
  return orm + (clean.match(POINTER_SQL)?.length ?? 0);
}

const POINTER_ALLOWANCES: Array<{ path: string; count: number; reason: string }> = [
  {
    path: "modules/theme-preset/theme-preset.service.ts",
    count: 1,
    reason:
      "тот же мёртвый путь theme/apply, та же транзакция, что в ALLOWANCES " +
      "выше: currentRevisionId сдвигается вместе с themeId/needsRebuild " +
      "одним UPDATE site — уходит в той же уборке этапа 3.",
  },
];

// ---------------------------------------------------------------------------
// 3. scripts/: разовые исторические скрипты. Сигнал ýже, чем в src/ —
//    правка ревизии НА МЕСТЕ (UPDATE), не любое упоминание: одноразовый
//    скрипт, который вставляет новую ревизию сырым SQL (INSERT/JOIN), не
//    нарушает И1 (правки на месте нет), а разбирать раз навсегда прогнанные
//    миграции на «перевести на порт» — нет смысла (порта на момент их
//    прогона не существовало, повторно их никто не запустит).
// ---------------------------------------------------------------------------

const SCRIPT_UPDATE_SIGNALS: RegExp[] = [
  /\.update\(\s*(?:schema\.)?siteRevision\s*\)/g, // drizzle ORM
  /\bupdate\s+"?site_revision"?\s/gi, // сырой SQL
];

function countScriptUpdates(code: string): number {
  const clean = stripComments(code);
  return SCRIPT_UPDATE_SIGNALS.reduce(
    (sum, re) => sum + (clean.match(re)?.length ?? 0),
    0,
  );
}

const SCRIPT_UPDATE_ALLOWANCES: Allowance[] = [
  {
    path: "backfill-theme-colorschemes.ts",
    count: 1,
    reason:
      "Phase 0b (апрель 2026): замена legacy-схем цветов с бэкапом в " +
      "site_revision_prebackfill.",
  },
  {
    path: "rollback-theme-colorschemes.ts",
    count: 1,
    reason: "откат Phase 0b из site_revision_prebackfill.",
  },
  {
    path: "migrations/2026-06-05-rose-header-padding-32-to-24.mjs",
    count: 1,
    reason: "разовая миграция rose Header (июнь 2026).",
  },
  {
    path: "migrations/2026-06-05-rose-header-sitetitle-to-rose.mjs",
    count: 1,
    reason: "разовая миграция rose Header siteTitle (июнь 2026).",
  },
];

// ---------------------------------------------------------------------------

const SRC_FILES = walk(SRC_ROOT, /\.ts$/).map((rel) => ({
  rel,
  count: countMentions(readFileSync(resolve(SRC_ROOT, rel), "utf-8")),
}));
const POINTER_FILES = SRC_FILES.map(({ rel }) => ({
  rel,
  count: countPointerWrites(readFileSync(resolve(SRC_ROOT, rel), "utf-8")),
}));
const SCRIPT_FILES = walk(SCRIPTS_ROOT, /\.(ts|mjs|js)$/).map((rel) => ({
  rel,
  count: countScriptUpdates(readFileSync(resolve(SCRIPTS_ROOT, rel), "utf-8")),
}));

describe("таблица site_revision — только в src/content/", () => {
  it("ОПОРА: обход видит src/ и находит уже переведённые файлы", () => {
    expect(SRC_FILES.length).toBeGreaterThan(100);
    const rels = SRC_FILES.map((f) => f.rel);
    expect(rels).toContain("sites.service.ts");
    expect(rels).toContain("pages/pages.service.ts");
    expect(rels).not.toContain("content/document.adapter.ts");
    expect(
      countMentions("const x = schema.siteRevision.data; // schema.siteRevision в комментарии"),
    ).toBe(1);
    expect(countMentions("db.select().from(schema.siteRevision)")).toBe(1);
    expect(countMentions("tx.insert(schema.siteRevision).values(v)")).toBe(1);
  });

  it("новое прямое упоминание вне ALLOWANCES — красный", () => {
    const violators = SRC_FILES.filter(
      (f) => !ALLOWED_PATHS.has(f.rel) && f.count > 0,
    ).map((f) => `${f.rel}: ${f.count}`);
    expect(violators).toEqual([]);
  });

  it.each(ALLOWANCES.map((a) => [a.path, a] as const))(
    "запись белого списка точна: %s",
    (path, allowance) => {
      const found = SRC_FILES.find((f) => f.rel === path)?.count ?? 0;
      // Разошлось в любую сторону — либо завёлся новый читатель/писатель
      // рядом со старым, либо старый перевели на порт (запись протухла) —
      // оба случая требуют осознанного обновления ALLOWANCES.
      expect({ path, count: found }).toEqual({ path, count: allowance.count });
    },
  );

  it("указатель current_revision_id: новое место вне POINTER_ALLOWANCES — красный", () => {
    const allowed = new Set(POINTER_ALLOWANCES.map((a) => a.path));
    const violators = POINTER_FILES.filter(
      (f) => !allowed.has(f.rel) && f.count > 0,
    ).map((f) => `${f.rel}: ${f.count}`);
    expect(violators).toEqual([]);
  });

  it.each(POINTER_ALLOWANCES.map((a) => [a.path, a] as const))(
    "указатель: исключение точно — %s",
    (path, allowance) => {
      const found = POINTER_FILES.find((f) => f.rel === path)?.count ?? 0;
      expect({ path, count: found }).toEqual({ path, count: allowance.count });
    },
  );

  it("scripts/: новый скрипт, правящий ревизию НА МЕСТЕ (UPDATE), — красный", () => {
    const allowed = new Set(SCRIPT_UPDATE_ALLOWANCES.map((a) => a.path));
    const violators = SCRIPT_FILES.filter(
      (f) => !allowed.has(f.rel) && f.count > 0,
    ).map((f) => `${f.rel}: ${f.count}`);
    expect(violators).toEqual([]);
  });

  it.each(SCRIPT_UPDATE_ALLOWANCES.map((a) => [a.path, a] as const))(
    "scripts/: историческое исключение точно — %s",
    (path, allowance) => {
      const found = SCRIPT_FILES.find((f) => f.rel === path)?.count ?? 0;
      expect({ path, count: found }).toEqual({ path, count: allowance.count });
    },
  );
});
