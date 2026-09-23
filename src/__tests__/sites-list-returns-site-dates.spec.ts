import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Владелец 20.09, четвёртый заход по одной карточке: «конструктор меняли
 * сегодня, а там 14 мая написано».
 *
 * КОРЕНЬ, который я обязан был найти сразу. Метод `sites.list` — тот, которым
 * питается карточка темы в админке — отдавал `createdAt` МАГАЗИНА и обе даты
 * ТЕМЫ, но НЕ отдавал `updatedAt` магазина. Поэтому:
 *   - «Добавлено» показывало дату появления темы в системе — одну на всех;
 *   - когда я переключил строки на магазин, поля в ответе не оказалось,
 *     карточка падала на запасное `createdAt`, и обе строки встали в «14 мая».
 *
 * При этом дата магазина живая: `createRevision` делает
 * `.set({ currentRevisionId: id, updatedAt: new Date() })` при КАЖДОМ
 * сохранении контента. Терялась она ровно на выдаче.
 *
 * Мой процессный промах: трижды менял источник даты, ни разу не проверив, что
 * реально приходит в ответе. Гард закрывает именно это — состав полей выдачи.
 */

const ROOT = resolve(__dirname, "..", "..");
const SERVICE = readFileSync(resolve(ROOT, "src/sites.service.ts"), "utf-8");
// Волна 1 порта контента: createRevision делегирует запись в
// content/document.adapter.ts (DocumentAdapter.save) — сам `.set(...)`,
// который двигает updatedAt магазина, живёт теперь там.
const DOCUMENT_ADAPTER = readFileSync(
  resolve(ROOT, "src/content/document.adapter.ts"),
  "utf-8",
);

/** Тело выборки метода `list` — того, что уходит в админку. */
const listSelect = (() => {
  const start = SERVICE.indexOf("  async list(tenantId");
  const from = SERVICE.indexOf(".from(schema.site)", start);
  return SERVICE.slice(start, from);
})();

describe("список сайтов отдаёт даты САМОГО магазина", () => {
  it("метод списка найден", () => {
    expect(listSelect.length).toBeGreaterThan(100);
  });

  it("отдаёт дату создания магазина", () => {
    expect(listSelect).toMatch(/createdAt: schema\.site\.createdAt/);
  });

  it("отдаёт дату обновления магазина — она меняется при правке контента", () => {
    expect(listSelect).toMatch(/updatedAt: schema\.site\.updatedAt/);
  });

  it("отдаёт дату выбора темы этим магазином", () => {
    expect(listSelect).toMatch(/themeAppliedAt: schema\.site\.themeAppliedAt/);
  });

  it("дата магазина действительно обновляется при сохранении контента", () => {
    // Волна 1: логика переехала из sites.service.ts в
    // content/document.adapter.ts (DocumentAdapter.save), сама выдача
    // sites.list — ниже, в описанных выше проверках — не изменилась.
    expect(DOCUMENT_ADAPTER).toMatch(
      /\.set\(\{ currentRevisionId: (id|revisionId), updatedAt: new Date\(\) \}\)/,
    );
  });
});

describe("саботаж: гард ловит потерю полей на выдаче", () => {
  it("выдача без updatedAt магазина — красный", () => {
    const naive = "createdAt: schema.site.createdAt,\n theme: {";
    expect(/updatedAt: schema\.site\.updatedAt/.test(naive)).toBe(false);
  });

  it("выдача без themeAppliedAt — красный", () => {
    const naive = "updatedAt: schema.site.updatedAt,";
    expect(/themeAppliedAt: schema\.site\.themeAppliedAt/.test(naive)).toBe(false);
  });
});
