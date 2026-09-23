/**
 * Нормализация золотых снимков (волна 0, кусок 0.3).
 *
 * `golden.spec.ts` строит снимок через мок БД с детерминированными
 * фикстурами (`"rev-1"`, `"site-1"`, `new Date(0)`), поэтому сам тест
 * стабилен и без нормализации. Но контракт, который в волне 1 обязан
 * повторить `DocumentAdapter.load()`, — это НЕ конкретные значения id/даты
 * (в проде это реальные uuid и timestamp'ы), а их СОСТАВ: какие волатильные
 * поля вообще присутствуют в ответе `getRevision()`. Поэтому:
 *
 *  - поля конверта ревизии (`item.id`, `item.siteId`, `item.createdAt`,
 *    `item.updatedAt`) заменяются на плейсхолдеры по имени поля — не
 *    выкидываются, чтобы диф снимка ловил и появление, и пропажу поля;
 *  - внутри `item.data` (контент страниц/секций) ключи НЕ трогаем — там
 *    строки вида `"Header-1"`, `"p-1"`, `"page-about"` — это часть канона
 *    контента, а не случайные id. Ловим только значения, которые ПО ФОРМЕ
 *    похожи на настоящий uuid или ISO-дату — страховка на случай, если
 *    where-то внутри данных появится реальный волатильный идентификатор.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

/** Поля конверта ревизии, волатильные в проде (id/дата), с плейсхолдером по
 * имени поля. Ключ остаётся на месте — пропадёт/появится поле, диф увидит. */
const ENVELOPE_PLACEHOLDERS: Record<string, string> = {
  id: "<REVISION_ID>",
  siteId: "<SITE_ID>",
  createdAt: "<DATE>",
  updatedAt: "<DATE>",
};

function looksVolatile(value: string): string | null {
  if (UUID_RE.test(value)) return "<UUID>";
  if (ISO_DATE_RE.test(value)) return "<DATE>";
  return null;
}

/** Глубокая нормализация значений (без переименования/удаления ключей):
 * Date → "<DATE>", строки-uuid → "<UUID>", строки-ISO-дату → "<DATE>". */
function normalizeValuesDeep(value: unknown): unknown {
  if (value instanceof Date) return "<DATE>";
  if (typeof value === "string") return looksVolatile(value) ?? value;
  if (Array.isArray(value)) return value.map(normalizeValuesDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeValuesDeep(v);
    }
    return out;
  }
  return value;
}

/** Рекурсивно сортирует ключи объектов (элементы массивов не трогает —
 * порядок страниц/блоков сам является частью контракта). */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Нормализует ответ `getRevision()` (`{ item: {...} }`) для снимка:
 * конверт ревизии — по имени поля, `item.data` — по форме значения,
 * ключи всего дерева — отсортированы для стабильного диффа.
 */
export function normalizeGoldenSnapshot(result: {
  item: Record<string, unknown>;
}): unknown {
  const { item } = result;
  const envelope: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === "data") continue;
    envelope[key] =
      key in ENVELOPE_PLACEHOLDERS && value != null
        ? ENVELOPE_PLACEHOLDERS[key]
        : normalizeValuesDeep(value);
  }
  envelope.data = normalizeValuesDeep(item.data);
  return sortKeysDeep({ item: envelope });
}

/** Сериализация снимка в pretty JSON с отсортированными ключами — единый
 * формат и для записи (`UPDATE_GOLDEN=1`), и для сравнения при обычном прогоне. */
export function toGoldenJson(result: {
  item: Record<string, unknown>;
}): string {
  return JSON.stringify(normalizeGoldenSnapshot(result), null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Самопроверка нормализатора.
//
// Jest по умолчанию считает тестовым файлом ЛЮБОЙ `.ts` внутри каталога
// `__tests__/**` (testMatch `**/__tests__/**/*.[jt]s?(x)`) — путь этого файла
// (`src/__tests__/golden/normalize.ts`) неизбежно под него попадает, и без
// хотя бы одного `it()` прогон валится с «must contain at least one test».
// Раз файл всё равно обязан быть исполняемым тестовым модулем — пусть
// проверяет сам себя, а не просто существует ради обхода ограничения.
//
// Гвард `isOwnTestFile`: `golden.spec.ts` тоже импортирует этот модуль
// (`import { normalizeGoldenSnapshot } from "./normalize"`), и Jest заново
// исполняет top-level код модуля в РЕАЛМЕ каждого файла, который его
// импортирует — без гварда describe() ниже зарегистрировался бы ВТОРОЙ раз
// внутри golden.spec.ts. `expect.getState().testPath` всегда указывает на
// файл, который Jest СЕЙЧАС гоняет как тест (проверено эмпирически), а
// `__filename` — на физический путь этого модуля; совпадение путей означает
// «меня грузят как собственный тестовый файл, а не как импорт».
// ---------------------------------------------------------------------------
function isOwnTestFile(): boolean {
  try {
    const testPath = (globalThis as any).expect?.getState?.().testPath;
    return testPath === __filename;
  } catch {
    return false;
  }
}

if (isOwnTestFile())
  describe("golden/normalize.ts: нормализация снимка", () => {
    it("конверт ревизии (id/siteId/createdAt) заменяется плейсхолдерами по имени поля", () => {
      const result = {
        item: {
          id: "rev-1",
          siteId: "site-1",
          createdAt: new Date(0),
          data: { pages: [] },
        },
      };
      const normalized = normalizeGoldenSnapshot(result) as any;
      expect(normalized.item.id).toBe("<REVISION_ID>");
      expect(normalized.item.siteId).toBe("<SITE_ID>");
      expect(normalized.item.createdAt).toBe("<DATE>");
    });

    it("канон-id внутри data (Header-1, p-1) остаётся как есть — это не волатильное поле", () => {
      const result = {
        item: {
          id: "rev-1",
          data: {
            pagesData: {
              home: {
                content: [{ type: "Header", props: { id: "Header-1" } }],
              },
              "p-1": { text: "О нас мерчанта" },
            },
          },
        },
      };
      const normalized = normalizeGoldenSnapshot(result) as any;
      expect(normalized.item.data.pagesData.home.content[0].props.id).toBe(
        "Header-1",
      );
      expect(Object.keys(normalized.item.data.pagesData)).toContain("p-1");
    });

    it("строка-uuid и строка-ISO-дата где угодно внутри data распознаются по форме", () => {
      const result = {
        item: {
          id: "rev-1",
          data: {
            nested: {
              realUuid: "550e8400-e29b-41d4-a716-446655440000",
              realDate: "2026-09-22T10:00:00.000Z",
              plain: "page-about",
            },
          },
        },
      };
      const normalized = normalizeGoldenSnapshot(result) as any;
      expect(normalized.item.data.nested.realUuid).toBe("<UUID>");
      expect(normalized.item.data.nested.realDate).toBe("<DATE>");
      expect(normalized.item.data.nested.plain).toBe("page-about");
    });

    it("ключи объектов сортируются рекурсивно, элементы массивов — по месту", () => {
      const result = {
        item: {
          id: "rev-1",
          data: {
            b: 1,
            a: { z: 1, y: 2 },
            pages: [{ id: "second" }, { id: "first" }],
          },
        },
      };
      const normalized = normalizeGoldenSnapshot(result) as any;
      expect(Object.keys(normalized.item.data)).toEqual(["a", "b", "pages"]);
      expect(Object.keys(normalized.item.data.a)).toEqual(["y", "z"]);
      expect(normalized.item.data.pages.map((p: any) => p.id)).toEqual([
        "second",
        "first",
      ]);
    });

    it("toGoldenJson выдаёт pretty JSON с отступом 2 и завершающим переводом строки", () => {
      const json = toGoldenJson({ item: { id: "rev-1", data: { a: 1 } } });
      expect(json).toBe(
        '{\n  "item": {\n    "data": {\n      "a": 1\n    },\n    "id": "<REVISION_ID>"\n  }\n}\n',
      );
    });
  });
